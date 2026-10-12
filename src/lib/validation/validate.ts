import { COLORS } from "../catalog/colors";
import { PARTS, getPart } from "../catalog/parts";
import { footprint, footprintCells, topStudCells } from "../model/geometry";
import type { DesignModel, PlacedPart } from "../model/types";

export interface ValidationIssue {
  code: string;
  message: string;
  parts?: string[];
}

export interface ValidationResult {
  /** "valid" means every deterministic digital check passed. */
  status: "valid" | "invalid";
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  stats: { partCount: number; studConnections: number; steps: number };
  /** Physical validation is a separate, manual gate (see physical-validations). */
  physicallyValidated: boolean;
  structuralKey: string;
  /** Short disclaimer shown wherever validation is displayed. */
  scope: string;
}

export const VALIDATION_SCOPE =
  "Digital checks cover catalog membership, collisions, stud connectivity to the ground and step ordering. " +
  "Connectivity does not prove stability or that the model is easy to assemble; that needs a physical test build.";

const key = (x: number, y: number, z: number) => `${x},${y},${z}`;

export interface StudGraph {
  edges: Map<string, Set<string>>;
  studConnections: number;
  connectionCount: Map<string, number>;
}

/** Build the connection graph: stud-to-antistud contacts plus declared pin attachments. */
export function buildGraph(parts: PlacedPart[]): StudGraph {
  const bottomIndex = new Map<string, string>(); // cell at a part's bottom layer -> uid
  for (const p of parts) {
    const def = PARTS[p.partId];
    if (!def || !def.bottomAcceptsStuds) continue;
    for (const c of footprintCells(p)) bottomIndex.set(key(c.x, p.y, c.z), p.uid);
  }
  const edges = new Map<string, Set<string>>();
  const connectionCount = new Map<string, number>();
  const link = (a: string, b: string, n = 1) => {
    if (!edges.has(a)) edges.set(a, new Set());
    if (!edges.has(b)) edges.set(b, new Set());
    edges.get(a)!.add(b);
    edges.get(b)!.add(a);
    connectionCount.set(a, (connectionCount.get(a) ?? 0) + n);
    connectionCount.set(b, (connectionCount.get(b) ?? 0) + n);
  };
  let studConnections = 0;
  for (const p of parts) {
    if (!PARTS[p.partId]) continue;
    const top = p.y + getPart(p.partId).h;
    const counts = new Map<string, number>();
    for (const c of topStudCells(p)) {
      const above = bottomIndex.get(key(c.x, top, c.z));
      if (above && above !== p.uid) counts.set(above, (counts.get(above) ?? 0) + 1);
    }
    for (const [other, n] of counts) {
      link(p.uid, other, n);
      studConnections += n;
    }
  }
  for (const p of parts) if (p.attachedTo) link(p.uid, p.attachedTo, 2);
  return { edges, studConnections, connectionCount };
}

