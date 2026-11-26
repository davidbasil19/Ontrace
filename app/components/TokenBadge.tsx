/* eslint-disable @next/next/no-img-element */
export default function TokenBadge({ icon, symbol, sub, size = 28 }: { icon?: string | null; symbol: string; sub?: string; size?: number }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      {icon ? (
        <img src={icon} alt="" width={size} height={size} className="shrink-0 rounded-full" />
      ) : (
        <span style={{ width: size, height: size }} className="grid shrink-0 place-items-center rounded-full bg-line text-[10px] font-bold">
          {symbol.slice(0, 3)}
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate font-semibold">{symbol}</span>
        {sub && <span className="block truncate text-xs text-muted">{sub}</span>}
      </span>
    </span>
  );
}
