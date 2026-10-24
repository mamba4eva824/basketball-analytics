/** Render-time formatting. Values are stored as 0–1 decimals / raw numbers. */

export const DASH = "—";

export function fmtPct(val: number | null | undefined, digits = 1): string {
  if (val == null || Number.isNaN(val)) return DASH;
  return `${(val * 100).toFixed(digits)}%`;
}

export function fmtNum(val: number | null | undefined, digits = 1): string {
  if (val == null || Number.isNaN(val)) return DASH;
  return val.toFixed(digits);
}

export function fmtSigned(val: number | null | undefined, digits = 1): string {
  if (val == null || Number.isNaN(val)) return DASH;
  const s = val.toFixed(digits);
  return val > 0 ? `+${s}` : s;
}

export function ordinal(n: number | null | undefined): string {
  if (n == null) return DASH;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

/** Tailwind text colour for a 1–N rank: top third green, bottom third red. */
export function rankTone(rank: number | null | undefined, of = 30): string {
  if (rank == null) return "text-text-faint";
  if (rank <= Math.round(of / 3)) return "text-green-500";
  if (rank > of - Math.round(of / 3)) return "text-red-400";
  return "text-text-muted";
}
