"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { COLORS } from "@/lib/catalog/colors";
import { PARTS } from "@/lib/catalog/parts";
import { partKey, revealOrder } from "@/lib/creature/anim";
import { easeOutBack, revealStep } from "@/lib/creature/lab";
import type { PlacedPart } from "@/lib/model/types";

const PLATE = 0.4;
const GAP = 0.01;
const STUD_R = 0.3;
const STUD_H = 0.18;

const geoCache = new Map<string, THREE.BufferGeometry>();

function studs(cells: [number, number][], topY: number): THREE.BufferGeometry[] {
  return cells.map(([cx, cz]) => {
    const g = new THREE.CylinderGeometry(STUD_R, STUD_R, STUD_H, 16);
    g.translate(cx + 0.5, topY + STUD_H / 2, cz + 0.5);
    return g;
  });
}

/** Build geometry in the part's local frame (x: width, y: up, z: depth/back), min corner at the origin. */
function localGeometry(partId: string): THREE.BufferGeometry {
  const def = PARTS[partId];
  const H = def.h * PLATE;
  const parts: THREE.BufferGeometry[] = [];
  const allCells: [number, number][] = [];
  for (let x = 0; x < def.w; x++) for (let z = 0; z < def.d; z++) allCells.push([x, z]);

  if (def.shape === "box" || def.shape === "wheelHolder") {
    const g = new THREE.BoxGeometry(def.w - GAP, H - GAP, def.d - GAP);
    g.translate(def.w / 2, H / 2, def.d / 2);
    parts.push(g, ...studs(allCells, H));
  } else if (def.shape === "slope" || def.shape === "ridge") {
    // Profile in the (z, y) plane, extruded along x.
    const s = new THREE.Shape();
    if (def.shape === "slope") {
      s.moveTo(0, 0);
      s.lineTo(def.d, 0);
      s.lineTo(def.d, H);
      s.lineTo(def.d - 1, H);
      s.lineTo(0, PLATE);
    } else {
      s.moveTo(0, 0);
      s.lineTo(def.d, 0);
      s.lineTo(def.d, PLATE);
      s.lineTo(def.d / 2, H);
      s.lineTo(0, PLATE);
    }
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: def.w - GAP, bevelEnabled: false });
    // Extrusion runs along +z with the profile in (x, y); a -90deg turn about y puts the
    // profile in (z, y) and the extrusion along x (a rotation keeps faces outward).
    g.rotateY(-Math.PI / 2);
    g.translate(def.w - GAP / 2, 0, 0);
    parts.push(g.index ? g.toNonIndexed() : g);
    if (def.topStuds === "back-row") parts.push(...studs(allCells.filter(([, z]) => z === def.d - 1), H));
  } else if (def.shape === "round") {
    const r = def.w / 2 - 0.05;
    const g = new THREE.CylinderGeometry(r, r, H - GAP, 24);
    g.translate(def.w / 2, H / 2, def.d / 2);
    parts.push(g, ...studs(allCells, H));
  } else if (def.shape === "wheel") {
    const r = H / 2;
    const g = new THREE.CylinderGeometry(r, r, 0.7, 24);
    g.rotateX(Math.PI / 2);
    g.translate(def.w / 2, r, def.d / 2);
    parts.push(g);
  }
  const normalized = parts.map((p) => (p.index ? p.toNonIndexed() : p));
  normalized.forEach((p) => {
    if (p.hasAttribute("uv")) p.deleteAttribute("uv");
  });
  const merged = mergeGeometries(normalized, false)!;
  merged.computeVertexNormals();
  return merged;
}

function partGeometry(partId: string, rot: number): THREE.BufferGeometry {
  const key = `${partId}@${rot}`;
  let g = geoCache.get(key);
  if (!g) {
    g = localGeometry(partId).clone();
    g.rotateY((rot * Math.PI) / 180);
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    g.translate(-bb.min.x, -bb.min.y, -bb.min.z);
    g.computeBoundingBox();
    geoCache.set(key, g);
  }
  return g;
}

/**
 * Stable React keys: meshes are keyed by geometry (partKey), not by `uid`, which is
 * renumbered on every compile. Unchanged bricks keep their mesh across edits.
 */
