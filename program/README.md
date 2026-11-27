# Optional upgrade: on-chain OTC program

The live site does **not** need this. It settles deals with pre-signed transactions and Solana's built-in programs (see the root README).

This Anchor program makes *open* deals instant: no seller confirmation step. It compiles and passed 33 end-to-end checks. Deploying it costs about 4 SOL in refundable storage deposit, or about 0.5 SOL after a slim rewrite. Keep it for when funding allows.
