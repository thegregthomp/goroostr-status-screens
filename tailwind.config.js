module.exports = {
  content: ["./app/**/*.{ts,tsx,jsx,js}"],
  theme: {
    extend: {
      // GoRoostr brand palette — mirrors goroostr.com/brand.
      // Prefix `gr-` so the brand hues sit alongside Tailwind's defaults
      // without shadowing them (bg-gr-green vs bg-green-500).
      colors: {
        "gr-green": "#6ED868",
        "gr-green-hover": "#5BC954",
        "gr-green-light": "#C8F5C8",
        "gr-green-dark": "#173125",
        "gr-black": "#1A1A1A",
        "gr-beige": "#DBD7CB",
        "gr-beige-light": "#E8E5DD",
        "gr-dark-hover": "#2F3437",
        "gr-gray-disabled": "#9BA3A7",
      },
      fontFamily: {
        // DM Sans is loaded from Google Fonts in root.tsx; fall back to
        // the system stack so the app renders sanely if the font blocks.
        sans: ['"DM Sans"', "system-ui", "-apple-system", "sans-serif"],
      },
    },
  },
  plugins: [],
};
