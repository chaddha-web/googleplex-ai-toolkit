import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        serif: ['"Instrument Serif"', "serif"],
        sans: ['"Helvetica Regular"', "Inter", "system-ui", "sans-serif"]
      }
    }
  },
  plugins: []
};

export default config;
