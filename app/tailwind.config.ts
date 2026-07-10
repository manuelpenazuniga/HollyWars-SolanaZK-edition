import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        void: "#0A0C10",
        panel: "#12151C",
        "panel-edge": "#1E232E",
        bone: "#E8E4D8",
        p1: "#FF4D4F",
        "p1-deep": "#B32224",
        p2: "#4D9FFF",
        "p2-deep": "#1F5FB3",
        gold: "#F5B32F",
        arcane: "#A78BFA",
      },
      fontFamily: {
        pixel: ['"Silkscreen"', "monospace"],
        sans: ['"Space Grotesk"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', '"Fira Code"', "monospace"],
      },
      animation: {
        "cursor-blink": "cursor-blink 1s steps(2, jump-none) infinite",
        "capture": "capture 0.25s steps(2, jump-none) 2",
        "tick-up": "tick-up 0.2s steps(2) both",
        "feed-in": "feed-in 0.25s steps(4) both",
        "live-blink": "cursor-blink 1.6s steps(2, jump-none) infinite",
      },
      keyframes: {
        "cursor-blink": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.15" },
        },
        capture: {
          "0%": { filter: "brightness(2.5)" },
          "100%": { filter: "brightness(1)" },
        },
        "tick-up": {
          "0%": { transform: "translateY(0.18em)", opacity: "0.55" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        "feed-in": {
          "0%": { transform: "translateX(-8px)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
