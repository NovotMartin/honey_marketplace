/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{vue,ts}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["Baloo 2", "Nunito", "system-ui", "sans-serif"],
        sans: ["Nunito", "system-ui", "sans-serif"]
      },
      colors: {
        honey: {
          50: "#fff9db",
          100: "#fff1a8",
          200: "#ffe066",
          300: "#ffd43b",
          400: "#fcc419",
          500: "#f59f00",
          600: "#e67700",
          700: "#b85c00"
        }
      },
      boxShadow: {
        honey: "0 24px 80px rgba(184, 92, 0, 0.24)"
      }
    }
  },
  plugins: []
};
