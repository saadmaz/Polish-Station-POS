// Real commissioned Illustrator artwork (five PNGs, one per view — see
// silhouette-data.ts's "Sedan real artwork" section for how they were vetted
// to be generic, not traced from a real model), used for every body type,
// not just sedans — one generic car silhouette is close enough to place a
// damage marker accurately regardless of the vehicle's actual shape.
// Rendered as a full-bleed <image> with each panel's hit region as an
// invisible overlay on top — a DamageMarker only ever stores normalized
// {x,y} against the view's viewBox, never anything about the artwork, so
// swapping the PNGs again later needs no data-model change. pdf.ts's
// printed report embeds the same PNGs (doc.addImage), not a redrawn vector
// copy. The original hand-drawn single-blob vector outline this used to
// fall back to for non-sedan body types is gone.
import type { BodyType } from "@/lib/job";
import type { DamageMarkerView } from "@/lib/inspection";
import {
  SEDAN_IMAGE_SRC,
  SEDAN_IMAGE_VIEWBOX,
  sedanImagePanelsForView,
  isPanelCircle,
  isPanelMultiPoly,
  type Point,
  type SedanPanel,
} from "./silhouette-data";

export { BODY_TYPE_LABELS, panelLabel, SEDAN_IMAGE_VIEWBOX } from "./silhouette-data";

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
  // Kept in the props shape (rather than dropped entirely) even though
  // every body type now renders identically — DamageDiagram already has it
  // on hand from the Job it's inspecting, and keeping the prop means a
  // future body-type-specific artwork set (if one ever gets commissioned)
  // is a one-line change here, not a call-site migration.
  bodyType: BodyType;
  view: DamageMarkerView;
  className?: string;
}

/** The outline only — no markers, no interaction. Composed inside
 *  DamageDiagram's own <svg> so marker coordinates share the same
 *  coordinate space as this artwork. */
export function VehicleSilhouette({ view, className }: VehicleSilhouetteProps) {
  return renderSedanImage(view, className);
}
