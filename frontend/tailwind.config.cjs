/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        app: {
          soft:   "#F9F6F3",
          muted:  "#A6B28B",
          dark:   "#1C352D",
          accent: "#A6B28B",
        },
      },
      fontFamily: {
        sans: ["Segoe UI", "Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
