//! OnTrace OTC — non-custodial OTC desk for Solana tokens.
//!
//! How settlement works (no escrow):
//!   * `create_offer` records the deal terms in an Offer PDA and approves a
//!     program-owned delegate PDA to move *only* the offered tokens out of the
//!     maker's token account. The tokens never leave the maker's wallet.
//!   * `take_offer_sol` / `take_offer_token` move the taker's payment to the
//!     maker and the maker's tokens to the taker in one atomic transaction.
//!     If either leg fails (maker moved the tokens, taker is short), the whole
//!     transaction reverts and nobody loses anything.
//!   * `cancel_offer` closes the offer and shrinks the delegate allowance.
//!   * `close_expired` lets anyone clean up an expired offer (rent goes back
//!     to the maker).
//!
//! The delegate PDA can only spend through a valid, unexpired Offer whose
//! maker owns the source account, so an over-sized leftover allowance cannot
//! be abused.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::program_option::COption;
use anchor_lang::system_program;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{
    self, Approve, Mint, Revoke, TokenAccount, TokenInterface, TransferChecked,
};

declare_id!("BDyKHqh2MgQSSjFTSeL1i47LeVyezsTqGMDneo846eN6");

pub const OFFER_SEED: &[u8] = b"offer";
pub const DELEGATE_SEED: &[u8] = b"delegate";
/// Longest an offer may stay open.
pub const MAX_DURATION_SECS: i64 = 30 * 24 * 60 * 60;
/// Wrapped SOL mint. As a `want_mint` it means "pay me native SOL".
pub const NATIVE_MINT: Pubkey = pubkey!("So11111111111111111111111111111111111111112");

#[program]
pub mod ontrace_otc {
    use super::*;

    /// Create an offer: "I give `give_amount` of `give_mint`, I want
    /// `want_amount` of `want_mint`". `taker` = Pubkey::default() for an open
    /// offer, or a specific wallet for a private deal.
    pub fn create_offer(
        ctx: Context<CreateOffer>,
        id: u64,
        give_amount: u64,
        want_amount: u64,
        taker: Pubkey,
        expires_at: i64,
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let maker = ctx.accounts.maker.key();
        let give_mint = ctx.accounts.give_mint.key();
        let want_mint = ctx.accounts.want_mint.key();

        require!(give_amount > 0 && want_amount > 0, OtcError::ZeroAmount);
        require!(expires_at > now, OtcError::InvalidExpiry);
        require!(expires_at - now <= MAX_DURATION_SECS, OtcError::InvalidExpiry);
        require_keys_neq!(give_mint, want_mint, OtcError::SameMint);
        require_keys_neq!(taker, maker, OtcError::SelfTrade);

        // want_mint must be native SOL or a real SPL / Token-2022 mint.
        if want_mint != NATIVE_MINT {
            let owner = ctx.accounts.want_mint.owner;
            require!(
                *owner == anchor_spl::token::ID || *owner == anchor_spl::token_2022::ID,
                OtcError::InvalidWantMint
            );
        }

        let src = &ctx.accounts.maker_give_account;
        require!(src.amount >= give_amount, OtcError::InsufficientBalance);

        // Grow the existing allowance if our delegate is already set,
        // otherwise (re)point the delegate at our PDA.
        let delegate_key = ctx.accounts.delegate.key();
        let allowance = match src.delegate {
            COption::Some(d) if d == delegate_key => src
                .delegated_amount
                .checked_add(give_amount)
                .ok_or(OtcError::Overflow)?,
            _ => give_amount,
        };
        token_interface::approve(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Approve {
                    to: src.to_account_info(),
                    delegate: ctx.accounts.delegate.to_account_info(),
                    authority: ctx.accounts.maker.to_account_info(),
                },
            ),
            allowance,
        )?;

        ctx.accounts.offer.set_inner(Offer {
            maker,
            id,
            give_mint,
            give_amount,
            want_mint,
            want_amount,
            taker,
            created_at: now,
            expires_at,
            bump: ctx.bumps.offer,
        });

