import { describe, expect, it, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToString } from "react-dom/server";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} }),
}));
// The 3D stage is client-only (WebGL); on the server it renders its placeholder.
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => createElement("a", { href, ...rest }, children),
}));

import CreatureLab from "@/components/lab/CreatureLab";
import HomeHero from "@/components/lab/HomeHero";
import { labTabs } from "@/lib/creature/lab";
import { applyTool } from "@/lib/edit/tools";
import { defaultParams, getKit } from "@/lib/model/templates";
import type { DesignParams } from "@/lib/model/types";

const DESIGN_ID = "4b7d1a52-8f3e-4c2a-9a55-0d6f1e2b3c4d";

function namedParams(): DesignParams {
  const r = applyTool(defaultParams("creature"), { name: "set_identity", input: { name: [0, 0, 0], builder: [0, 0, 32] } });
  if (!r.ok) throw new Error(r.error);
  return r.params;
}

function renderLab(tab?: string, opts: { isNew?: boolean; params?: DesignParams } = {}) {
  return renderToString(
    createElement(CreatureLab, { designId: DESIGN_ID, initial: { params: opts.params ?? namedParams(), rev: opts.isNew ? 1 : 3, canUndo: true }, isNew: opts.isNew, initialTab: tab }),
  );
}

/** Visible text only (tags stripped), for wording checks. */
const text = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/&#x27;|&apos;/g, "'").replace(/\s+/g, " ");

const MONEY = /\$|€|£|¥|\bUSD\b|\bprice|\bcost|\bestimate|\bquote|checkout|\bpay\b|payment|\bcents?\b/i;
const ADULT_ONLY = /\bchat\b|upload|photo|validation|warning|\berror\b|invalid|revision|\brev\b|parts list|\bcsv\b|bricklink|\bxml\b/i;

describe("Creature Lab kid-mode render", () => {
  const tabs = labTabs(getKit("creature"));

  it.each(tabs.map((t) => [t.id]))("tab %s: no money, no text inputs, no adult-only features", (tab) => {
    const html = renderLab(tab);
    expect(html).not.toMatch(/<input\b/i);
    expect(html).not.toMatch(/<textarea\b/i);
    expect(html).not.toMatch(/contenteditable/i);
    expect(html).not.toMatch(/<form\b/i);
    const t = text(html);
    expect(t).not.toMatch(MONEY);
    expect(t).not.toMatch(ADULT_ONLY);
  });

  it("shows the toy controls with icons and 1-2 words", () => {
    const t = text(renderLab());
    for (const s of ["Bring it to life!", "Show a grown-up", "Shuffle", "Undo", "bricks", "Captain Fizzfang", "Invented by", "real bricks can come to your house"]) expect(t).toContain(s);
    for (const label of ["Body", "Legs", "Head", "Eyes", "Tail", "Back", "Top", "Colors", "Power", "Name"]) expect(t).toContain(label);
  });

  it("the floating home button stays in kid land (My creatures), never the grown-up home page with prices", () => {
    const html = renderLab();
    expect(html).toMatch(/<a[^>]*href="\/lab"[^>]*aria-label="My creatures"|<a[^>]*aria-label="My creatures"[^>]*href="\/lab"/);
    expect(html).not.toMatch(/href="\/"/);
    expect(html).toContain('aria-label="Invent another creature"');
  });

  it("the Name tab is reels and tags only (no keyboard)", () => {
    const html = renderLab("name");
    const t = text(html);
    expect(t).toContain("Captain");
    expect(t).toContain("Fizz");
    expect(t).toContain("fang");
    expect(t).toContain("Roll");
    expect(t).toContain("More");
    expect(html).not.toMatch(/<input\b|<textarea\b/i);
  });

  it("the Power tab offers the five powers", () => {
    const t = text(renderLab("power"));
    for (const p of ["Fire", "Zap", "Leaf", "Ice", "Star"]) expect(t).toContain(p);
  });

  it("the Colors tab offers the six worlds and a padlock", () => {
    const html = renderLab("colors");
    const t = text(html);
    for (const w of ["Lava", "Frost", "Jungle", "Deep Sea", "Candy", "Robot"]) expect(t).toContain(w);
    expect(html).toMatch(/aria-label="Lock colors/);
  });

  it("a brand-new design opens on a hatching egg (the starter shuffle runs in the browser)", () => {
    const html = renderLab(undefined, { isNew: true, params: defaultParams("creature") });
    expect(html).toContain("🥚");
    expect(text(html)).not.toMatch(MONEY);
  });

  it("the home hero is kid-first and has no money on it", () => {
    const html = renderToString(createElement(HomeHero));
    const t = text(html);
    expect(t).toContain("Invent a creature. We mail you the real bricks.");
    expect(t).toContain("Start inventing");
    expect(html).toContain('href="/w"');
    expect(t).not.toMatch(MONEY);
    expect(html).not.toMatch(/<input\b|<textarea\b/i);
  });
});
