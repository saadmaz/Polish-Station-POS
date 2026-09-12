// Pure coordinate data for the damage-diagram outlines — split out from
// silhouettes.tsx (the React/SVG rendering) so pdf.ts can redraw the exact
// same shapes with jsPDF's own line primitives for the inspection report
// (Phase 5). One data source, two renderers — this is what guarantees a
// marker's PDF position matches its on-screen position exactly, per the
// spec's acceptance criteria, rather than keeping two independently-typed
// copies in sync by hand.
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

/** [width, height] parsed out of viewBoxFor(view) — the denominator every
 *  marker's normalized {x,y} is scaled against. */
export function viewBoxSize(view: DamageMarkerView): [number, number] {
  const [, , w, h] = viewBoxFor(view).split(" ").map(Number);
  return [w, h];
}

export type Point = readonly [number, number];

// ── Profile (left/right) — right is the same body, mirrored via a transform
// in VehicleSilhouette (screen) / a horizontal flip (PDF) rather than a
// second point set. ────────────────────────────────────────────────────────

// The hood/roof/trunk outline only — the flat "L" a bare Z-close would draw
// across the bottom is replaced below with an explicit wheel-arch cutout, so
// this is deliberately NOT the full outline. Kept private; PROFILE_BODY
// (below) is what everything else imports.
const PROFILE_TOP: Record<BodyType, readonly Point[]> = {
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

export const PROFILE_WHEELS: Record<BodyType, readonly [number, number]> = {
  sedan: [100, 300],
  hatchback: [95, 280],
  suv: [100, 300],
  coupe: [105, 300],
  van: [90, 310],
  double_cab: [95, 315],
};

// Ground line every PROFILE_TOP entry above sits on (its first/last point is
// always y=140) — the constant every wheel-arch/wheel-circle computation
// below measures from.
const PROFILE_GROUND_Y = 140;
// Bigger than the r=20 wheel circle silhouettes.tsx/pdf.ts draw, so the
// silhouette reads as a wheel *arch* the wheel sits inside, not a wheel
// clipping straight through the bodywork — the gap between the two radii is
// the visible "fender" lip.
const WHEEL_ARCH_RADIUS = 27;

/** A half-circle notch cut up into the body outline above (cx, groundY),
 *  traced right-to-left (from (cx+radius, groundY) to (cx-radius, groundY))
 *  as plain line segments — matching the direction PROFILE_BODY's overall
 *  outline travels along its ground line (front-of-array's rear-bottom
 *  corner back to its own front-bottom corner), and consistent with every
 *  other shape in this file: drawable by both the SVG path builder and
 *  jsPDF's straight-line polygon stroke, no arcs. */
function wheelArchPoints(cx: number, groundY: number, radius: number): Point[] {
  const segments = 8;
  const pts: Point[] = [];
  for (let i = 0; i <= segments; i++) {
    const angle = (Math.PI * i) / segments; // sweeps 0 → π
    pts.push([cx + radius * Math.cos(angle), groundY - radius * Math.sin(angle)]);
  }
  return pts;
}

/** The full profile outline: PROFILE_TOP's hood/roof/trunk trace, followed
 *  by the ground line with a wheel-arch notch cut over each wheel — computed
 *  once at module load from PROFILE_TOP + PROFILE_WHEELS rather than
 *  hand-plotted per body type, so the arches always line up with wherever
 *  PROFILE_WHEELS actually puts the wheels. */
export const PROFILE_BODY: Record<BodyType, readonly Point[]> = Object.fromEntries(
  (Object.keys(PROFILE_TOP) as BodyType[]).map((bodyType) => {
    const [frontX, rearX] = PROFILE_WHEELS[bodyType];
    return [
      bodyType,
      [
        ...PROFILE_TOP[bodyType],
        ...wheelArchPoints(rearX, PROFILE_GROUND_Y, WHEEL_ARCH_RADIUS),
        ...wheelArchPoints(frontX, PROFILE_GROUND_Y, WHEEL_ARCH_RADIUS),
      ],
    ];
  }),
) as unknown as Record<BodyType, readonly Point[]>;

// ── Front / rear ─────────────────────────────────────────────────────────
export const FRONT_REAR_BODY: Record<BodyType, readonly Point[]> = {
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
export const TOP_BODY: Record<BodyType, readonly Point[]> = {
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

/** The body outline points for `view`, already mirrored for "right" — the
 *  one place both the screen (SVG transform) and the PDF (this function)
 *  need to agree on what "right" means, since jsPDF has no transform API
 *  as convenient as SVG's. */
export function bodyOutlinePoints(bodyType: BodyType, view: DamageMarkerView): Point[] {
  if (view === "top") return [...TOP_BODY[bodyType]];
  if (view === "front" || view === "rear") return [...FRONT_REAR_BODY[bodyType]];
  const points = PROFILE_BODY[bodyType];
  if (view === "left") return [...points];
  const [, , w] = PROFILE_VIEWBOX.split(" ").map(Number);
  return points.map(([x, y]) => [w - x, y] as Point);
}

/** Wheel centre x-coordinates for the profile view, mirrored the same way
 *  bodyOutlinePoints() is for "right". Front/rear/top views draw wheels
 *  differently (or not at all) and don't use this. */
export function profileWheelCentres(bodyType: BodyType, view: "left" | "right"): [number, number] {
  const [frontX, rearX] = PROFILE_WHEELS[bodyType];
  if (view === "left") return [frontX, rearX];
  const [, , w] = PROFILE_VIEWBOX.split(" ").map(Number);
  return [w - frontX, w - rearX];
}
