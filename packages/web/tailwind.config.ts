import type { Config } from "tailwindcss";

// Tailwind is here mostly for utility classes (flex, gap, etc) — the heavy
// styling lives inline because the v3 reference relies on exact pixel values
// and dynamic colors driven by data, neither of which Tailwind expresses
// cleanly. Theme colors mirror lib/tokens.ts so utility-driven layouts stay
// in sync.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0d1117",
        panel: "#161b22",
        panel2: "#1c2128",
        border: "#21262d",
        borderHi: "#30363d",
        text: "#e6edf3",
        textSec: "#7d8590",
        textMuted: "#8b949e",
        accent: "#f0b429",
        link: "#58a6ff",
        pos: "#3fb950",
        neg: "#f85149",
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', '"SF Mono"', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
export default config;