export function validateModel(model: DesignModel, physicallyValidatedKeys: ReadonlySet<string> = new Set()): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const parts = model.parts;
  const uids = new Set<string>();

  for (const p of parts) {
    if (uids.has(p.uid)) errors.push({ code: "duplicate_uid", message: `Duplicate part id ${p.uid}`, parts: [p.uid] });
    uids.add(p.uid);
    if (!PARTS[p.partId]) errors.push({ code: "unknown_part", message: `Unknown part ${p.partId}`, parts: [p.uid] });
    if (!COLORS[p.colorId]) errors.push({ code: "unknown_color", message: `Unknown color ${p.colorId}`, parts: [p.uid] });
    if (![0, 90, 180, 270].includes(p.rot)) errors.push({ code: "bad_rotation", message: `Unsupported rotation ${p.rot}`, parts: [p.uid] });
    if (p.x < 0 || p.y < 0 || p.z < 0 || !Number.isInteger(p.x) || !Number.isInteger(p.y) || !Number.isInteger(p.z))
      errors.push({ code: "off_grid", message: `Part ${p.uid} is off the stud grid`, parts: [p.uid] });
    if (!Number.isInteger(p.step) || p.step < 1 || p.step > model.steps.length)
      errors.push({ code: "bad_step", message: `Part ${p.uid} has no valid assembly step`, parts: [p.uid] });
  }
  for (const comp of model.components) {
    if (!comp.allowedColors.includes(comp.colorId))
      errors.push({ code: "color_not_allowed", message: `${comp.label} color ${comp.colorId} is not in the supported palette` });
  }
  if (errors.length) return finish();

  // Collisions on the voxel grid (1 stud x 1 plate x 1 stud).
  const occ = new Map<string, string>();
  for (const p of parts) {
    const fp = footprint(p);
    for (const c of footprintCells(p)) {
      for (let dy = 0; dy < fp.H; dy++) {
        const k = key(c.x, p.y + dy, c.z);
        const other = occ.get(k);
        if (other) {
          errors.push({ code: "collision", message: `Parts ${other} and ${p.uid} overlap at ${k}`, parts: [other, p.uid] });
        } else occ.set(k, p.uid);
      }
    }
  }
  if (errors.length) return finish();

  // Pin attachments must reference an existing holder directly adjacent.
  const byUid = new Map(parts.map((p) => [p.uid, p] as const));
  for (const p of parts) {
    if (!p.attachedTo) continue;
    const host = byUid.get(p.attachedTo);
    if (!host || getPart(host.partId).shape !== "wheelHolder") {
      errors.push({ code: "bad_attachment", message: `Part ${p.uid} must attach to a wheel holder`, parts: [p.uid] });
      continue;
    }
    const hostCells = footprintCells(host);
    const near = footprintCells(p).some((c) => hostCells.some((h) => Math.abs(h.z - c.z) <= 2 && h.x === c.x));
    if (!near) errors.push({ code: "bad_attachment", message: `Wheel ${p.uid} is not next to its holder`, parts: [p.uid] });
  }

  // Connectivity: everything must connect (through studs or pins) to a part on the ground.
  const graph = buildGraph(parts);
  const grounded = new Set<string>();
  const queue = parts.filter((p) => p.y === 0).map((p) => p.uid);
  queue.forEach((u) => grounded.add(u));
  while (queue.length) {
    const u = queue.shift()!;
    for (const v of graph.edges.get(u) ?? []) if (!grounded.has(v)) (grounded.add(v), queue.push(v));
  }
  const floating = parts.filter((p) => !grounded.has(p.uid)).map((p) => p.uid);
  if (floating.length)
    errors.push({ code: "disconnected", message: `${floating.length} part(s) are not connected to the rest of the model`, parts: floating });

  // Assembly order: each part must connect to something placed in the same or an earlier step (or the ground).
  for (const p of parts) {
    if (p.y === 0) continue;
    const ok = [...(graph.edges.get(p.uid) ?? [])].some((v) => (byUid.get(v)?.step ?? Infinity) <= p.step);
    if (!ok) errors.push({ code: "step_order", message: `Part ${p.uid} (step ${p.step}) has nothing to attach to yet`, parts: [p.uid] });
  }
  // Inserting a part underneath already-placed parts is awkward: warn.
  for (const p of parts) {
    const top = p.y + getPart(p.partId).h;
    const blockers = new Set<string>();
    for (const c of footprintCells(p)) {
      const above = occ.get(key(c.x, top, c.z));
      if (above && (byUid.get(above)?.step ?? 0) < p.step) blockers.add(above);
    }
    if (blockers.size) warnings.push({ code: "insert_from_below", message: `Part ${p.uid} must be pushed in under parts from an earlier step`, parts: [p.uid] });
  }
  // Weak connections (single stud) are flagged; they may hold but are worth a physical check.
  for (const p of parts) {
    if (p.attachedTo) continue;
    const n = graph.connectionCount.get(p.uid) ?? 0;
    if (n === 1) warnings.push({ code: "single_stud", message: `Part ${p.uid} is held by a single stud`, parts: [p.uid] });
  }
  // Cantilever heuristic: horizontal extent beyond the cells directly supported below.
  const supported = new Set<string>();
  for (const p of parts) for (const c of footprintCells(p)) supported.add(`${c.x},${c.z}`);
  for (const p of parts) {
    const fp = footprint(p);
    if (Math.max(fp.W, fp.D) >= 8) {
      const below = footprintCells(p).filter((c) => occ.has(key(c.x, p.y - 1, c.z))).length;
      if (p.y > 0 && below <= 2)
        warnings.push({ code: "long_overhang", message: `Part ${p.uid} is long and supported on ${below} stud(s); test physically`, parts: [p.uid] });
    }
  }

  return finish(graph.studConnections);

  function finish(studConnections = 0): ValidationResult {
    return {
      status: errors.length ? "invalid" : "valid",
      errors,
      warnings,
      stats: { partCount: parts.length, studConnections, steps: model.steps.length },
      physicallyValidated: errors.length === 0 && physicallyValidatedKeys.has(model.structuralKey),
      structuralKey: model.structuralKey,
      scope: VALIDATION_SCOPE,
    };
  }
}