function keyed(parts: PlacedPart[]): { key: string; p: PlacedPart }[] {
  const seen = new Map<string, number>();
  return parts.map((p) => {
    const base = partKey(p);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return { key: n ? `${base}#${n}` : base, p };
  });
}

function Part({ p, faded }: { p: PlacedPart; faded: boolean }) {
  const color = COLORS[p.colorId];
  const geom = useMemo(() => partGeometry(p.partId, p.rot), [p.partId, p.rot]);
  const isWheel = PARTS[p.partId]?.shape === "wheel";
  return (
    <mesh geometry={geom} position={[p.x, p.y * PLATE, p.z]} castShadow receiveShadow>
      <meshStandardMaterial
        color={isWheel ? "#2a2a2a" : (color?.hex ?? "#999")}
        roughness={0.35}
        metalness={0.02}
        transparent={!!color?.transparent || faded}
        opacity={faded ? 0.25 : color?.transparent ? 0.55 : 1}
      />
    </mesh>
  );
}

export type ViewerMode = "cad" | "alive";

export interface BrickViewerProps {
  parts: PlacedPart[];
  uptoStep?: number;
  highlightStep?: number;
  /** 'cad' (default): the static editor/step viewer. 'alive': the Creature Lab stage. */
  mode?: ViewerMode;
  /** Alive mode: changing this value plays the "Bring it to life!" assembly reveal. */
  assembleKey?: number;
  /** Alive mode: called once the last brick of the reveal has landed. */
  onAssembled?: () => void;
  /** Alive mode: called as each brick appears during the reveal (for sounds). */
  onPartRevealed?: (p: PlacedPart, index: number, total: number) => void;
}

export default function BrickViewer(props: BrickViewerProps) {
  if (props.mode === "alive") return <AliveViewer {...props} />;
  return <CadViewer parts={props.parts} uptoStep={props.uptoStep} highlightStep={props.highlightStep} />;
}

function CadViewer({ parts, uptoStep, highlightStep }: { parts: PlacedPart[]; uptoStep?: number; highlightStep?: number }) {
  const visible = uptoStep ? parts.filter((p) => p.step <= uptoStep) : parts;
  const bounds = useMemo(() => {
    // Frame the occupied box, not the box from the origin: kits like the creatures sit away from (0, 0).
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity, maxY = 1;
    for (const p of parts) {
      const def = PARTS[p.partId];
      const swap = p.rot === 90 || p.rot === 270;
      minX = Math.min(minX, p.x);
      minZ = Math.min(minZ, p.z);
      maxX = Math.max(maxX, p.x + (swap ? def.d : def.w));
      maxZ = Math.max(maxZ, p.z + (swap ? def.w : def.d));
      maxY = Math.max(maxY, (p.y + def.h) * PLATE);
    }
    if (!Number.isFinite(minX)) [minX, maxX, minZ, maxZ] = [0, 1, 0, 1];
    return { cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, cy: maxY / 2, size: Math.max(maxX - minX, maxZ - minZ, maxY, 1) };
  }, [parts]);
  const dist = bounds.size * 1.7 + 4;
  return (
    <Canvas shadows camera={{ position: [bounds.cx + dist * 0.75, bounds.cy + dist * 0.65, bounds.cz - dist * 0.8], fov: 40 }} dpr={[1, 2]}>
      <ambientLight intensity={0.55} />
      <directionalLight position={[10, 18, -8]} intensity={1.6} castShadow shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-10, 8, 10]} intensity={0.4} />
      <group>
        {keyed(visible).map(({ key, p }) => (
          <Part key={key} p={p} faded={highlightStep !== undefined && p.step < highlightStep} />
        ))}
      </group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[bounds.cx, -0.01, bounds.cz]} receiveShadow>
        <planeGeometry args={[bounds.size * 4, bounds.size * 4]} />
        <shadowMaterial opacity={0.18} />
      </mesh>
      <gridHelper args={[Math.ceil(bounds.size * 3), Math.ceil(bounds.size * 3), "#c9c9c9", "#e2e2e2"]} position={[bounds.cx, -0.005, bounds.cz]} />
      <OrbitControls target={[bounds.cx, bounds.cy, bounds.cz]} enableDamping minDistance={3} maxDistance={dist * 3} maxPolarAngle={Math.PI / 2.05} />
    </Canvas>
  );
}

