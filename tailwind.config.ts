import type { Config } from "tailwindcss";
import { cssVars, tailwindRadii, tailwindShadows } from "./packages/design/src/tailwind";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: cssVars,
      fontFamily: {
        display: ["var(--font-display)", "ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
        sans: ["var(--font-display)", "ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SF Mono", "Menlo", "monospace"],
      },
      borderRadius: tailwindRadii,
      boxShadow: tailwindShadows,
      animation: {
        "pulse-soft": "pulse-soft 2s ease-in-out infinite",
        confetti: "confetti 0.8s ease-out forwards",
        "spin-slow": "spin 3s linear infinite",
      },
      keyframes: {
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
        confetti: {
          "0%": { transform: "translateY(0) rotate(0deg)", opacity: "1" },
          "100%": { transform: "translateY(-200px) rotate(720deg)", opacity: "0" },
        },
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
