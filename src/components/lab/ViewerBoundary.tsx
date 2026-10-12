"use client";

import { Component, useMemo, type ReactNode } from "react";
import { renderIso, toSvg } from "@/lib/instructions/iso";
import type { PlacedPart } from "@/lib/model/types";

/** A still, bobbing picture of the creature (used when 3D is unavailable or still loading). */
export function IsoCreature({ parts, className = "" }: { parts: PlacedPart[]; className?: string }) {
  const src = useMemo(() => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(toSvg(renderIso(parts), { width: 520, padding: 0.6 }))}`, [parts]);
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={`lab-iso ${className}`} src={src} alt="" draggable={false} />;
}

/**
 * If WebGL is missing or the 3D stage fails, show the still picture instead.
 * Kids never see an error message: the creature is simply there.
 */
export default class ViewerBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    // Intentionally silent: the fallback picture is shown.
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
