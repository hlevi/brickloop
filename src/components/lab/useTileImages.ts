"use client";

import { useEffect, useReducer } from "react";
import { Lru, labModel, lookKey } from "@/lib/creature/lab";
import { renderIso, toSvg } from "@/lib/instructions/iso";
import type { DesignParams } from "@/lib/model/types";

/**
 * Tile pictures: an iso render of THIS creature with one choice changed.
 * Rendered off the tap path and kept as blob-URL images, which keeps thousands
 * of SVG polygons out of the live DOM.
 *
 * Two lanes: the open tab's tiles render first, in short chunks (so a tap never
 * waits more than a few tens of milliseconds); then, only when the browser is
 * idle, the other tabs are pre-rendered so switching tabs shows pictures at once.
 */
const urls = new Lru<string>(96, (u) => {
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
type Deadline = { didTimeout: boolean; timeRemaining(): number };

function whenIdle(cb: (d?: Deadline) => void, timeout?: number): IdleHandle {
  if (typeof window.requestIdleCallback === "function") return window.requestIdleCallback(cb, timeout ? { timeout } : undefined);
  return window.setTimeout(() => cb(), timeout ? 16 : 200);
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

const CHUNK_MS = 30;
const listeners = new Set<() => void>();
let nowLane: TileJob[] = [];
let laterLane: TileJob[] = [];
let scheduled = false;

function schedule() {
  if (scheduled || (!nowLane.length && !laterLane.length)) return;
  scheduled = true;
  whenIdle(run, nowLane.length ? 100 : undefined);
}

function run(deadline?: Deadline) {
  scheduled = false;
  const start = performance.now();
  let did = 0;
  for (;;) {
    const urgent = nowLane.length > 0;
    const lane = urgent ? nowLane : laterLane;
    if (!lane.length) break;
    if (did && performance.now() - start > CHUNK_MS) break;
    // Pre-rendering other tabs only uses real idle time.
    if (!urgent && did && deadline && !deadline.didTimeout && deadline.timeRemaining() < 6) break;
    const j = lane.shift()!;
    if (urls.has(lookKey(j.params))) continue;
    try {
      renderTileUrl(j.params);
      did++;
    } catch {
      // A tile without a picture still shows its icon and word.
    }
  }
  if (did) listeners.forEach((l) => l());
  schedule();
}

/** Queue pictures for tabs that are not open yet (replaces any earlier warm-up). */
export function warmTiles(jobs: TileJob[]): void {
  if (typeof window === "undefined") return;
  laterLane = jobs.filter((j) => !urls.has(lookKey(j.params)));
  schedule();
}

export function useTileImages(jobs: TileJob[]): Record<string, string | undefined> {
  const [, bump] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    listeners.add(bump);
    return () => {
      listeners.delete(bump);
    };
  }, []);
  const signature = jobs.map((j) => `${j.id}:${lookKey(j.params)}`).join("~");
  useEffect(() => {
    nowLane = jobs.filter((j) => !urls.has(lookKey(j.params)));
    schedule();
    return () => {
      nowLane = [];
    };
    // The signature captures every input that changes the pictures.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
  const out: Record<string, string | undefined> = {};
  for (const j of jobs) out[j.id] = urls.has(lookKey(j.params)) ? urls.get(lookKey(j.params)) : undefined;
  return out;
}
