import type { Detector, DetectorContext, DetectorResult } from "../types";

const MAX_MODELINE_POINTS = 3;

interface PathPattern {
  match: (path: string, type: "blob" | "tree" | "commit") => boolean;
  label: string;
}

const VIM_DOTFILES: PathPattern[] = [
  { label: ".vimrc", match: (p, t) => t === "blob" && p === ".vimrc" },
  {
    label: ".config/nvim/init.vim",
    match: (p, t) => t === "blob" && p === ".config/nvim/init.vim",
  },
  {
    label: ".config/nvim/init.lua",
    match: (p, t) => t === "blob" && p === ".config/nvim/init.lua",
  },
];

const EMACS_DOTFILES: PathPattern[] = [
  { label: ".emacs", match: (p, t) => t === "blob" && p === ".emacs" },
  { label: ".emacs.d", match: (p, t) => t === "tree" && p === ".emacs.d" },
  { label: "init.el", match: (p, t) => t === "blob" && p === "init.el" },
  { label: ".spacemacs", match: (p, t) => t === "blob" && p === ".spacemacs" },
  { label: ".doom.d", match: (p, t) => t === "tree" && p === ".doom.d" },
];

const VIM_MODELINE = /\bvim\s*:\s*(?:set\b|[^:\n]*:)/i;

const EMACS_MODELINE = /-\*-.+-\*-/;

export const vimEmacsDetector: Detector = async (
  ctx: DetectorContext,
): Promise<DetectorResult> => {
  let pVim = 0;
  let pEmacs = 0;

  const seenVimDotfiles = new Set<string>();
  const seenEmacsDotfiles = new Set<string>();

  for (const entry of ctx.treePaths) {
    for (const p of VIM_DOTFILES) {
      if (
        p.match(entry.path, entry.type) &&
        !seenVimDotfiles.has(p.label + ":" + entry.path)
      ) {
        pVim += 3;
        seenVimDotfiles.add(p.label + ":" + entry.path);
      }
    }
    for (const p of EMACS_DOTFILES) {
      if (
        p.match(entry.path, entry.type) &&
        !seenEmacsDotfiles.has(p.label + ":" + entry.path)
      ) {
        pEmacs += 3;
        seenEmacsDotfiles.add(p.label + ":" + entry.path);
      }
    }
  }

  let vimModelineFiles = 0;
  let emacsModelineFiles = 0;
  for (const f of ctx.fileBlobs) {
    if (f.content == null) continue;
    if (vimModelineFiles < MAX_MODELINE_POINTS && VIM_MODELINE.test(f.content)) {
      vimModelineFiles++;
    }
    if (
      emacsModelineFiles < MAX_MODELINE_POINTS &&
      EMACS_MODELINE.test(f.content)
    ) {
      emacsModelineFiles++;
    }
  }
  pVim += vimModelineFiles;
  pEmacs += emacsModelineFiles;

  const E = pVim + pEmacs;
  if (E === 0) {
    return { affinity: 0, insufficient: true };
  }
  return { affinity: pVim / E, insufficient: false };
};
