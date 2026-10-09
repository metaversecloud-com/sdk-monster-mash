/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  // Disable Tailwind's preflight reset so our cascade layers work as expected.
  // The Tailwind v3 PostCSS plugin hoists preflight to the top level (unlayered)
  // regardless of the outer @layer wrapper in index.css, which would clobber the
  // SDK's typography rules (e.g. `.rtsdk h3 { font-size: 24px }`). The SDK
  // stylesheet already provides sensible defaults for h1-h6/body/a/etc.
  // All utility classes (flex, grid, mt-4, bg-zinc-700, …) still work.
  corePlugins: { preflight: false },
  theme: {
    extend: {
      colors: {
        // Custom warm-neutral scale — Tailwind ships slate/gray/zinc/neutral/stone
        // as its default neutrals; "taupe" isn't in any version of Tailwind, so
        // we define it here. Extends the standard 50–900 scale so `bg-taupe-50`,
        // `border-taupe-300`, `text-taupe-900`, etc. all resolve.
        taupe: {
          50: "#f8f5f0",
          100: "#ede6d9",
          200: "#dccdb2",
          300: "#c4b088",
          400: "#a89164",
          500: "#8a7350",
          600: "#6e5c40",
          700: "#524432",
          800: "#362e24",
          900: "#1c1811",
        },
      },
    },
  },
  plugins: [],
};