        emit!(OfferCreated {
            offer: ctx.accounts.offer.key(),
            maker,
            give_mint,
            give_amount,
            want_mint,
            want_amount,
            taker,
            expires_at,
        });
        Ok(())
    }

    /// Take an offer whose payment side is native SOL.
    pub fn take_offer_sol(ctx: Context<TakeOfferSol>) -> Result<()> {
        let offer = &ctx.accounts.offer;
        check_takeable(offer, &ctx.accounts.taker.key())?;
        require_keys_eq!(offer.want_mint, NATIVE_MINT, OtcError::WrongTakeInstruction);

        // Leg 1: taker pays SOL to maker.
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.taker.to_account_info(),
                    to: ctx.accounts.maker.to_account_info(),
                },
            ),
            offer.want_amount,
        )?;

        // Leg 2: maker's tokens to taker via delegate PDA.
        let bump = ctx.bumps.delegate;
        transfer_from_maker(
            &ctx.accounts.give_token_program,
            &ctx.accounts.maker_give_account,
            &ctx.accounts.give_mint,
            &ctx.accounts.taker_give_account,
            &ctx.accounts.delegate,
            bump,
            offer.give_amount,
        )?;

        emit_taken(offer, ctx.accounts.offer.key(), ctx.accounts.taker.key());
        Ok(())
    }

    /// Take an offer whose payment side is an SPL / Token-2022 token
    /// (USDC or any other mint).
    pub fn take_offer_token(ctx: Context<TakeOfferToken>) -> Result<()> {
        let offer = &ctx.accounts.offer;
        check_takeable(offer, &ctx.accounts.taker.key())?;
        require_keys_neq!(offer.want_mint, NATIVE_MINT, OtcError::WrongTakeInstruction);

        // Leg 1: taker pays tokens to maker.
        token_interface::transfer_checked(
            CpiContext::new(
                ctx.accounts.want_token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.taker_want_account.to_account_info(),
                    mint: ctx.accounts.want_mint.to_account_info(),
                    to: ctx.accounts.maker_want_account.to_account_info(),
                    authority: ctx.accounts.taker.to_account_info(),
                },
            ),
            offer.want_amount,
            ctx.accounts.want_mint.decimals,
        )?;

        // Leg 2: maker's tokens to taker via delegate PDA.
        let bump = ctx.bumps.delegate;
        transfer_from_maker(
            &ctx.accounts.give_token_program,
            &ctx.accounts.maker_give_account,
            &ctx.accounts.give_mint,
            &ctx.accounts.taker_give_account,
            &ctx.accounts.delegate,
            bump,
            offer.give_amount,
        )?;

        emit_taken(offer, ctx.accounts.offer.key(), ctx.accounts.taker.key());
        Ok(())
    }

    /// Maker cancels an offer (any time, expired or not).
    pub fn cancel_offer(ctx: Context<CancelOffer>) -> Result<()> {
        let src = &ctx.accounts.maker_give_account;
        let delegate_key = ctx.accounts.delegate.key();
        if let COption::Some(d) = src.delegate {
            if d == delegate_key {
                let remaining = src
                    .delegated_amount
                    .saturating_sub(ctx.accounts.offer.give_amount);
                if remaining == 0 {
                    token_interface::revoke(CpiContext::new(
                        ctx.accounts.token_program.to_account_info(),
                        Revoke {
                            source: src.to_account_info(),
                            authority: ctx.accounts.maker.to_account_info(),
                        },
                    ))?;
                } else {
                    token_interface::approve(
                        CpiContext::new(
                            ctx.accounts.token_program.to_account_info(),
                            Approve {
                                to: src.to_account_info(),
                                delegate: ctx.accounts.delegate.to_account_info(),
                                authority: ctx.accounts.maker.to_account_info(),
                            },
                        ),
                        remaining,
                    )?;
                }
            }
        }
        emit!(OfferClosed { offer: ctx.accounts.offer.key(), maker: ctx.accounts.maker.key(), expired: false });
        Ok(())
    }

    /// Anyone may close an expired offer; rent returns to the maker.
    pub fn close_expired(ctx: Context<CloseExpired>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        require!(now >= ctx.accounts.offer.expires_at, OtcError::NotExpired);
        emit!(OfferClosed { offer: ctx.accounts.offer.key(), maker: ctx.accounts.maker.key(), expired: true });
        Ok(())
    }
}

