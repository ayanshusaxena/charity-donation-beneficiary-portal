/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "primary": "#003629",
        "primary-container": "#1b4d3e",
        "on-primary": "#ffffff",
        "on-primary-container": "#8abda9",
        "primary-fixed": "#baeed9",
        "primary-fixed-dim": "#9ed1bd",
        "on-primary-fixed": "#002117",
        "on-primary-fixed-variant": "#1d4f40",
        "inverse-primary": "#9ed1bd",

        "secondary": "#904d00",
        "secondary-container": "#fe932c",
        "on-secondary": "#ffffff",
        "on-secondary-container": "#663500",
        "secondary-fixed": "#ffdcc3",
        "secondary-fixed-dim": "#ffb77d",
        "on-secondary-fixed": "#2f1500",
        "on-secondary-fixed-variant": "#6e3900",

        "tertiary": "#003623",
        "tertiary-container": "#004f35",
        "on-tertiary": "#ffffff",
        "on-tertiary-container": "#51c695",
        "tertiary-fixed": "#85f8c4",
        "tertiary-fixed-dim": "#68dba9",
        "on-tertiary-fixed": "#002114",
        "on-tertiary-fixed-variant": "#005137",

        "error": "#ba1a1a",
        "error-container": "#ffdad6",
        "on-error": "#ffffff",
        "on-error-container": "#93000a",

        "background": "#f9f9ff",
        "on-background": "#121c2a",
        "surface": "#f9f9ff",
        "on-surface": "#121c2a",
        "surface-variant": "#d9e3f7",
        "on-surface-variant": "#404945",
        "surface-dim": "#d0daef",
        "surface-bright": "#f9f9ff",
        "surface-container-lowest": "#ffffff",
        "surface-container-low": "#eff3ff",
        "surface-container": "#e6eeff",
        "surface-container-high": "#dee9fd",
        "surface-container-highest": "#d9e3f7",
        "surface-tint": "#376757",

        "outline": "#707974",
        "outline-variant": "#c0c9c3",
        "inverse-surface": "#273140",
        "inverse-on-surface": "#ebf1ff",
      },
      borderRadius: {
        "DEFAULT": "0.25rem",
        "lg": "0.5rem",
        "xl": "0.75rem",
        "full": "9999px"
      },
      spacing: {
        "gutter-mobile": "1rem",
        "margin": "2rem",
        "margin-mobile": "1rem",
        "gutter": "1.5rem",
        "space-xs": "0.25rem",
        "space-sm": "0.5rem",
        "space-md": "1rem",
        "space-lg": "1.5rem",
        "space-xl": "2.5rem"
      },
      fontFamily: {
        "sans": ["'Plus Jakarta Sans'", "sans-serif"],
        "body-md": ["'Plus Jakarta Sans'", "sans-serif"],
        "metric-md": ["'Plus Jakarta Sans'", "sans-serif"],
        "headline-md": ["'Plus Jakarta Sans'", "sans-serif"],
        "headline-lg": ["'Plus Jakarta Sans'", "sans-serif"],
        "display-lg": ["'Plus Jakarta Sans'", "sans-serif"],
        "metric-lg": ["'Plus Jakarta Sans'", "sans-serif"],
        "label-md": ["'Plus Jakarta Sans'", "sans-serif"],
        "label-sm": ["'Plus Jakarta Sans'", "sans-serif"],
        "body-sm": ["'Plus Jakarta Sans'", "sans-serif"],
        "headline-sm": ["'Plus Jakarta Sans'", "sans-serif"],
        "body-lg": ["'Plus Jakarta Sans'", "sans-serif"]
      },
      fontSize: {
        "body-md": ["16px", { lineHeight: "24px", fontWeight: "400" }],
        "metric-md": ["24px", { lineHeight: "30px", letterSpacing: "-0.01em", fontWeight: "700" }],
        "headline-md": ["24px", { lineHeight: "32px", letterSpacing: "-0.01em", fontWeight: "600" }],
        "headline-lg": ["32px", { lineHeight: "40px", letterSpacing: "-0.02em", fontWeight: "700" }],
        "display-lg": ["48px", { lineHeight: "56px", letterSpacing: "-0.03em", fontWeight: "800" }],
        "metric-lg": ["36px", { lineHeight: "44px", letterSpacing: "-0.02em", fontWeight: "800" }],
        "label-md": ["14px", { lineHeight: "20px", letterSpacing: "0.01em", fontWeight: "600" }],
        "label-sm": ["12px", { lineHeight: "16px", letterSpacing: "0.02em", fontWeight: "600" }],
        "body-sm": ["14px", { lineHeight: "20px", fontWeight: "400" }],
        "headline-sm": ["20px", { lineHeight: "28px", fontWeight: "600" }],
        "body-lg": ["18px", { lineHeight: "28px", fontWeight: "400" }]
      }
    }
  },
  plugins: [],
}
