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
        // Progressive mint scale anchored on the two spec'd brand greens
        // (#C8F5C8 light @ 100, #6ED868 bright @ 500, #5BC954 hover @ 600).
        // Interpolated shades fill in the ramp so the status-screen
        // columns can step through 6 evenly-spaced tints without
        // introducing a hue that isn't in the family.
        "gr-mint-50":  "#F0FBF0",
        "gr-mint-100": "#DEF6DE",
        "gr-mint-200": "#C8F5C8",
        "gr-mint-300": "#A8ECA8",
        "gr-mint-400": "#89DF7F",
        "gr-mint-500": "#6ED868",
        "gr-mint-600": "#5BC954",
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