// ---------------------------------------------------------------- helpers

fn check_takeable(offer: &Offer, taker: &Pubkey) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    require!(now < offer.expires_at, OtcError::Expired);
    require_keys_neq!(*taker, offer.maker, OtcError::SelfTrade);
    if offer.taker != Pubkey::default() {
        require_keys_eq!(*taker, offer.taker, OtcError::NotAllowedTaker);
    }
    Ok(())
}

fn transfer_from_maker<'info>(
    token_program: &Interface<'info, TokenInterface>,
    from: &InterfaceAccount<'info, TokenAccount>,
    mint: &InterfaceAccount<'info, Mint>,
    to: &InterfaceAccount<'info, TokenAccount>,
    delegate: &UncheckedAccount<'info>,
    bump: u8,
    amount: u64,
) -> Result<()> {
    require!(
        from.delegate == COption::Some(delegate.key()) && from.delegated_amount >= amount,
        OtcError::AllowanceMissing
    );
    require!(from.amount >= amount, OtcError::MakerUnfunded);
    let seeds: &[&[u8]] = &[DELEGATE_SEED, &[bump]];
    token_interface::transfer_checked(
        CpiContext::new_with_signer(
            token_program.to_account_info(),
            TransferChecked {
                from: from.to_account_info(),
                mint: mint.to_account_info(),
                to: to.to_account_info(),
                authority: delegate.to_account_info(),
            },
            &[seeds],
        ),
        amount,
        mint.decimals,
    )
}

fn emit_taken(offer: &Offer, key: Pubkey, taker: Pubkey) {
    emit!(OfferTaken {
        offer: key,
        maker: offer.maker,
        taker,
        give_mint: offer.give_mint,
        give_amount: offer.give_amount,
        want_mint: offer.want_mint,
        want_amount: offer.want_amount,
    });
}

// ---------------------------------------------------------------- state

#[account]
#[derive(InitSpace)]
pub struct Offer {
    pub maker: Pubkey,
    pub id: u64,
    pub give_mint: Pubkey,
    pub give_amount: u64,
    pub want_mint: Pubkey,
    pub want_amount: u64,
    /// Pubkey::default() = open to anyone.
    pub taker: Pubkey,
    pub created_at: i64,
    pub expires_at: i64,
    pub bump: u8,
}

// ---------------------------------------------------------------- accounts
// NOTE: the web app builds these instructions by hand (app/lib/program.ts).
// If you reorder accounts or args here, update that file too.

