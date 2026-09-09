// Colour-codes by DamageMarkerType, shape-codes by DamageMarkerSeverity —
// the diagram (and eventually the PDF) must stay legible printed in
// greyscale, per the spec, so severity can never rely on colour alone.
import type { DamageMarkerType, DamageMarkerSeverity } from "@/lib/inspection";

// One of this app's existing design-token colours per type — reusing the
// palette already defined in styles.css (chart-1..5 plus the semantic
// tokens) rather than inventing a new one.
export const MARKER_TYPE_COLOR: Record<DamageMarkerType, string> = {
  scratch: "var(--chart-1)",
  dent: "var(--chart-2)",
  chip: "var(--chart-3)",
  crack: "var(--chart-4)",
  rust: "var(--chart-5)",
  swirl: "var(--info)",
  paint_defect: "var(--warning)",
  scuff: "var(--success)",
  missing_part: "var(--destructive)",
  other: "var(--charcoal)",
};

export const MARKER_TYPE_LABELS: Record<DamageMarkerType, string> = {
  scratch: "Scratch",
  dent: "Dent",
  chip: "Chip",
  crack: "Crack",
  rust: "Rust",
  swirl: "Swirl",
  paint_defect: "Paint defect",
  scuff: "Scuff",
  missing_part: "Missing part",
  other: "Other",
};

export type MarkerShape = "circle" | "triangle" | "diamond";

export const SEVERITY_SHAPE: Record<DamageMarkerSeverity, MarkerShape> = {
  minor: "circle",
  moderate: "triangle",
  severe: "diamond",
};

export const SEVERITY_LABELS: Record<DamageMarkerSeverity, string> = {
  minor: "Minor",
  moderate: "Moderate",
  severe: "Severe",
};

/** SVG path for `shape`, centred at (0,0), sized to roughly match a circle
 *  of the given radius so the three shapes read as the same "weight". */
export function markerShapePath(shape: MarkerShape, radius: number): string {
  if (shape === "circle") {
    // Rendered as a <circle> by the caller instead — this branch exists so
    // callers can treat all three uniformly if they'd rather always draw a
    // <path>. Approximated here as a rounded square for that case.
    return `M ${-radius} 0 A ${radius} ${radius} 0 1 0 ${radius} 0 A ${radius} ${radius} 0 1 0 ${-radius} 0 Z`;
  }
  if (shape === "triangle") {
    const h = radius * 1.15;
    return `M 0 ${-h} L ${h * 0.95} ${h * 0.7} L ${-h * 0.95} ${h * 0.7} Z`;
  }
  // diamond
  const d = radius * 1.05;
  return `M 0 ${-d} L ${d} 0 L 0 ${d} L ${-d} 0 Z`;
}
