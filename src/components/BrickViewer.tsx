"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { COLORS } from "@/lib/catalog/colors";
import { PARTS } from "@/lib/catalog/parts";
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
    parts.push(g.toNonIndexed());
    if (def.topStuds === "back-row") parts.push(...studs(allCells.filter(([, z]) => z === def.d - 1), H));
  } else if (def.shape === "round") {
    const g = new THREE.CylinderGeometry(0.45, 0.45, H - GAP, 20);
    g.translate(0.5, H / 2, 0.5);
    parts.push(g, ...studs([[0, 0]], H));
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
    geoCache.set(key, g);
  }
  return g;
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

export default function BrickViewer({ parts, uptoStep, highlightStep }: { parts: PlacedPart[]; uptoStep?: number; highlightStep?: number }) {
  const visible = uptoStep ? parts.filter((p) => p.step <= uptoStep) : parts;
  const bounds = useMemo(() => {
    let maxX = 1, maxZ = 1, maxY = 1;
    for (const p of parts) {
      const def = PARTS[p.partId];
      const swap = p.rot === 90 || p.rot === 270;
      maxX = Math.max(maxX, p.x + (swap ? def.d : def.w));
      maxZ = Math.max(maxZ, p.z + (swap ? def.w : def.d));
      maxY = Math.max(maxY, (p.y + def.h) * PLATE);
    }
    return { cx: maxX / 2, cz: maxZ / 2, cy: maxY / 2, size: Math.max(maxX, maxZ, maxY) };
  }, [parts]);
  const dist = bounds.size * 1.7 + 4;
  return (
    <Canvas shadows camera={{ position: [bounds.cx + dist * 0.75, bounds.cy + dist * 0.65, bounds.cz - dist * 0.8], fov: 40 }} dpr={[1, 2]}>
      <ambientLight intensity={0.55} />
      <directionalLight position={[10, 18, -8]} intensity={1.6} castShadow shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-10, 8, 10]} intensity={0.4} />
      <group>
        {visible.map((p) => (
          <Part key={p.uid} p={p} faded={highlightStep !== undefined && p.step < highlightStep} />
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
