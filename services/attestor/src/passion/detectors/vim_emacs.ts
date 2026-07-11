// War 2: Vim vs Emacs.
//
// Scoring (from docs/proof-of-passion.md):
//   - Vim side (+3 each, dotfiles in *any* of the user's sampled repos):
//       .vimrc                              (root)
//       .config/nvim/init.vim
//       .config/nvim/init.lua
//   - Emacs side (+3 each, symmetric):
//       .emacs                              (root file or dir)
//       .emacs.d/                           (root dir)
//       init.el                             (root)
//       .spacemacs                          (root)
//       .doom.d/                            (root dir)
//   - Vim modelines in the *sampled source files*: +1 per file that
//     contains a vim modeline, capped at 3 total. Symmetric for emacs.
//   - E = p_vim + p_emacs. If E == 0 -> insufficient -> (1,1).
//   - Otherwise, a = p_vim / E  (affinity toward Vim, side A).
//
// Notes on paths:
//   - GitHub's tree API returns *all* paths. We use the full tree (not just
//     the 20-file source sample) to look for dotfiles — a `.vimrc` is never
//     a source file. The source sample is reserved for modeline detection,
//     which is the only place file *content* matters for this war.
//
// Notes on modelines:
//   - Vim modeline: a line containing `vim:` followed by `set` or by a
//     trailing `:` (the modeline terminator). Match is case-insensitive.
//   - Emacs modeline: a line containing the `-*-( ... )-*-` marker.
//   - Per-file contribution is binary: a file either has a modeline or
//     doesn't. This avoids the trivial gaming of "dump 200 modeline lines
//     in one file" and is what the "+1 ... cap 3" wording implies.

import type { Detector, DetectorContext, DetectorResult } from "../types.js";

const MAX_MODELINE_POINTS = 3;

// Path patterns. We match either the exact root filename or the dotfile
// directory at root; deeper copies of e.g. `.config/nvim/init.vim` inside
// someone else's fork are not credit-bearing — only the *user's own* root
// dotfiles count, which is what the tree of their own repos already gives us.
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

// Vim modeline: e.g. `# vim: set ts=4 sw=4 :`, `// vim: ts=4 :`, `/* vim: set ft=python: */`
// Pattern: the literal "vim:" followed by either "set" (with word boundary)
// or any other content terminating in ":". Case-insensitive.
const VIM_MODELINE = /\bvim\s*:\s*(?:set\b|[^:\n]*:)/i;

// Emacs modeline: e.g. `;; -*- mode: Lisp; -*-`, `/* -*- mode: c -*- */`
// Pattern: ` -*- ` ... ` -*- ` on the same line.
const EMACS_MODELINE = /-\*-.+-\*-/;

export const vimEmacsDetector: Detector = async (
  ctx: DetectorContext,
): Promise<DetectorResult> => {
  let pVim = 0;
  let pEmacs = 0;

  // Dotfile scoring: dedupe per (label, path) — the same file in two repos
  // doesn't double-count, but the same path in two repos *does* count
  // (different "instance" of the user's config). To stay simple and avoid
  // trivial gaming through mirroring, we count per *distinct path string*.
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

  // Modeline scoring: at most 1 point per file, capped at 3 total per side.
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
