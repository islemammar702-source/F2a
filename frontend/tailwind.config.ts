import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: "#174B83", 50: "#EEF4FB", 100: "#D6E4F4", 200: "#A9C6E6", 500: "#2463A6", 600: "#174B83", 700: "#123B67", 800: "#172B45", 900: "#0F1D30" },
        navy: "#172B45",
        accent: { DEFAULT: "#E9A12C", 50: "#FDF5E7", 100: "#FBE7C2", 500: "#E9A12C", 600: "#C9851A" },
        surface: "#F3F6FA",
      },
      fontFamily: {
        sans: ["Inter", "Cairo", "system-ui", "sans-serif"],
        arabic: ["Cairo", "Tahoma", "sans-serif"],
      },
      boxShadow: { card: "0 1px 2px rgba(23,43,69,.06), 0 4px 16px rgba(23,43,69,.06)" },
    },
  },
  plugins: [],
};
export default config;
