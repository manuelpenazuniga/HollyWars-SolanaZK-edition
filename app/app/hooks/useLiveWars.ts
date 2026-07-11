"use client";

import { useState, useEffect, useRef } from "react";
import { connection } from "@/lib/solana";
import { PROGRAM_ID, WAR_PDAS } from "@/lib/config";
import { decodeWarAccount, decodeVoteCastEvent } from "@/lib/decode";
import type { War, BattleCry, Side } from "@/lib/mock";
import {
  WARS as MOCK_WARS,
  BATTLE_CRIES as MOCK_CRIES,
} from "@/lib/mock";

const WAR_EMOJIS = ["⇥", "⌨", "◐"];
const WAR_SLUGS = ["tabs-vs-spaces", "vim-vs-emacs", "dark-vs-light"];

function warDataToUi(
  d: ReturnType<typeof decodeWarAccount>,
  idx: number,
): War {
  return {
    id: WAR_SLUGS[idx] ?? `war-${d.warId}`,
    title: d.topic,
    sideA: d.sideA,
    sideB: d.sideB,
    tallyA: d.tallyA,
    tallyB: d.tallyB,
    status: d.status === "open" ? "active" : "closed",
    emoji: WAR_EMOJIS[idx] ?? "⚔",
  };
}

export function useLiveWars() {
  const [wars, setWars] = useState<War[]>(MOCK_WARS);
  const [healthy, setHealthy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [cries, setCries] = useState<BattleCry[]>(MOCK_CRIES);
  const discRef = useRef<string | null>(null);
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    (async () => {
      try {
        const infos = await Promise.all(
          WAR_PDAS.map((w) => connection.getAccountInfo(w.pda)),
        );

        const liveWars: War[] = [];
        let anySuccess = false;

        infos.forEach((info, i) => {
          if (info) {
            try {
              liveWars.push(warDataToUi(decodeWarAccount(info.data), i));
              anySuccess = true;
            } catch {
              liveWars.push(MOCK_WARS[i]);
            }
          } else {
            liveWars.push(MOCK_WARS[i]);
          }
        });

        if (anySuccess) {
          setWars(liveWars);
          setHealthy(true);
        }
        setLoading(false);
      } catch {
        setLoading(false);
      }

      const subIds: number[] = [];
      for (let i = 0; i < WAR_PDAS.length; i++) {
        try {
          const subId = connection.onAccountChange(
            WAR_PDAS[i].pda,
            (info) => {
              try {
                const d = decodeWarAccount(info.data);
                const ui = warDataToUi(d, i);
                setWars((prev) => {
                  const next = [...prev];
                  next[i] = ui;
                  return next;
                });
                setHealthy(true);
              } catch {}
            },
          );
          subIds.push(subId);
        } catch {}
      }

      return () => {
        subIds.forEach((id) => connection.removeAccountChangeListener(id));
      };
    })();

    return () => {
      initRef.current = false;
    };
  }, []);

  useEffect(() => {
    let subId: number | undefined;

    (async () => {
      // Anchor event discriminator = sha256("event:VoteCast")[..8], precomputed as a
      // constant so the client needs no runtime hashing (avoids crypto.subtle typing quirks).
      discRef.current = "JzXDaLwR4dU=";

      try {
        subId = connection.onLogs(PROGRAM_ID, (logResult) => {
          const now = Date.now();
          const sig = logResult.signature.slice(0, 8);

          const dataLog = logResult.logs
            ?.find((l) => l.startsWith("Program data:"))
            ?.replace("Program data: ", "");

          if (dataLog && discRef.current) {
            try {
              const buf = Buffer.from(dataLog, "base64");
              const disc = buf.subarray(0, 8).toString("base64");
              if (disc === discRef.current) {
                const ev = decodeVoteCastEvent(buf);
                if (ev) {
                  const slug = WAR_SLUGS[ev.warId - 1] ?? `war-${ev.warId}`;
                  setCries((prev) =>
                    [
                      {
                        id: `cry-${now}-${Math.random().toString(36).slice(2, 6)}`,
                        warId: slug,
                        author: `anon_${sig}`,
                        text:
                          ev.battleCry.toUpperCase() ||
                          `VOTE P${ev.side + 1} (×${ev.weight})`,
                        side: (ev.side === 0 ? "a" : "b") as Side,
                        timestamp: now,
                      },
                      ...prev,
                    ].slice(0, 20),
                  );
                  return;
                }
              }
            } catch {}
          }

          setCries((prev) =>
            [
              {
                id: `cry-${now}-${Math.random().toString(36).slice(2, 6)}`,
                warId: WAR_SLUGS[0],
                author: `anon_${sig}`,
                text: `tx ${logResult.signature.slice(0, 16)}…`,
                side: (Math.random() > 0.5 ? "a" : "b") as Side,
                timestamp: now,
              },
              ...prev,
            ].slice(0, 20),
          );
        });
      } catch {
        setHealthy(false);
      }
    })();

    return () => {
      if (subId !== undefined) connection.removeOnLogsListener(subId);
    };
  }, []);

  return { wars, healthy, loading, cries };
}
