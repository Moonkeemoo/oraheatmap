import { TOKENS } from "@/lib/tokens";

export function MiniSpark({
  values,
  color,
  w = 84,
  h = 26,
}: {
  values: ReadonlyArray<number>;
  color: string;
  w?: number;
  h?: number;
}) {
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const range = max - min || 1;
  const step = w / (values.length - 1 || 1);
  const pts: ReadonlyArray<[number, number]> = values.map((v, i) => [
    i * step,
    h - ((v - min) / range) * (h - 3) - 1.5,
  ]);
  const d = pts.map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
  const dArea = d + ` L${w},${h} L0,${h} Z`;
  const last = pts[pts.length - 1];
  const id = "sg-" + color.replace(/[^a-z0-9]/gi, "") + "-" + values.length;
  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.32" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={dArea} fill={`url(#${id})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" />
      {last && <circle cx={last[0]} cy={last[1]} r="2" fill={color} stroke={TOKENS.bg} strokeWidth="1" />}
    </svg>
  );
}
