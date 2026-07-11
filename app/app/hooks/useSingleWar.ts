"use client";

import { useState, useEffect, useRef } from "react";
import { connection } from "@/lib/solana";
import { WAR_BY_SLUG } from "@/lib/config";
import { decodeWarAccount } from "@/lib/decode";
import type { War } from "@/lib/mock";
import { getWarById } from "@/lib/mock";

const WAR_EMOJIS: Record<string, string> = {
  "tabs-vs-spaces": "⇥",
  "vim-vs-emacs": "⌨",
  "dark-vs-light": "◐",
};

export function useSingleWar(slug: string): {
  war: War | null | undefined;
  loading: boolean;
} {
  const [war, setWar] = useState<War | null | undefined>(undefined);
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const entry = WAR_BY_SLUG[slug];
    if (!entry) {
      setWar(null);
      return;
    }

    (async () => {
      try {
        const info = await connection.getAccountInfo(entry.pda);
        if (info) {
          const d = decodeWarAccount(info.data);
          setWar({
            id: slug,
            title: d.topic,
            sideA: d.sideA,
            sideB: d.sideB,
            tallyA: d.tallyA,
            tallyB: d.tallyB,
            status: d.status === "open" ? "active" : "closed",
            emoji: WAR_EMOJIS[slug] ?? "⚔",
          });
        } else {
          setWar(getWarById(slug) ?? null);
        }
      } catch {
        setWar(getWarById(slug) ?? null);
      }

      try {
        const subId = connection.onAccountChange(entry.pda, (info) => {
          try {
            const d = decodeWarAccount(info.data);
            setWar({
              id: slug,
              title: d.topic,
              sideA: d.sideA,
              sideB: d.sideB,
              tallyA: d.tallyA,
              tallyB: d.tallyB,
              status: d.status === "open" ? "active" : "closed",
              emoji: WAR_EMOJIS[slug] ?? "⚔",
            });
          } catch {}
        });

        return () => {
          connection.removeAccountChangeListener(subId);
          initRef.current = false;
        };
      } catch {
        return;
      }
    })();

    return () => {
      initRef.current = false;
    };
  }, [slug]);

  return { war, loading: war === undefined };
}
