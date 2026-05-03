import { TOKENS } from "@/lib/tokens";

export function LiveDot({ size = 8 }: { size?: number }) {
  return (
    <span style={{ display: "inline-block", position: "relative", width: size, height: size }}>
      <span
        style={{
          position: "absolute",
          inset: 0,
          background: TOKENS.pos,
          borderRadius: "50%",
          boxShadow: `0 0 8px ${TOKENS.pos}`,
        }}
      />
      <span
        style={{
          position: "absolute",
          inset: 0,
          background: TOKENS.pos,
          borderRadius: "50%",
          animation: "livePulse 1.6s ease-out infinite",
        }}
      />
    </span>
  );
}
