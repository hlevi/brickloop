"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { ColorId } from "@/lib/catalog/colors";
import { labModel } from "@/lib/creature/lab";
import { renderName } from "@/lib/creature/words";
import { WORLDS } from "@/lib/creature/worlds";
import { defaultParams } from "@/lib/model/templates";
import type { CreatureIdentity, DesignParams } from "@/lib/model/types";
import StartButton from "../StartButton";
import "./home-hero.css";

const BrickViewer = dynamic(() => import("../BrickViewer"), {
  ssr: false,
  loading: () => (
    <div className="hero-loading" aria-hidden>
      🥚
    </div>
  ),
});

interface Showcase {
  options: Record<string, string>;
  world: string;
  core: ColorId;
  name: CreatureIdentity["name"];
}

/** A little parade: one creature that keeps swapping parts, to show what the Lab does. */
const PARADE: Showcase[] = [
  { options: { body: "chunky", legs: "stompers", head: "chomper", eyes: "googly", tail: "whip", back: "spikes", crown: "horns" }, world: "lava", core: "trans-yellow", name: [0, 0, 0] },
  { options: { body: "chunky", legs: "wheels", head: "robo", eyes: "googly", tail: "stub", back: "jetpack", crown: "none" }, world: "robot", core: "trans-light-blue", name: [2, 35, 10] },
  { options: { body: "tall", legs: "paws", head: "beak", eyes: "cyclops", tail: "none", back: "wings", crown: "crest" }, world: "candy", core: "trans-red", name: [15, 9, 4] },
  { options: { body: "long", legs: "stompers", head: "bug", eyes: "googly", tail: "whip", back: "shell", crown: "horns" }, world: "jungle", core: "trans-green", name: [6, 14, 21] },
  { options: { body: "chunky", legs: "paws", head: "chomper", eyes: "little", tail: "stub", back: "spikes", crown: "crest" }, world: "deepsea", core: "trans-clear", name: [1, 2, 18] },
];

function paramsFor(s: Showcase): DesignParams {
  const base = defaultParams("creature");
  const world = WORLDS.find((w) => w.id === s.world) ?? WORLDS[0];
  return { ...base, options: { ...base.options, ...s.options }, colors: { ...base.colors, ...world.colors, core: s.core } };
}

export default function HomeHero() {
  const [i, setI] = useState(0);
  useEffect(() => {
    let reduced = false;
    try {
      reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      reduced = false;
    }
    if (reduced) return;
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") setI((n) => (n + 1) % PARADE.length);
    }, 3600);
    return () => window.clearInterval(t);
  }, []);
  const show = PARADE[i];
  const model = useMemo(() => labModel(paramsFor(show)), [show]);
  const world = WORLDS.find((w) => w.id === show.world) ?? WORLDS[0];
  const name = renderName({ name: show.name, builder: [0, 0, 0] });
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-copy">
        <p className="hero-kicker">
          <span aria-hidden>🧪</span> Creature Lab
        </p>
        <h1 id="hero-title">Invent a creature. We mail you the real bricks.</h1>
        <p className="hero-sub">Snap on legs, heads, wings and a glowing power core. Give it a silly name, then watch it come to life.</p>
      </div>
      <div className="hero-stage" style={{ "--bd0": world.backdrop[0], "--bd1": world.backdrop[1] } as CSSProperties}>
        <div className="hero-backdrop" aria-hidden />
        <BrickViewer parts={model.parts} mode="alive" />
        <p className="hero-name" aria-live="polite">
          Hi! I&apos;m <b key={name}>{name}</b>
        </p>
      </div>
      <div className="hero-cta">
        <StartButton template="creature" to="lab" label="✨ Start inventing" variant="hero" />
        <Link className="hero-grownups" href="/w">
          Grown-ups: have a wish code?
        </Link>
      </div>
    </section>
  );
}
