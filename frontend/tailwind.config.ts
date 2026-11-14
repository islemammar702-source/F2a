import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Palette taken from the F2A logo: deep blue (house), ice blue (snowflake), flame orange/red.
        brand: { DEFAULT: "#1A5DAB", 50: "#EEF5FC", 100: "#D7E7F7", 200: "#A8CBEE", 500: "#2C7BD0", 600: "#1A5DAB", 700: "#144A8A", 800: "#0F2F57", 900: "#0A1F3B" },
        navy: "#0E2440",
        accent: { DEFAULT: "#F2711C", 50: "#FEF1E8", 100: "#FCDCC4", 500: "#F2711C", 600: "#D9590B" },
        ice: { DEFAULT: "#38B6F0", 50: "#EAF7FE", 100: "#CDEDFC", 600: "#1593CF" },
        flame: { yellow: "#FDB022", DEFAULT: "#F2711C", red: "#E8431B" },
        surface: "#F4F7FB",
      },
      fontFamily: {
        sans: ["Inter", "Cairo", "system-ui", "sans-serif"],
        display: ["Montserrat", "Inter", "Cairo", "sans-serif"],
        arabic: ["Cairo", "Tahoma", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(14,36,64,.06), 0 4px 16px rgba(14,36,64,.06)",
        lift: "0 12px 32px -8px rgba(14,36,64,.25)",
        glow: "0 8px 28px -6px rgba(242,113,28,.55)",
      },
    },
  },
  plugins: [],
};
export default config;
