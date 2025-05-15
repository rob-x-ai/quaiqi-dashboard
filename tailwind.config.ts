import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px'
      }
    },
    extend: {
      colors: {
        // Brand colors
        'quai-red': '#E22901',
        'pure-black': '#000000',
        'dark-grey': '#1a1a1a',
        'mid-grey': '#262626',
        'light-grey': '#404040',
        'off-white': '#E2E2E2',
        'pure-white': '#FFFFFF',
        
        // System colors mapped to brand colors
        border: '#1a1a1a', // dark-grey
        input: '#1a1a1a', // dark-grey
        ring: '#E22901', // QUAI_RED
        background: '#000000', // PURE_BLACK
        foreground: '#FFFFFF', // PURE_WHITE
        primary: {
          DEFAULT: '#E22901', // QUAI_RED
          foreground: '#FFFFFF' // PURE_WHITE
        },
        secondary: {
          DEFAULT: '#1a1a1a', // dark-grey
          foreground: '#FFFFFF' // PURE_WHITE
        },
        destructive: {
          DEFAULT: '#E22901', // QUAI_RED
          foreground: '#FFFFFF' // PURE_WHITE
        },
        muted: {
          DEFAULT: '#262626', // mid-grey
          foreground: '#E2E2E2' // OFF_WHITE
        },
        accent: {
          DEFAULT: '#404040', // light-grey
          foreground: '#FFFFFF' // PURE_WHITE
        },
        popover: {
          DEFAULT: '#1a1a1a', // dark-grey
          foreground: '#FFFFFF' // PURE_WHITE
        },
        card: {
          DEFAULT: '#1a1a1a', // dark-grey
          foreground: '#FFFFFF' // PURE_WHITE
        },
        crypto: {
          quai: '#E22901',    // QUAI_RED
          qi: '#1a1a1a',      // dark-grey
          graph: '#404040',   // light-grey
        }
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)'
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' }
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' }
        },
        'pulse-gentle': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-5px)' },
        }
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'pulse-gentle': 'pulse-gentle 2s ease-in-out infinite',
        'float': 'float 3s ease-in-out infinite'
      }
    }
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
