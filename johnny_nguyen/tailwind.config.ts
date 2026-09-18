import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",

        // Ledger tokens. Every one resolves to a custom property defined in
        // src/app/career/theme.css, so `bg-surface` follows the active theme
        // instead of pinning a hex. Only meaningful inside `.ledger`.
        ground: "var(--ground)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        rule: "var(--rule)",
        "rule-strong": "var(--rule-strong)",

        ink: "var(--ink)",
        "ink-muted": "var(--ink-muted)",
        "ink-faint": "var(--ink-faint)",
        "ink-on-signal": "var(--ink-on-signal)",

        signal: "var(--signal)",
        "signal-2": "var(--signal-2)",
        "signal-soft": "var(--signal-soft)",
        "signal-hover": "var(--signal-hover)",

        track: "var(--track)",
        overdue: "var(--overdue)",
        "overdue-soft": "var(--overdue-soft)",

        "heat-0": "var(--heat-0)",
        "heat-1": "var(--heat-1)",
        "heat-2": "var(--heat-2)",
        "heat-3": "var(--heat-3)",
        "heat-4": "var(--heat-4)",
      },
      borderColor: {
        DEFAULT: "var(--rule)",
      },
      boxShadow: {
        panel: "var(--shadow-panel)",
      },
    },
  },
  plugins: [],
} satisfies Config;
