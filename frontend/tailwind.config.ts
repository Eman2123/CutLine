import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0A0A0A",
        paper: "#FFFBEF",
        sun: "#FFE14D",
        alarm: "#FF5A4D",
        mint: "#3DDC84",
        sky: "#6C8CFF",
      },
      fontFamily: {
        display: ['"Space Grotesk"', "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ['"Space Mono"', "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        hard: "8px 8px 0 #0A0A0A",
        "hard-sm": "4px 4px 0 #0A0A0A",
        "hard-lg": "12px 12px 0 #FF5A4D",
      },
    },
  },
  plugins: [],
};
export default config;