/* ------------------------------------------------------------------ */
/* Alive mode: the Creature Lab stage.                                 */
/* ------------------------------------------------------------------ */

const DROP_LIFT = 3;
const DROP_SECONDS = 0.25;
const REVEAL_LIFT = 1.6;
const REVEAL_DROP_SECONDS = 0.22;
const CORE_PULSE_SECONDS = 0.45;
const BLINK_SECONDS = 0.12;
const HOP_SECONDS = 0.42;

interface Tween {
  delay: number;
  start: number;
  dur: number;
  lift: number;
  /** Reveal tweens keep the brick hidden until its turn. */
  hidden?: boolean;
  shown?: boolean;
  pulse?: boolean;
  index?: number;
  total?: number;
  part?: PlacedPart;
}

interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  maxY: number;
  radius: number;
}

function aliveBounds(parts: PlacedPart[]): Bounds {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, maxY = 1;
  for (const p of parts) {
    const def = PARTS[p.partId];
    if (!def) continue;
    const swap = p.rot === 90 || p.rot === 270;
    minX = Math.min(minX, p.x);
    minZ = Math.min(minZ, p.z);
    maxX = Math.max(maxX, p.x + (swap ? def.d : def.w));
    maxZ = Math.max(maxZ, p.z + (swap ? def.w : def.d));
    maxY = Math.max(maxY, (p.y + def.h) * PLATE);
  }
  if (!Number.isFinite(minX)) [minX, maxX, minZ, maxZ] = [0, 1, 0, 1];
  const radius = 0.5 * Math.hypot(maxX - minX, maxY, maxZ - minZ);
  return { minX, maxX, minZ, maxZ, maxY, radius };
}

