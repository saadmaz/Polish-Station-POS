// Two different artwork strategies live in this file, one per body type.
//
// Sedan: real commissioned Illustrator artwork (five PNGs, one per view —
// see silhouette-data.ts's "Sedan real artwork" section for how they were
// vetted to be generic, not traced from a real model). Rendered as a
// full-bleed <image> with each panel's hit region as an invisible overlay
// on top — a DamageMarker only ever stores normalized {x,y} against the
// view's viewBox, never anything about the artwork, so swapping the PNGs
// again later needs no data-model change. pdf.ts's printed report embeds
// the same PNGs (doc.addImage), not a redrawn vector copy.
//
// Every other body type: the original hand-drawn, not-traced-from-anything
// single-blob outline (bodyOutlinePoints, in silhouette-data.ts) — deliberately
// simple straight-segment silhouettes, good enough to place a marker
// accurately and tell body types apart at a glance, not photorealistic.
// pdf.ts's report redraws these with jsPDF's own line primitives from the
// same point data (no image involved), which is what guarantees marker
// positions match on screen exactly. Front and rear reuse the same
// silhouette (the label above the diagram carries that distinction, not
// the artwork); top view carries no wheel hints, profile and front/rear do.
import type { BodyType } from "@/lib/job";
import type { DamageMarkerView } from "@/lib/inspection";
import {
  PROFILE_WHEELS,
  bodyOutlinePoints,
  type Point,
  SEDAN_IMAGE_SRC,
  SEDAN_IMAGE_VIEWBOX,
  sedanImagePanelsForView,
  isPanelCircle,
  isPanelMultiPoly,
  type SedanPanel,
} from "./silhouette-data";

export { viewBoxFor, BODY_TYPE_LABELS, panelLabel, SEDAN_IMAGE_VIEWBOX } from "./silhouette-data";

function pointsToPath(points: readonly Point[]): string {
  return points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x} ${y}`).join(" ") + " Z";
}

// Invisible on top of the real artwork below — fill="transparent" (not
// "none") is what makes an otherwise-invisible shape still receive pointer
// events, per elementFromPoint's rules; that's the whole hit-testing trick,
// see damage-diagram.tsx's resolvePanelId().
const HIT_REGION_PROPS = { fill: "transparent", stroke: "none" };

function renderImagePanel(panel: SedanPanel) {
  if (isPanelCircle(panel)) {
    return (
      <circle
        key={panel.id}
        id={panel.id}
        cx={panel.cx}
        cy={panel.cy}
        r={panel.r}
        {...HIT_REGION_PROPS}
      />
    );
  }
  const d = isPanelMultiPoly(panel)
    ? panel.subpaths.map((sp) => pointsToPath(sp)).join(" ")
    : pointsToPath(panel.points);
  return <path key={panel.id} id={panel.id} d={d} {...HIT_REGION_PROPS} />;
}

/** Sedan-only (Phase 1): the commissioned illustrator artwork as a full-bleed
 *  background image, with each panel's hit region as an invisible overlay
 *  on top — the visible line art comes entirely from the PNG now, the
 *  overlay only exists for elementFromPoint to resolve which panel-* a tap
 *  landed on. See silhouette-data.ts's "Sedan real artwork" section for
 *  where the coordinates come from and their accuracy caveats. */
function renderSedanImage(view: DamageMarkerView, className?: string) {
  const [, , vbW, vbH] = SEDAN_IMAGE_VIEWBOX[view].split(" ").map(Number);
  return (
    <g id={`view-${view}`} className={className}>
      <image href={SEDAN_IMAGE_SRC[view]} x={0} y={0} width={vbW} height={vbH} />
      {sedanImagePanelsForView(view).map(renderImagePanel)}
    </g>
  );
}

interface VehicleSilhouetteProps {
  bodyType: BodyType;
  view: DamageMarkerView;
  className?: string;
}

/** The outline only — no markers, no interaction. Composed inside
 *  DamageDiagram's own <svg> so marker coordinates share the same
 *  coordinate space as this artwork. */
export function VehicleSilhouette({ bodyType, view, className }: VehicleSilhouetteProps) {
  if (bodyType === "sedan") {
    return renderSedanImage(view, className);
  }

  if (view === "top") {
    return (
      <path
        d={pointsToPath(bodyOutlinePoints(bodyType, view))}
        className={className}
        fill="currentColor"
        fillOpacity={0.08}
        stroke="currentColor"
        strokeWidth={2}
        strokeLinejoin="round"
      />
    );
  }

  if (view === "front" || view === "rear") {
    return (
      <g className={className}>
        <path
          d={pointsToPath(bodyOutlinePoints(bodyType, view))}
          fill="currentColor"
          fillOpacity={0.08}
          stroke="currentColor"
          strokeWidth={2}
          strokeLinejoin="round"
        />
        <rect x={35} y={135} width={22} height={14} rx={3} fill="currentColor" fillOpacity={0.35} />
        <rect
          x={203}
          y={135}
          width={22}
          height={14}
          rx={3}
          fill="currentColor"
          fillOpacity={0.35}
        />
      </g>
    );
  }

  // profile — "right" mirrors the same body/wheel data horizontally about
  // the 400-wide viewBox's centre, rather than maintaining a second set.
  const [frontWheelX, rearWheelX] = PROFILE_WHEELS[bodyType];
  const mirror = view === "right";
  return (
    <g className={className} transform={mirror ? "translate(400,0) scale(-1,1)" : undefined}>
      <path
        d={pointsToPath(bodyOutlinePoints(bodyType, "left"))}
        fill="currentColor"
        fillOpacity={0.08}
        stroke="currentColor"
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <line x1={30} y1={140} x2={370} y2={140} stroke="currentColor" strokeWidth={2} />
      <circle cx={frontWheelX} cy={150} r={20} fill="currentColor" fillOpacity={0.35} />
      <circle cx={rearWheelX} cy={150} r={20} fill="currentColor" fillOpacity={0.35} />
    </g>
  );
}
