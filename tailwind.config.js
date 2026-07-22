/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: '#0a0a0a',
        surface: '#141416',
        'surface-2': '#1c1c1f',
        elevated: '#252528',
        border: 'rgba(255,255,255,0.08)',
        'border-strong': 'rgba(255,255,255,0.12)',
        text: 'rgba(255,255,255,0.96)',
        'text-muted': 'rgba(255,255,255,0.60)',
        'text-faint': 'rgba(255,255,255,0.38)',
        primary: '#5b8def',
        'primary-hover': '#4a7de0',
        success: '#22a06b',
        warning: '#d99a2b',
        danger: '#d05c5c',
      },
      fontSize: {
        'title': ['20px', '24px'],
        'heading': ['18px', '22px'],
        'body': ['14px', '20px'],
        'secondary': ['12px', '16px'],
        'meta': ['11px', '14px'],
      },
      spacing: {
        '1': '4px',
        '2': '8px',
        '3': '12px',
        '4': '16px',
        '6': '24px',
        '8': '32px',
      },
      borderRadius: {
        'sm': '10px',
        'md': '12px',
        'lg': '14px',
        'xl': '16px',
      },
      transitionTimingFunction: {
        'standard': 'cubic-bezier(0.2, 0.0, 0, 1)',
        'emphasized': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      transitionDuration: {
        'fast': '120ms',
        'normal': '180ms',
        'slow': '240ms',
      },
    },
  },
  plugins: [],
}
