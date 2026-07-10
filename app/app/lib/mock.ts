export type Side = "a" | "b";

export interface War {
  id: string;
  title: string;
  sideA: string;
  sideB: string;
  tallyA: number;
  tallyB: number;
  status: "active" | "closed";
  emoji: string;
}

export interface BattleCry {
  id: string;
  warId: string;
  author: string;
  text: string;
  side: Side;
  timestamp: number;
}

export interface Medal {
  id: string;
  warId: string;
  name: string;
  description: string;
  rarity: "common" | "rare" | "epic" | "legendary";
  claimed: boolean;
}

export const WARS: War[] = [
  {
    id: "tabs-vs-spaces",
    title: "Tabs vs Spaces",
    sideA: "TABS",
    sideB: "SPACES",
    tallyA: 1247,
    tallyB: 1893,
    status: "active",
    emoji: "⇥",
  },
  {
    id: "vim-vs-emacs",
    title: "Vim vs Emacs",
    sideA: "VIM",
    sideB: "EMACS",
    tallyA: 892,
    tallyB: 734,
    status: "active",
    emoji: "⌨",
  },
  {
    id: "dark-vs-light",
    title: "Dark vs Light Mode",
    sideA: "DARK",
    sideB: "LIGHT",
    tallyA: 2341,
    tallyB: 612,
    status: "active",
    emoji: "◐",
  },
];

export const BATTLE_CRIES: BattleCry[] = [
  {
    id: "cry-1",
    warId: "tabs-vs-spaces",
    author: "anon_dev_42",
    text: "SPACES BUILD EMPIRES. TABS BUILD RUST.",
    side: "b",
    timestamp: Date.now() - 120000,
  },
  {
    id: "cry-2",
    warId: "tabs-vs-spaces",
    author: "indent_warrior",
    text: "MY MAKEFILE DOES NOT LIE. TABS FOREVER.",
    side: "a",
    timestamp: Date.now() - 95000,
  },
  {
    id: "cry-3",
    warId: "vim-vs-emacs",
    author: "modal_maniac",
    text: "I EDIT AT THE SPEED OF THOUGHT. VIM IS MY EXOSKELETON.",
    side: "a",
    timestamp: Date.now() - 80000,
  },
  {
    id: "cry-4",
    warId: "vim-vs-emacs",
    author: "lisp_lord",
    text: "VIM IS A TEXT EDITOR. EMACS IS AN OS THAT EDITS TEXT.",
    side: "b",
    timestamp: Date.now() - 60000,
  },
  {
    id: "cry-5",
    warId: "dark-vs-light",
    author: "pixel_purist",
    text: "LIGHT MODE IS FOR THOSE WHO FEAR THE VOID.",
    side: "a",
    timestamp: Date.now() - 45000,
  },
  {
    id: "cry-6",
    warId: "dark-vs-light",
    author: "retina_burn",
    text: "MY EYES. MY CHOICE. LIGHT MODE OR DEATH.",
    side: "b",
    timestamp: Date.now() - 30000,
  },
  {
    id: "cry-7",
    warId: "tabs-vs-spaces",
    author: "git_blamer",
    text: "EVERY MERGE CONFLICT STARTS WITH YOU TAB USERS.",
    side: "b",
    timestamp: Date.now() - 15000,
  },
  {
    id: "cry-8",
    warId: "vim-vs-emacs",
    author: "keybind_king",
    text: "I EXIT VIM ONCE A DECADE. IT IS A LIFESTYLE.",
    side: "a",
    timestamp: Date.now() - 5000,
  },
];

export const MEDALS: Medal[] = [
  {
    id: "medal-tabs-veteran",
    warId: "tabs-vs-spaces",
    name: "Indentation Veteran",
    description: "Fought in the Great Tabs vs Spaces War of July 2026",
    rarity: "rare",
    claimed: false,
  },
  {
    id: "medal-vim-legend",
    warId: "vim-vs-emacs",
    name: "Modal Master",
    description: "Survived the Vim vs Emacs bloodbath",
    rarity: "epic",
    claimed: false,
  },
  {
    id: "medal-dark-champion",
    warId: "dark-vs-light",
    name: "Void Walker",
    description: "Stood firm in the darkness against the blinding light",
    rarity: "legendary",
    claimed: false,
  },
  {
    id: "medal-enlisted",
    warId: "all",
    name: "Conscript",
    description: "Answered the call. Enlisted in Holy Wars.",
    rarity: "common",
    claimed: true,
  },
  {
    id: "medal-first-blood",
    warId: "all",
    name: "First Blood",
    description: "Cast the first vote in any war",
    rarity: "rare",
    claimed: false,
  },
  {
    id: "medal-anonymous",
    warId: "all",
    name: "Ghost Soldier",
    description: "Voted without revealing your side (ZK proof verified)",
    rarity: "epic",
    claimed: false,
  },
];

export function simulateTallyUpdate(war: War): War {
  const delta = Math.random() > 0.5 ? 1 : 0;
  const deltaB = Math.random() > 0.5 ? 1 : 0;
  return {
    ...war,
    tallyA: war.tallyA + delta,
    tallyB: war.tallyB + deltaB,
  };
}

export function getWarById(id: string): War | undefined {
  return WARS.find((w) => w.id === id);
}
