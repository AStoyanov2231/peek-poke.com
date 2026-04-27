import type { Config } from "tailwindcss";

const config: Config = {
	content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
	theme: {
		extend: {
			colors: {
				// ── New ink scale ──
				ink: {
					0: "var(--ink-0)",
					1: "var(--ink-1)",
					2: "var(--ink-2)",
					3: "var(--ink-3)",
					4: "var(--ink-4)",
					5: "var(--ink-5)",
					6: "var(--ink-6)",
					7: "var(--ink-7)",
					8: "var(--ink-8)",
					9: "var(--ink-9)",
				},
				// ── Primary: Electric Indigo ──
				primary: {
					DEFAULT:    "var(--primary-500)",
					foreground: "#ffffff",
					50:  "var(--primary-50)",
					100: "var(--primary-100)",
					200: "var(--primary-200)",
					400: "var(--primary-400)",
					500: "var(--primary-500)",
					600: "var(--primary-600)",
					700: "var(--primary-700)",
				},
				// ── Accent: Signal Coral ──
				accent: {
					DEFAULT:    "var(--accent-500)",
					foreground: "#ffffff",
					400: "var(--accent-400)",
					500: "var(--accent-500)",
					600: "var(--accent-600)",
				},
				// ── Semantic ──
				success: {
					DEFAULT:    "var(--success-500)",
					foreground: "#ffffff",
					500: "var(--success-500)",
					600: "var(--success-600)",
				},
				danger: {
					DEFAULT:    "var(--danger-500)",
					foreground: "#ffffff",
					500: "var(--danger-500)",
				},
				warn: {
					DEFAULT:    "var(--warn-500)",
					500: "var(--warn-500)",
				},
				// ── Surfaces ──
				surface: "var(--surface)",
				hairline: "var(--hairline)",
				// ── shadcn compat aliases ──
				background: "var(--bg)",
				foreground: "var(--ink-8)",
				card: {
					DEFAULT:    "var(--surface)",
					foreground: "var(--ink-8)",
				},
				popover: {
					DEFAULT:    "var(--surface)",
					foreground: "var(--ink-8)",
				},
				secondary: {
					DEFAULT:    "var(--ink-2)",
					foreground: "var(--ink-7)",
				},
				muted: {
					DEFAULT:    "var(--ink-2)",
					foreground: "var(--ink-5)",
				},
				destructive: {
					DEFAULT:    "var(--danger-500)",
					foreground: "#ffffff",
				},
				border: "var(--hairline)",
				input:  "var(--hairline)",
				ring:   "var(--primary-500)",
			},
			fontFamily: {
				display: ["var(--font-display)", "ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
				sans:    ["var(--font-display)", "ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
				mono:    ["var(--font-mono)", "ui-monospace", "SF Mono", "Menlo", "monospace"],
			},
			borderRadius: {
				xs:   "6px",
				sm:   "10px",
				md:   "14px",
				lg:   "20px",
				xl:   "28px",
				pill: "999px",
			},
			boxShadow: {
				"e-0": "var(--e-0)",
				"e-1": "var(--e-1)",
				"e-2": "var(--e-2)",
				"e-3": "var(--e-3)",
			},
			animation: {
				"pulse-soft": "pulse-soft 2s ease-in-out infinite",
				"confetti":   "confetti 0.8s ease-out forwards",
				"spin-slow":  "spin 3s linear infinite",
			},
			keyframes: {
				"pulse-soft": {
					"0%, 100%": { opacity: "1" },
					"50%":      { opacity: "0.5" },
				},
				"confetti": {
					"0%":   { transform: "translateY(0) rotate(0deg)", opacity: "1" },
					"100%": { transform: "translateY(-200px) rotate(720deg)", opacity: "0" },
				},
			},
		},
	},
	plugins: [require("tailwindcss-animate")],
};
export default config;
