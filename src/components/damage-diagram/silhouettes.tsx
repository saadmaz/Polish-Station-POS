// Original, hand-drawn outline shapes — not traced from any photo, template,
// or third-party asset. Deliberately simple geometric silhouettes (straight
// segments, no bezier tracing of a real vehicle's contours): good enough to
// place damage markers on accurately and distinguish one body type from
// another at a glance, not a photorealistic illustration. Swappable for
// licensed/commissioned artwork later without touching any data model — a
// DamageMarker only ever stores normalized {x,y} against a view's viewBox,
// never anything about the artwork itself.
//
// Front and rear reuse the same silhouette per body type (a simplification:
// real vehicles differ front-to-back, but the outline only needs to be
// consistent enough to place a marker on "the front bumper" vs "the rear
// bumper" — the label above the diagram carries that distinction, not the
// artwork). Top view carries no wheel hints; profile and front/rear do.
import type { BodyType } from "@/lib/job";
import type { DamageMarkerView } from "@/lib/inspection";

export const PROFILE_VIEWBOX = "0 0 400 180";
export const FRONT_REAR_VIEWBOX = "0 0 260 180";
export const TOP_VIEWBOX = "0 0 400 200";

export function viewBoxFor(view: DamageMarkerView): string {
  if (view === "front" || view === "rear") return FRONT_REAR_VIEWBOX;
  if (view === "top") return TOP_VIEWBOX;
  return PROFILE_VIEWBOX;
}

type Point = readonly [number, number];

function pointsToPath(points: readonly Point[]): string {
  return points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x} ${y}`).join(" ") + " Z";
}

// ── Profile (left/right) — right is the same body, mirrored via a transform
// in VehicleSilhouette rather than a second point set. ─────────────────────
const PROFILE_BODY: Record<BodyType, readonly Point[]> = {
  sedan: [
    [30, 140],
    [30, 115],
    [55, 90],
    [115, 68],
    [150, 45],
    [255, 45],
    [290, 75],
    [345, 100],
    [370, 120],
    [370, 140],
  ],
  hatchback: [
    [30, 140],
    [30, 115],
    [55, 90],
    [115, 68],
    [150, 45],
    [240, 45],
    [270, 60],
    [300, 100],
    [330, 125],
    [330, 140],
  ],
  suv: [
    [30, 140],
    [30, 110],
    [60, 80],
    [110, 55],
    [140, 35],
    [270, 35],
    [310, 60],
    [330, 90],
    [345, 120],
    [345, 140],
  ],
  coupe: [
    [30, 140],
    [30, 120],
    [60, 95],
    [130, 60],
    [165, 40],
    [225, 40],
    [280, 70],
    [330, 105],
    [355, 125],
    [355, 140],
  ],
  van: [
    [30, 140],
    [30, 50],
    [40, 30],
    [340, 30],
    [350, 50],
    [360, 90],
    [370, 120],
    [370, 140],
  ],
  double_cab: [
    [30, 140],
    [30, 110],
    [60, 80],
    [105, 55],
    [135, 38],
    [215, 38],
    [240, 85],
    [240, 105],
    [370, 105],
    [370, 140],
  ],
};

const PROFILE_WHEELS: Record<BodyType, readonly [number, number]> = {
  sedan: [100, 300],
  hatchback: [95, 280],
  suv: [100, 300],
  coupe: [105, 300],
  van: [90, 310],
  double_cab: [95, 315],
};

// ── Front / rear ─────────────────────────────────────────────────────────
const FRONT_REAR_BODY: Record<BodyType, readonly Point[]> = {
  sedan: [
    [40, 140],
    [45, 90],
    [75, 55],
    [130, 40],
    [185, 55],
    [215, 90],
    [220, 140],
  ],
  hatchback: [
    [42, 140],
    [47, 92],
    [78, 58],
    [130, 44],
    [182, 58],
    [213, 92],
    [218, 140],
  ],
  suv: [
    [30, 140],
    [35, 80],
    [65, 40],
    [130, 25],
    [195, 40],
    [225, 80],
    [230, 140],
  ],
  coupe: [
    [45, 140],
    [50, 95],
    [80, 62],
    [130, 50],
    [180, 62],
    [210, 95],
    [215, 140],
  ],
  van: [
    [28, 140],
    [30, 55],
    [45, 25],
    [130, 18],
    [215, 25],
    [230, 55],
    [232, 140],
  ],
  double_cab: [
    [32, 140],
    [37, 78],
    [68, 40],
    [130, 26],
    [192, 40],
    [223, 78],
    [228, 140],
  ],
};

// ── Top ───────────────────────────────────────────────────────────────────
const TOP_BODY: Record<BodyType, readonly Point[]> = {
  sedan: [
    [190, 20],
    [230, 30],
    [250, 60],
    [255, 140],
    [235, 175],
    [165, 175],
    [145, 140],
    [150, 60],
    [170, 30],
  ],
  hatchback: [
    [190, 20],
    [228, 30],
    [246, 58],
    [250, 130],
    [230, 165],
    [170, 165],
    [150, 130],
    [154, 58],
    [172, 30],
  ],
  suv: [
    [185, 15],
    [235, 25],
    [258, 55],
    [265, 145],
    [240, 180],
    [160, 180],
    [135, 145],
    [142, 55],
    [165, 25],
  ],
  coupe: [
    [190, 25],
    [225, 35],
    [242, 62],
    [246, 135],
    [228, 168],
    [172, 168],
    [154, 135],
    [158, 62],
    [175, 35],
  ],
  van: [
    [180, 12],
    [240, 18],
    [262, 45],
    [268, 155],
    [245, 185],
    [155, 185],
    [132, 155],
    [138, 45],
    [160, 18],
  ],
  double_cab: [
    [185, 15],
    [232, 25],
    [255, 55],
    [260, 100],
    [255, 145],
    [235, 178],
    [165, 178],
    [145, 145],
    [140, 100],
    [145, 55],
    [168, 25],
  ],
};

export const BODY_TYPE_LABELS: Record<BodyType, string> = {
  sedan: "Sedan",
  hatchback: "Hatchback",
  suv: "SUV",
  double_cab: "Double Cab",
  van: "Van",
  coupe: "Coupe",
};

interface VehicleSilhouetteProps {
  bodyType: BodyType;
  view: DamageMarkerView;
  className?: string;
}

/** The outline only — no markers, no interaction. Composed inside
 *  DamageDiagram's own <svg> so marker coordinates share the same
 *  coordinate space as this artwork. */
export function VehicleSilhouette({ bodyType, view, className }: VehicleSilhouetteProps) {
  if (view === "top") {
    return (
      <path
        d={pointsToPath(TOP_BODY[bodyType])}
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
          d={pointsToPath(FRONT_REAR_BODY[bodyType])}
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
        d={pointsToPath(PROFILE_BODY[bodyType])}
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
