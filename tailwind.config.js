/** @type {import('tailwindcss').Config} */
export default {
    content: [
        './index.html',
        './src/renderer/**/*.{js,jsx,ts,tsx}',
    ],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                'atc-bg': '#0a0e17',
                'atc-surface': '#111827',
                'atc-surface-2': '#1a2332',
                'atc-border': '#1e2d3d',
                'atc-accent': '#3b82f6',
                'atc-accent-dim': '#1e40af',
                'atc-green': '#22c55e',
                'atc-red': '#ef4444',
                'atc-amber': '#f59e0b',
                'atc-cyan': '#06b6d4',
                'atc-text': '#e2e8f0',
                'atc-text-dim': '#94a3b8',
                'atc-text-muted': '#64748b',
            },
            fontFamily: {
                mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
                sans: ['Inter', 'system-ui', 'sans-serif'],
            },
            animation: {
                'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                'glow': 'glow 2s ease-in-out infinite alternate',
                'slide-up': 'slideUp 0.3s ease-out',
                'fade-in': 'fadeIn 0.3s ease-out',
            },
            keyframes: {
                glow: {
                    '0%': { boxShadow: '0 0 5px rgba(59, 130, 246, 0.3)' },
                    '100%': { boxShadow: '0 0 20px rgba(59, 130, 246, 0.6)' },
                },
                slideUp: {
                    '0%': { transform: 'translateY(10px)', opacity: '0' },
                    '100%': { transform: 'translateY(0)', opacity: '1' },
                },
                fadeIn: {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
            },
        },
    },
    plugins: [],
};
