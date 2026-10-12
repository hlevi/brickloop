"use client";

import { useEffect, useReducer } from "react";
import { Lru, labModel, lookKey } from "@/lib/creature/lab";
import { renderIso, toSvg } from "@/lib/instructions/iso";
import type { DesignParams } from "@/lib/model/types";

/**
 * Tile pictures: an iso render of THIS creature with one choice changed.
 * Rendered lazily (one per idle slot, open tab only) and kept as blob-URL
 * images, which keeps thousands of SVG polygons out of the live DOM.
 */
const urls = new Lru<string>(80, (u) => {
  try {
    URL.revokeObjectURL(u);
  } catch {
    // ignore
  }
});

export interface TileJob {
  id: string;
  params: DesignParams;
}

type IdleHandle = number;
function whenIdle(cb: () => void): IdleHandle {
  if (typeof window.requestIdleCallback === "function") return window.requestIdleCallback(cb, { timeout: 250 });
  return window.setTimeout(cb, 16);
}
function cancelIdle(h: IdleHandle) {
  if (typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(h);
  else window.clearTimeout(h);
}

export function renderTileUrl(params: DesignParams): string {
  const k = lookKey(params);
  const hit = urls.get(k);
  if (hit) return hit;
  const svg = toSvg(renderIso(labModel(params).parts), { width: 160, padding: 0.6 });
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  urls.set(k, url);
  return url;
}

export function useTileImages(jobs: TileJob[]): Record<string, string | undefined> {
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const signature = jobs.map((j) => `${j.id}:${lookKey(j.params)}`).join("~");
  useEffect(() => {
    const todo = jobs.filter((j) => !urls.has(lookKey(j.params)));
    if (!todo.length) return;
    let cancelled = false;
    let handle: IdleHandle | undefined;
    const next = () => {
      if (cancelled) return;
      const j = todo.shift();
      if (!j) return;
      if (!urls.has(lookKey(j.params))) {
        try {
          renderTileUrl(j.params);
          bump();
        } catch {
          // A tile without a picture still shows its icon and word.
        }
      }
      if (todo.length) handle = whenIdle(next);
    };
    handle = whenIdle(next);
    return () => {
      cancelled = true;
      if (handle !== undefined) cancelIdle(handle);
    };
    // The signature captures every input that changes the pictures.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
  const out: Record<string, string | undefined> = {};
  for (const j of jobs) out[j.id] = urls.has(lookKey(j.params)) ? urls.get(lookKey(j.params)) : undefined;
  return out;
}
