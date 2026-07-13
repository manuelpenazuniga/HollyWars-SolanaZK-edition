import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  future: {
    // hover: variants only fire on real pointers — touch taps don't trigger false hovers
    hoverOnlyWhenSupported: true,
  },
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
      transitionTimingFunction: {
        // strong curves — built-in CSS easings are too weak for deliberate motion
        "out-strong": "cubic-bezier(0.23, 1, 0.32, 1)",
        "in-out-strong": "cubic-bezier(0.77, 0, 0.175, 1)",
      },
      animation: {
        "cursor-blink": "cursor-blink 1s steps(2, jump-none) infinite",
        "capture": "capture 0.25s steps(2, jump-none) 2",
        "tick-up": "tick-up 0.2s steps(2) both",
        "feed-in": "feed-in 0.25s steps(4) both",
        "live-blink": "cursor-blink 1.6s steps(2, jump-none) infinite",
        "rise": "rise 0.35s cubic-bezier(0.23, 1, 0.32, 1) both",
        "stamp": "stamp 0.3s cubic-bezier(0.23, 1, 0.32, 1) both",
        "bob": "bob 1.8s steps(2, jump-none) infinite",
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
        // section/card entrance — nothing appears from nowhere
        rise: {
          "0%": { transform: "translateY(8px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        // celebration stamp — lands onto the page, reserved for rare moments
        stamp: {
          "0%": { transform: "scale(1.04)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        // mascot idle bob — 2px, stepped like a retro sprite loop
        bob: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-2px)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
