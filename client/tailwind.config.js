/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        navy: '#1A1A2E',
        'navy-light': '#252545',
        'navy-lighter': '#2F2F55',
        accent: '#FF6B35',
        'accent-hover': '#E85A28',
        surface: '#F5F5F7',
        'surface-dark': '#EAEAED',
        'text-primary': '#2D2D2D',
        'text-light': '#E8E8E8',
        'text-muted': '#8A8A9A',
      },
    },
  },
  plugins: [],
};