function prefersReducedMotion(): boolean {
  try {
    return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function AliveViewer({ parts, assembleKey = 0, onAssembled, onPartRevealed }: BrickViewerProps) {
  // Read once: with reduced motion nothing tweens (the blink stays; it is not motion across the screen).
  const [reduced] = useState(prefersReducedMotion);
  const bounds = useMemo(() => aliveBounds(parts), [parts]);
  return (
    <Canvas shadows="percentage" camera={{ position: [7, 18, -31], fov: 34 }} dpr={[1, 2]} gl={{ alpha: true, antialias: true }}>
      <hemisphereLight args={["#ffffff", "#b9a98f", 0.9]} />
      <ambientLight intensity={0.35} />
      <directionalLight
        position={[12, 22, -14]}
        intensity={1.7}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-18}
        shadow-camera-right={18}
        shadow-camera-top={18}
        shadow-camera-bottom={-18}
        shadow-camera-far={80}
        shadow-bias={-0.0005}
      />
      <directionalLight position={[-12, 10, 12]} intensity={0.5} />
      <AliveCreature parts={parts} bounds={bounds} reduced={reduced} assembleKey={assembleKey} onAssembled={onAssembled} onPartRevealed={onPartRevealed} />
      <FitCamera radius={Math.max(9, bounds.radius * 0.88)} snap={reduced} />
      <OrbitControls makeDefault target={[0, 0, 0]} enablePan={false} enableZoom={false} enableDamping minPolarAngle={0.3} maxPolarAngle={Math.PI / 2.15} />
    </Canvas>
  );
}

let glow: THREE.Texture | null = null;
/** Soft round glow (drawn once on a canvas, no image files) for the power core's halo. */
function glowTexture(): THREE.Texture {
  if (glow) return glow;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  if (g) {
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, "rgba(255,255,255,1)");
    grd.addColorStop(0.3, "rgba(255,255,255,0.55)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
  }
  glow = new THREE.CanvasTexture(c);
  return glow;
}

/** Keeps the whole creature in frame at any stage size, easing when its size changes (snapping with reduced motion). */
function FitCamera({ radius, snap = false }: { radius: number; snap?: boolean }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const first = useRef(true);
  useFrame((_, dt) => {
    const vfov = (camera.fov * Math.PI) / 180;
    const aspect = size.width / Math.max(1, size.height);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
    // Narrow (phone) stages keep a little extra room at the sides for the Shuffle lever.
    const want = (radius / Math.sin(Math.min(vfov, hfov) / 2)) * (aspect < 1 ? 1.12 : 1);
    const len = camera.position.length() || 1;
    const next = first.current || snap ? want : len + (want - len) * (1 - Math.exp(-dt * 5));
    first.current = false;
    camera.position.multiplyScalar(next / len);
  });
  return null;
}

const AlivePart = memo(
  function AlivePart({ k, p, baseY, register }: { k: string; p: PlacedPart; baseY: number; register: (k: string, m: THREE.Mesh | null) => void }) {
    const ref = useRef<THREE.Mesh>(null);
    const geom = partGeometry(p.partId, p.rot);
    const color = COLORS[p.colorId];
    const isWheel = PARTS[p.partId]?.shape === "wheel";
    const isCore = p.component === "core";
    const restY = p.y * PLATE - baseY;
    const hex = isWheel ? "#2a2a2a" : (color?.hex ?? "#999");
    useLayoutEffect(() => {
      const m = ref.current;
      if (!m) return;
      m.userData.rest = new THREE.Vector3(p.x, restY, p.z);
      m.userData.center = geom.boundingBox ? geom.boundingBox.getCenter(new THREE.Vector3()) : new THREE.Vector3();
      register(k, m);
      return () => register(k, null);
    }, [k, p.x, p.z, restY, geom, register]);
    return (
      <mesh ref={ref} geometry={geom} position={[p.x, restY, p.z]} castShadow receiveShadow>
        <meshStandardMaterial
          color={hex}
          roughness={isCore ? 0.15 : 0.32}
          metalness={0.02}
          transparent={!!color?.transparent}
          opacity={color?.transparent ? (isCore ? 0.78 : 0.55) : 1}
          emissive={isCore ? hex : "#000000"}
          emissiveIntensity={isCore ? 0.6 : 0}
        />
      </mesh>
    );
  },
  (a, b) => a.k === b.k && a.baseY === b.baseY && a.register === b.register && a.p.colorId === b.p.colorId && a.p.component === b.p.component,
);

function AliveCreature({
  parts,
  bounds,
  reduced,
  assembleKey,
  onAssembled,
  onPartRevealed,
}: {
  parts: PlacedPart[];
  bounds: Bounds;
  reduced: boolean;
  assembleKey: number;
  onAssembled?: () => void;
  onPartRevealed?: (p: PlacedPart, index: number, total: number) => void;
}) {
  const stage = useRef<THREE.Group>(null);
  const root = useRef<THREE.Group>(null);
  const offset = useRef<THREE.Group>(null);
  const blink = useRef<THREE.Group>(null);
  const coreLight = useRef<THREE.PointLight>(null);
  const coreHalo = useRef<THREE.Sprite>(null);
  const meshes = useRef(new Map<string, THREE.Mesh>()).current;
  const tweens = useRef(new Map<string, Tween>()).current;
  const prevKeys = useRef<Set<string> | null>(null);
  const lastAssemble = useRef(assembleKey);
  const reveal = useRef<{ start: number; length: number; done: boolean } | null>(null);
  const hop = useRef<{ start: number; height: number } | null>(null);
  const blinkState = useRef({ next: 2 + Math.random() * 2, until: 0, closed: false });
  const centered = useRef(false);
  const callbacks = useRef({ onAssembled, onPartRevealed });
  useLayoutEffect(() => {
    callbacks.current = { onAssembled, onPartRevealed };
  });

  const items = useMemo(() => keyed(parts), [parts]);
  const isEye = (p: PlacedPart) => p.component === "eyes" || p.component === "pupils";
  const eyeBase = useMemo(() => {
    const ys = items.filter(({ p }) => isEye(p)).map(({ p }) => p.y * PLATE);
    return ys.length ? Math.min(...ys) : 0;
  }, [items]);
  const core = items.find(({ p }) => p.component === "core")?.p;
  const coreHex = core ? (COLORS[core.colorId]?.hex ?? "#aeefec") : "#aeefec";

  const register = useCallback(
    (k: string, m: THREE.Mesh | null) => {
      if (m) meshes.set(k, m);
      else meshes.delete(k);
    },
    [meshes],
  );

  // New bricks after an edit drop in from above with a bounce (only the ones that changed).
  useLayoutEffect(() => {
    const keys = new Set(items.map((i) => i.key));
    const prev = prevKeys.current;
    prevKeys.current = keys;
    if (!prev || reduced) return;
    const fresh = items.filter((i) => !prev.has(i.key)).sort((a, b) => a.p.y - b.p.y || a.p.x - b.p.x);
    fresh.forEach((i, n) => {
      tweens.set(i.key, { delay: Math.min(n * 0.012, 0.15), start: NaN, dur: DROP_SECONDS, lift: DROP_LIFT });
      const m = meshes.get(i.key);
      if (m) m.position.y = (m.userData.rest as THREE.Vector3).y + DROP_LIFT;
    });
    if (fresh.length) hop.current = { start: NaN, height: 0.5 };
  }, [items, reduced, meshes, tweens]);

  // "Bring it to life!": hide everything, then rebuild in true build order, core last.
  useLayoutEffect(() => {
    if (assembleKey === lastAssemble.current) return;
    lastAssemble.current = assembleKey;
    tweens.clear();
    if (reduced) {
      meshes.forEach((m) => {
        m.visible = true;
        m.position.copy(m.userData.rest as THREE.Vector3);
        m.scale.setScalar(1);
      });
      reveal.current = null;
      callbacks.current.onAssembled?.();
      return;
    }
    const order = revealOrder(items.map((i) => ({ ...i, step: i.p.step, y: i.p.y, x: i.p.x, z: i.p.z, component: i.p.component })));
    const step = revealStep(order.length);
    order.forEach((o, i) => {
      tweens.set(o.key, { delay: i * step, start: NaN, dur: REVEAL_DROP_SECONDS, lift: REVEAL_LIFT, hidden: true, index: i, total: order.length, part: o.p, pulse: o.p.component === "core" });
      const m = meshes.get(o.key);
      if (m) m.visible = false;
    });
    reveal.current = { start: NaN, length: Math.max(0, order.length - 1) * step + REVEAL_DROP_SECONDS + CORE_PULSE_SECONDS, done: false };
    blinkState.current.closed = true;
  }, [assembleKey, items, reduced, meshes, tweens]);

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;

    // Keep the creature centered over the turntable (eases when a tail or head changes its size).
    const g = offset.current;
    const sg = stage.current;
    if (g && sg) {
      const tx = -(bounds.minX + bounds.maxX) / 2;
      const tz = -(bounds.minZ + bounds.maxZ) / 2;
      const ty = -bounds.maxY * 0.42;
      if (!centered.current || reduced) {
        g.position.set(tx, 0, tz);
        sg.position.set(0, ty, 0);
        centered.current = true;
      } else {
        const a = 1 - Math.exp(-dt * 6);
        g.position.x += (tx - g.position.x) * a;
        g.position.z += (tz - g.position.z) * a;
        sg.position.y += (ty - sg.position.y) * a;
      }
    }

    // Drop-ins and the assembly reveal.
    for (const [k, tw] of tweens) {
      const m = meshes.get(k);
      if (!m) {
        tweens.delete(k);
        continue;
      }
      if (Number.isNaN(tw.start)) tw.start = t + tw.delay;
      const rest = m.userData.rest as THREE.Vector3;
      const u = (t - tw.start) / tw.dur;
      if (u < 0) {
        m.visible = !tw.hidden;
        m.position.y = rest.y + tw.lift;
        continue;
      }
      if (!tw.shown) {
        tw.shown = true;
        m.visible = true;
        if (tw.part && tw.index !== undefined && tw.total !== undefined) callbacks.current.onPartRevealed?.(tw.part, tw.index, tw.total);
      }
      if (u < 1) {
        m.position.y = rest.y + tw.lift * (1 - easeOutBack(u));
        continue;
      }
      if (tw.pulse) {
        const v = (t - tw.start - tw.dur) / CORE_PULSE_SECONDS;
        if (v < 1) {
          const s = 1 + 0.3 * Math.sin(Math.PI * v);
          const c = m.userData.center as THREE.Vector3;
          m.scale.setScalar(s);
          m.position.set(rest.x - c.x * (s - 1), rest.y - c.y * (s - 1), rest.z - c.z * (s - 1));
          continue;
        }
      }
      m.scale.setScalar(1);
      m.position.copy(rest);
      tweens.delete(k);
    }

    // Reveal finished: eyes blink open, a little hop, and tell the Lab.
    const r = reveal.current;
    if (r && !r.done) {
      if (Number.isNaN(r.start)) r.start = t;
      if (t >= r.start + r.length) {
        r.done = true;
        reveal.current = null;
        blinkState.current.closed = false;
        blinkState.current.next = t + 2.5;
        hop.current = { start: t, height: 1.2 };
        callbacks.current.onAssembled?.();
      }
    }

    // Idle: gentle bob and sway, plus the hop.
    const rg = root.current;
    if (rg) {
      let y = 0;
      if (!reduced) {
        y = 0.16 * Math.sin(2 * t);
        rg.rotation.y = 0.07 * Math.sin(0.6 * t);
        const h = hop.current;
        if (h) {
          if (Number.isNaN(h.start)) h.start = t;
          const v = (t - h.start) / HOP_SECONDS;
          if (v >= 1) hop.current = null;
          else y += h.height * Math.sin(Math.PI * v);
        }
      }
      rg.position.y = y;
    }

    // Blink every 3-5 s (allowed with reduced motion too).
    const b = blinkState.current;
    if (!b.closed && t >= b.next) {
      b.until = t + BLINK_SECONDS;
      b.next = t + 3 + Math.random() * 2;
    }
    if (blink.current) blink.current.scale.y = b.closed || t < b.until ? 0.15 : 1;

    // The power core glows in its power color.
    if (core) {
      const m = meshes.get(partKey(core));
      const mat = m?.material as THREE.MeshStandardMaterial | undefined;
      const pulse = reduced ? 0.6 : 0.5 + 0.4 * Math.sin(3 * t);
      if (mat) mat.emissiveIntensity = pulse;
      const lit = m?.visible !== false;
      if (coreLight.current) coreLight.current.intensity = lit ? 6 * pulse : 0;
      const halo = coreHalo.current;
      if (halo) {
        halo.visible = lit;
        halo.scale.setScalar(2.4 + 1.4 * pulse);
        (halo.material as THREE.SpriteMaterial).opacity = 0.4 + 0.5 * pulse;
      }
    }
  });

  const radius = Math.max(4, bounds.radius * 1.1);
  // stage (height easing) > turntable + root (bob, hop, sway about the creature's center) > offset (centering) > bricks
  return (
    <group ref={stage}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.03, 0]} receiveShadow>
        <circleGeometry args={[radius, 64]} />
        <meshStandardMaterial color="#ffffff" transparent opacity={0.5} roughness={0.9} />
      </mesh>
      <group ref={root}>
        <group ref={offset}>
          {items
            .filter(({ p }) => !isEye(p))
            .map(({ key, p }) => (
              <AlivePart key={key} k={key} p={p} baseY={0} register={register} />
            ))}
          <group ref={blink} position={[0, eyeBase, 0]}>
            {items
              .filter(({ p }) => isEye(p))
              .map(({ key, p }) => (
                <AlivePart key={key} k={key} p={p} baseY={eyeBase} register={register} />
              ))}
          </group>
          {core && <pointLight ref={coreLight} position={[core.x + 0.5, core.y * PLATE + 0.9, core.z + 0.5]} color={coreHex} intensity={3} distance={7} decay={1.6} />}
          {core && (
            <sprite ref={coreHalo} position={[core.x + 0.5, core.y * PLATE + 0.7, core.z + 0.5]} scale={[2.8, 2.8, 1]}>
              <spriteMaterial map={glowTexture()} color={coreHex} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={0.6} toneMapped={false} />
            </sprite>
          )}
        </group>
      </group>
    </group>
  );
}
