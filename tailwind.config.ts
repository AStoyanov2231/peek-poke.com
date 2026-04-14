import type { Config } from "tailwindcss";

const config: Config = {
	content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
	theme: {
		extend: {
			colors: {
				primary: {
					DEFAULT: 'hsl(var(--primary))',
					foreground: 'hsl(var(--primary-foreground))'
				},
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				card: {
					DEFAULT: 'hsl(var(--card))',
					foreground: 'hsl(var(--card-foreground))'
				},
				popover: {
					DEFAULT: 'hsl(var(--popover))',
					foreground: 'hsl(var(--popover-foreground))'
				},
				secondary: {
					DEFAULT: 'hsl(var(--secondary))',
					foreground: 'hsl(var(--secondary-foreground))'
				},
				muted: {
					DEFAULT: 'hsl(var(--muted))',
					foreground: 'hsl(var(--muted-foreground))'
				},
				accent: {
					DEFAULT: 'hsl(var(--accent))',
					foreground: 'hsl(var(--accent-foreground))'
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive))',
					foreground: 'hsl(var(--destructive-foreground))'
				},
				warm: {
					DEFAULT: 'hsl(var(--warm))',
					foreground: 'hsl(var(--warm-foreground))'
				},
				success: {
					DEFAULT: 'hsl(var(--success))',
					foreground: 'hsl(var(--success-foreground))'
				},
				'cat-pink': {
					DEFAULT: 'hsl(var(--cat-pink))',
					foreground: 'hsl(var(--cat-pink-foreground))'
				},
				border: 'hsl(var(--border))',
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
				'neu-sunken': 'hsl(var(--neu-sunken))',
			},
			fontFamily: {
				display: ['var(--font-display)', 'sans-serif'],
				sans: ['var(--font-sans)', 'system-ui', '-apple-system', 'sans-serif'],
			},
			borderRadius: {
				sm: '12px',
				md: '16px',
				lg: '24px',
				xl: '32px',
				pill: '100px',
			},
			boxShadow: {
				'neu-raised': '6px 6px 12px #A3B1C6, -3px -3px 6px #FFFFFF',
				'neu-raised-sm': '3px 3px 6px #A3B1C6, -3px -3px 6px #FFFFFF',
				'neu-inset': 'inset 4px 4px 8px #A3B1C6, inset -2px -2px 4px #FFFFFF',
				'neu-floating': '10px 10px 20px #A3B1C6, -5px -5px 10px #FFFFFF',
				'neu-inset-sm': 'inset 2px 2px 4px #A3B1C6, inset -2px -2px 4px #FFFFFF',
			},
			animation: {
				'pulse-soft': 'pulse-soft 2s ease-in-out infinite',
				'confetti': 'confetti 0.8s ease-out forwards',
				'spin-slow': 'spin 3s linear infinite',
			},
			keyframes: {
				'pulse-soft': {
					'0%, 100%': { opacity: '1' },
					'50%': { opacity: '0.5' },
				},
				'confetti': {
					'0%': { transform: 'translateY(0) rotate(0deg)', opacity: '1' },
					'100%': { transform: 'translateY(-200px) rotate(720deg)', opacity: '0' },
				},
			},
		}
	},
	plugins: [require("tailwindcss-animate")],
};
export default config;
