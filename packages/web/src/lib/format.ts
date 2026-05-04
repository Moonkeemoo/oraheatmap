// Ported 1:1 from Reference/heatmap-shared.jsx.

export function fmtMoney(n: number): string {
  const abs = Math.abs(n);
  let s: string;
  if (abs >= 1e6) s = (n / 1e6).toFixed(1) + "M";
  else if (abs >= 1e3) s = (n / 1e3).toFixed(abs >= 1e4 ? 0 : 1) + "k";
  else s = String(Math.round(n));
  return (n > 0 ? "+$" : n < 0 ? "-$" : "$") + s.replace("-", "");
}

export function fmtCellValue(n: number): string {
  const abs = Math.abs(n);
  // Roll over to "M" once the number passes a million — keeps the cell
  // text from blowing past the badge ("5784k" → "5.8M"). One decimal
  // below 10M for precision, integer at 10M+.
  if (abs >= 1e6) return (n / 1e6).toFixed(abs >= 1e7 ? 0 : 1) + "M";
  if (abs >= 1e3) return (n / 1e3).toFixed(abs >= 1e4 ? 0 : 1) + "k";
  return String(Math.round(n));
}

export function fmtMoneyShort(n: number): string {
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return "$" + (n / 1e3).toFixed(0) + "k";
  return "$" + Math.round(n);
}