#[derive(Accounts)]
#[instruction(id: u64)]
pub struct CreateOffer<'info> {
    #[account(mut)]
    pub maker: Signer<'info>,
    #[account(
        init,
        payer = maker,
        space = 8 + Offer::INIT_SPACE,
        seeds = [OFFER_SEED, maker.key().as_ref(), &id.to_le_bytes()],
        bump
    )]
    pub offer: Account<'info, Offer>,
    #[account(mint::token_program = token_program)]
    pub give_mint: InterfaceAccount<'info, Mint>,
    /// CHECK: native-mint sentinel or SPL/Token-2022 mint; validated in handler.
    pub want_mint: UncheckedAccount<'info>,
    #[account(
        mut,
        token::mint = give_mint,
        token::authority = maker,
        token::token_program = token_program
    )]
    pub maker_give_account: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: PDA used only as a token delegate.
    #[account(seeds = [DELEGATE_SEED], bump)]
    pub delegate: UncheckedAccount<'info>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct TakeOfferSol<'info> {
    #[account(mut)]
    pub taker: Signer<'info>,
    /// CHECK: bound to offer.maker via has_one.
    #[account(mut)]
    pub maker: UncheckedAccount<'info>,
    #[account(mut, close = maker, has_one = maker, has_one = give_mint)]
    pub offer: Box<Account<'info, Offer>>,
    #[account(mint::token_program = give_token_program)]
    pub give_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        token::mint = give_mint,
        token::authority = maker,
        token::token_program = give_token_program
    )]
    pub maker_give_account: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = taker,
        associated_token::mint = give_mint,
        associated_token::authority = taker,
        associated_token::token_program = give_token_program
    )]
    pub taker_give_account: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: PDA used only as a token delegate.
    #[account(seeds = [DELEGATE_SEED], bump)]
    pub delegate: UncheckedAccount<'info>,
    pub give_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct TakeOfferToken<'info> {
    #[account(mut)]
    pub taker: Signer<'info>,
    /// CHECK: bound to offer.maker via has_one.
    #[account(mut)]
    pub maker: UncheckedAccount<'info>,
    #[account(mut, close = maker, has_one = maker, has_one = give_mint, has_one = want_mint)]
    pub offer: Box<Account<'info, Offer>>,
    #[account(mint::token_program = give_token_program)]
    pub give_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mint::token_program = want_token_program)]
    pub want_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        token::mint = give_mint,
        token::authority = maker,
        token::token_program = give_token_program
    )]
    pub maker_give_account: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = taker,
        associated_token::mint = give_mint,
        associated_token::authority = taker,
        associated_token::token_program = give_token_program
    )]
    pub taker_give_account: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        token::mint = want_mint,
        token::authority = taker,
        token::token_program = want_token_program
    )]
    pub taker_want_account: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = taker,
        associated_token::mint = want_mint,
        associated_token::authority = maker,
        associated_token::token_program = want_token_program
    )]
    pub maker_want_account: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: PDA used only as a token delegate.
    #[account(seeds = [DELEGATE_SEED], bump)]
    pub delegate: UncheckedAccount<'info>,
    pub give_token_program: Interface<'info, TokenInterface>,
    pub want_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CancelOffer<'info> {
    #[account(mut)]
    pub maker: Signer<'info>,
    #[account(mut, close = maker, has_one = maker, has_one = give_mint)]
    pub offer: Account<'info, Offer>,
    #[account(mint::token_program = token_program)]
    pub give_mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        token::mint = give_mint,
        token::authority = maker,
        token::token_program = token_program
    )]
    pub maker_give_account: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: PDA used only as a token delegate.
    #[account(seeds = [DELEGATE_SEED], bump)]
    pub delegate: UncheckedAccount<'info>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct CloseExpired<'info> {
    pub closer: Signer<'info>,
    /// CHECK: bound to offer.maker via has_one; receives rent.
    #[account(mut)]
    pub maker: UncheckedAccount<'info>,
    #[account(mut, close = maker, has_one = maker)]
    pub offer: Account<'info, Offer>,
}

// ---------------------------------------------------------------- events

#[event]
pub struct OfferCreated {
    pub offer: Pubkey,
    pub maker: Pubkey,
    pub give_mint: Pubkey,
    pub give_amount: u64,
    pub want_mint: Pubkey,
    pub want_amount: u64,
    pub taker: Pubkey,
    pub expires_at: i64,
}

#[event]
pub struct OfferTaken {
    pub offer: Pubkey,
    pub maker: Pubkey,
    pub taker: Pubkey,
    pub give_mint: Pubkey,
    pub give_amount: u64,
    pub want_mint: Pubkey,
    pub want_amount: u64,
}

#[event]
pub struct OfferClosed {
    pub offer: Pubkey,
    pub maker: Pubkey,
    pub expired: bool,
}

// ---------------------------------------------------------------- errors

#[error_code]
pub enum OtcError {
    #[msg("Amounts must be greater than zero")]
    ZeroAmount,
    #[msg("Expiry must be in the future and within 30 days")]
    InvalidExpiry,
    #[msg("Give and want mints must differ")]
    SameMint,
    #[msg("You cannot trade with yourself")]
    SelfTrade,
    #[msg("Payment mint is not a valid token mint")]
    InvalidWantMint,
    #[msg("Not enough tokens to cover this offer")]
    InsufficientBalance,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("This offer has expired")]
    Expired,
    #[msg("This offer is reserved for a different wallet")]
    NotAllowedTaker,
    #[msg("Use the other take instruction for this payment type")]
    WrongTakeInstruction,
    #[msg("Maker's token allowance was revoked or changed")]
    AllowanceMissing,
    #[msg("Maker no longer holds enough tokens")]
    MakerUnfunded,
    #[msg("Offer has not expired yet")]
    NotExpired,
}
