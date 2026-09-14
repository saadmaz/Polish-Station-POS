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
export const PROFILE_GROUND_Y = 140;
// Bigger than the r=20 wheel circle silhouettes.tsx/pdf.ts draw, so the
// silhouette reads as a wheel *arch* the wheel sits inside, not a wheel
// clipping straight through the bodywork — the gap between the two radii is
// the visible "fender" lip.
export const WHEEL_ARCH_RADIUS = 27;

/** A half-circle notch cut up into the body outline above (cx, groundY),
 *  traced right-to-left (from (cx+radius, groundY) to (cx-radius, groundY))
 *  as plain line segments — matching the direction PROFILE_BODY's overall
 *  outline travels along its ground line (front-of-array's rear-bottom
 *  corner back to its own front-bottom corner), and consistent with every
 *  other shape in this file: drawable by both the SVG path builder and
 *  jsPDF's straight-line polygon stroke, no arcs. */
export function wheelArchPoints(
  cx: number,
  groundY: number,
  radius: number,
  segments = 8,
): Point[] {
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

// ── Sedan panel segmentation (Phase 1 of the panel-clickable diagram) ──────
// Generic, hand-plotted straight-line panel boundaries — not traced from any
// reference photo, template, or third-party asset. Sedan only for now; other
// body types keep rendering the single-blob outline above until their own
// panel sets are drawn (see silhouettes.tsx). Panels are authored to tile
// edge-to-edge (shared boundary lines have zero area) so their hit regions
// never overlap; a few small unassigned slivers near pillar corners are
// deliberate — no panel id in the spec covers that sliver of bodywork,
// rather than it being a gap left by mistake.
export type SedanPanelPoly = { readonly id: string; readonly points: readonly Point[] };
export type SedanPanelMultiPoly = {
  readonly id: string;
  readonly subpaths: readonly (readonly Point[])[];
};
export type SedanPanelCircle = {
  readonly id: string;
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
};
export type SedanPanel = SedanPanelPoly | SedanPanelMultiPoly | SedanPanelCircle;

export function isPanelCircle(panel: SedanPanel): panel is SedanPanelCircle {
  return "cx" in panel;
}
export function isPanelMultiPoly(panel: SedanPanel): panel is SedanPanelMultiPoly {
  return "subpaths" in panel;
}

/** Rounds a closed polygon's corners by cutting each back and sampling the
 *  resulting quadratic-bezier curve into a dense run of straight segments —
 *  turning the straight-edged panel outlines above into the smoother, more
 *  naturalistic shapes a real car's bodywork actually has, without moving
 *  or redrawing any of the underlying points (so the hit-tested interior of
 *  each panel, already verified against the point data, is unchanged; only
 *  the few units right at each corner are affected). Points, not an SVG
 *  path string, for the same reason wheelArchPoints() is points: pdf.ts's
 *  report redraws this exact shape with jsPDF's straight-line polygon
 *  stroke, which has no curve primitive of its own — one data source, two
 *  renderers, per this file's header.
 *
 *  `radius` may be a single number (every corner rounds the same amount) or
 *  a per-vertex array. The per-vertex form exists for one reason: a corner
 *  shared with an adjacent panel — the same (x,y) appearing in both panels'
 *  point lists — must round to exactly 0 in BOTH panels, or each rounds its
 *  own copy of that corner independently and the two curves bulge apart,
 *  leaving a gap where a flush seam used to be (this shipped once; see
 *  seamPointKeys() below, which is what callers use to build that array).
 *  A plain non-zero radius is only safe on a corner no other panel touches.
 *  Cut-back distance is clamped to half the adjacent edge's length so short
 *  edges — a wheel arch's many near-straight segments — don't overlap
 *  themselves; those corners are already so obtuse the rounding is
 *  invisible anyway. */
export function roundedPolygonPoints(
  points: readonly Point[],
  radius: number | readonly number[],
  curveSegments = 6,
): Point[] {
  const n = points.length;
  if (n < 3) return [...points];
  const radiusAt = (i: number): number => (typeof radius === "number" ? radius : radius[i]);
  const at = (i: number): Point => points[((i % n) + n) % n];
  const cut = (from: Point, to: Point, r: number): Point => {
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const len = Math.hypot(dx, dy);
    const t = len === 0 ? 0 : Math.min(r, len / 2) / len;
    return [from[0] + dx * t, from[1] + dy * t];
  };
  const quadAt = (start: Point, control: Point, end: Point, t: number): Point => {
    const mt = 1 - t;
    return [
      mt * mt * start[0] + 2 * mt * t * control[0] + t * t * end[0],
      mt * mt * start[1] + 2 * mt * t * control[1] + t * t * end[1],
    ];
  };
  const out: Point[] = [];
  for (let i = 0; i < n; i++) {
    const r = radiusAt(i);
    const curr = at(i);
    if (r <= 0) {
      out.push(curr);
      continue;
    }
    const prev = at(i - 1);
    const next = at(i + 1);
    const start = cut(curr, prev, r);
    const end = cut(curr, next, r);
    for (let s = 0; s <= curveSegments; s++) {
      out.push(quadAt(start, curr, end, s / curveSegments));
    }
  }
  return out;
}

/** Every (x,y) that appears — exactly, to 2dp — in more than one panel's
 *  point list within `panels` (one view's worth, e.g. SEDAN_FRONT). Feed the
 *  result into roundedPolygonPoints' per-vertex radius array (0 at these
 *  keys, the panel's normal radius everywhere else) so a corner shared
 *  between panels stays a single flush line instead of each panel rounding
 *  its own copy independently — see roundedPolygonPoints' comment for what
 *  that looked like. Circles aren't polygons and never seam with anything,
 *  so they're skipped. */
export function seamPointKeys(panels: readonly SedanPanel[]): ReadonlySet<string> {
  const owners = new Map<string, Set<string>>();
  const key = ([x, y]: Point) => `${x.toFixed(2)},${y.toFixed(2)}`;
  for (const panel of panels) {
    if (isPanelCircle(panel)) continue;
    const allPoints = isPanelMultiPoly(panel) ? panel.subpaths.flat() : panel.points;
    for (const p of allPoints) {
      const k = key(p);
      (owners.get(k) ?? owners.set(k, new Set()).get(k)!).add(panel.id);
    }
  }
  const seams = new Set<string>();
  for (const [k, ids] of owners) if (ids.size > 1) seams.add(k);
  return seams;
}

/** Per-vertex radius array for roundedPolygonPoints(): `baseRadius` at every
 *  point, 0 at any point whose coordinate is in `seams` (see
 *  seamPointKeys()). */
export function radiiWithSeams(
  points: readonly Point[],
  baseRadius: number,
  seams: ReadonlySet<string>,
): number[] {
  return points.map(([x, y]) => (seams.has(`${x.toFixed(2)},${y.toFixed(2)}`) ? 0 : baseRadius));
}

/** SVG-path-string wrapper around roundedPolygonPoints(), for the on-screen
 *  renderer (silhouettes.tsx) — see roundedPolygonPoints' own comment for
 *  why the underlying computation is points-based rather than curve
 *  commands. */
export function roundedPolygonPath(
  points: readonly Point[],
  radius: number | readonly number[],
): string {
  const rounded = roundedPolygonPoints(points, radius);
  return (
    rounded.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ") +
    " Z"
  );
}

// Sedan geometry below (front/rear, profile, top) is derived, not hand-
// plotted: a one-time authoring script (not part of the app) built a
// generic sedan from two convex 3D parts — a tapered lower-body block and
// an inset greenhouse block — per the original brief's §6 production
// method ("build a simple 3D block model... render five orthographic
// views"), then orthographically projected each view and sliced it into
// these panels. That's what guarantees the proportions agree across views
// (a wheelbase, a beltline height, a greenhouse width — one 3D number each,
// not five independently-typed 2D guesses that can drift apart) and why
// the outer edges read as one continuous body rather than stacked bands.
// Front/rear view is a straight convex-hull projection (width vs. height,
// dropping length) — a real dome/taper shape, convex hull suits it fine.
// Profile is NOT a convex hull, deliberately: a real hood/windshield
// transition is genuinely concave (the hood sits below the straight line
// from bumper to roof), which a hull always flattens into a wedge — so
// profile instead walks the 3D block's actual corners in order. Wheel
// arches are spliced into the profile's ground edge afterward the same way
// wheelArchPoints() already worked. Front/rear share one band layout (roof/
// glass/hood-or-boot/lights/bumper) at the same coordinates — only the ids
// and the rear's lack of a grille panel differ — so it's defined once and
// reused, same as before.
const SEDAN_FRONT_REAR_ROOF: readonly Point[] = [
  [56.31, 42.38],
  [203.69, 42.38],
  [202.19, 38],
  [57.81, 38],
];
const SEDAN_FRONT_REAR_GLASS: readonly Point[] = [
  [56.31, 42.38],
  [41.65, 85.03],
  [218.35, 85.03],
  [203.69, 42.38],
];
const SEDAN_FRONT_REAR_MAIN_PANEL: readonly Point[] = [
  [41.65, 85.03],
  [33.75, 108],
  [34.34, 110.19],
  [225.66, 110.19],
  [226.25, 108],
  [218.35, 85.03],
];
const SEDAN_FRONT_REAR_LIGHT_L: readonly Point[] = [
  [86.69, 110.19],
  [34.34, 110.19],
  [43.17, 143],
  [86.69, 143],
];
const SEDAN_FRONT_REAR_LIGHT_R: readonly Point[] = [
  [173.31, 110.19],
  [173.31, 143],
  [216.83, 143],
  [225.66, 110.19],
];
// Bumper genuinely tapers narrower toward the bottom now (part of the fix
// for the body cross-section's flat vertical wall — see model comment
// above); it's no longer the same width top-to-bottom.
const SEDAN_FRONT_REAR_BUMPER_BAND: readonly Point[] = [
  [43.17, 143],
  [49.06, 164.88],
  [55.63, 178],
  [204.38, 178],
  [210.94, 164.88],
  [216.83, 143],
];
const SEDAN_FRONT_REAR_CENTRE_BAND: readonly Point[] = [
  [173.31, 110.19],
  [86.69, 110.19],
  [86.69, 143],
  [173.31, 143],
];

export const SEDAN_FRONT: readonly SedanPanel[] = [
  { id: "panel-roof", points: SEDAN_FRONT_REAR_ROOF },
  { id: "panel-windscreen", points: SEDAN_FRONT_REAR_GLASS },
  { id: "panel-bonnet", points: SEDAN_FRONT_REAR_MAIN_PANEL },
  { id: "panel-headlight-l", points: SEDAN_FRONT_REAR_LIGHT_L },
  { id: "panel-headlight-r", points: SEDAN_FRONT_REAR_LIGHT_R },
  { id: "panel-grille", points: SEDAN_FRONT_REAR_CENTRE_BAND },
  { id: "panel-bumper-front", points: SEDAN_FRONT_REAR_BUMPER_BAND },
  {
    id: "panel-mirror-l",
    points: [
      [29.38, 80.66],
      [11.88, 74.09],
      [16.25, 89.41],
      [33.75, 93.78],
    ],
  },
  {
    id: "panel-mirror-r",
    points: [
      [230.63, 80.66],
      [248.13, 74.09],
      [243.75, 89.41],
      [226.25, 93.78],
    ],
  },
];

export const SEDAN_REAR: readonly SedanPanel[] = [
  { id: "panel-roof", points: SEDAN_FRONT_REAR_ROOF },
  { id: "panel-rear-glass", points: SEDAN_FRONT_REAR_GLASS },
  { id: "panel-boot", points: SEDAN_FRONT_REAR_MAIN_PANEL },
  { id: "panel-taillight-l", points: SEDAN_FRONT_REAR_LIGHT_L },
  { id: "panel-taillight-r", points: SEDAN_FRONT_REAR_LIGHT_R },
  // No grille on a rear bumper — the centre band the front's grille occupies
  // is just more bumper here, so one panel covers both as two subpaths.
  {
    id: "panel-bumper-rear",
    subpaths: [SEDAN_FRONT_REAR_BUMPER_BAND, SEDAN_FRONT_REAR_CENTRE_BAND],
  },
];

// Left profile only; the right profile mirrors this geometry with a
// transform and remaps each id via SEDAN_LEFT_TO_RIGHT_ID, same approach
// bodyOutlinePoints() already uses for the single-blob outline. Wheel axle
// x-coordinates (92.83 / 321.96) come straight out of the 3D model's
// wheelbase, not PROFILE_WHEELS.sedan (that entry stays only for the
// single-blob fallback other body types still use).
export const SEDAN_LEFT: readonly SedanPanel[] = [
  {
    id: "panel-fender-lf",
    points: [
      [133.48, 140],
      [129.78, 140],
      [129.47, 135.18],
      [128.52, 130.43],
      [126.97, 125.86],
      [124.83, 121.52],
      [122.15, 117.5],
      [118.96, 113.87],
      [115.32, 110.68],
      [111.3, 107.99],
      [106.97, 105.86],
      [102.39, 104.3],
      [97.65, 103.36],
      [92.83, 103.04],
      [88, 103.36],
      [83.26, 104.3],
      [78.68, 105.86],
      [74.35, 107.99],
      [70.33, 110.68],
      [66.69, 113.87],
      [63.51, 117.5],
      [60.82, 121.52],
      [58.68, 125.86],
      [57.13, 130.43],
      [56.19, 135.18],
      [55.87, 140],
      [30, 140],
      [30, 116.35],
      [66.96, 92.7],
      [133.48, 92.7],
    ],
  },
  {
    id: "panel-quarter-l",
    points: [
      [273.91, 140],
      [273.91, 92.7],
      [333.04, 92.7],
      [370, 116.35],
      [370, 140],
      [358.91, 140],
      [358.6, 135.18],
      [357.65, 130.43],
      [356.1, 125.86],
      [353.96, 121.52],
      [351.28, 117.5],
      [348.09, 113.87],
      [344.45, 110.68],
      [340.43, 107.99],
      [336.1, 105.86],
      [331.52, 104.3],
      [326.78, 103.36],
      [321.96, 103.04],
      [317.13, 103.36],
      [312.39, 104.3],
      [307.81, 105.86],
      [303.48, 107.99],
      [299.46, 110.68],
      [295.82, 113.87],
      [292.64, 117.5],
      [289.95, 121.52],
      [287.81, 125.86],
      [286.26, 130.43],
      [285.32, 135.18],
      [285, 140],
    ],
  },
  {
    id: "panel-glass-lf",
    points: [
      [203.7, 77.17],
      [143.18, 77.17],
      [163.04, 45.39],
      [203.7, 45.39],
    ],
  },
  {
    id: "panel-glass-lr",
    points: [
      [203.7, 77.17],
      [203.7, 45.39],
      [251.74, 45.39],
      [266.64, 77.17],
    ],
  },
  {
    id: "panel-door-lf",
    points: [
      [203.7, 123.74],
      [133.48, 123.74],
      [133.48, 92.7],
      [143.18, 77.17],
      [203.7, 77.17],
    ],
  },
  {
    id: "panel-door-lr",
    points: [
      [273.91, 123.74],
      [203.7, 123.74],
      [203.7, 77.17],
      [266.64, 77.17],
      [273.91, 92.7],
    ],
  },
  {
    id: "panel-sill-l",
    points: [
      [273.91, 123.74],
      [273.91, 140],
      [133.48, 140],
      [133.48, 123.74],
    ],
  },
  {
    id: "panel-mirror-l",
    points: [
      [118.7, 86.04],
      [143.83, 97.13],
      [149.74, 88.26],
      [127.57, 76.43],
    ],
  },
  { id: "panel-wheel-lf", cx: 92.83, cy: 150, r: 20 },
  { id: "panel-wheel-lr", cx: 321.96, cy: 150, r: 20 },
];

export const SEDAN_LEFT_TO_RIGHT_ID: Readonly<Record<string, string>> = {
  "panel-fender-lf": "panel-fender-rf",
  "panel-glass-lf": "panel-glass-rf",
  "panel-glass-lr": "panel-glass-rr",
  "panel-door-lf": "panel-door-rf",
  "panel-door-lr": "panel-door-rr",
  "panel-sill-l": "panel-sill-r",
  "panel-quarter-l": "panel-quarter-r",
  "panel-mirror-l": "panel-mirror-r",
  "panel-wheel-lf": "panel-wheel-rf",
  "panel-wheel-lr": "panel-wheel-rr",
};

// Top view shows both sides at once (no mirroring needed): an outer body
// outline (bonnet/boot, from the 3D model's tapered lower-body block) with
// a smaller inset roof/glass strip in the middle (the greenhouse block,
// narrower than the body — real tumblehome, not just a stylistic inset).
// The centre strip further splits lengthwise into windscreen/roof/rear-
// glass so this view carries those two keys too, not just profile/front/
// rear; the flanking strips are panel-door-*f/*r.
export const SEDAN_TOP: readonly SedanPanel[] = [
  {
    id: "panel-bonnet",
    points: [
      [174.13, 15],
      [166.52, 34.02],
      [166.52, 68.26],
      [233.48, 68.26],
      [233.48, 34.02],
      [225.87, 15],
    ],
  },
  {
    id: "panel-boot",
    points: [
      [166.52, 140.54],
      [166.52, 170.98],
      [174.13, 190],
      [225.87, 190],
      [233.48, 170.98],
      [233.48, 140.54],
    ],
  },
  {
    id: "panel-windscreen",
    points: [
      [223.59, 81.58],
      [223.59, 68.26],
      [176.41, 68.26],
      [176.41, 81.58],
    ],
  },
  {
    id: "panel-roof",
    points: [
      [223.59, 127.23],
      [223.59, 81.58],
      [176.41, 81.58],
      [176.41, 127.23],
    ],
  },
  {
    id: "panel-rear-glass",
    points: [
      [223.59, 127.23],
      [176.41, 127.23],
      [176.41, 140.54],
      [223.59, 140.54],
    ],
  },
  {
    id: "panel-door-lf",
    points: [
      [176.41, 104.4],
      [176.41, 68.26],
      [166.52, 68.26],
      [166.52, 104.4],
    ],
  },
  {
    id: "panel-door-lr",
    points: [
      [176.41, 104.4],
      [166.52, 104.4],
      [166.52, 140.54],
      [176.41, 140.54],
    ],
  },
  {
    id: "panel-door-rf",
    points: [
      [223.59, 68.26],
      [223.59, 104.4],
      [233.48, 104.4],
      [233.48, 68.26],
    ],
  },
  {
    id: "panel-door-rr",
    points: [
      [223.59, 104.4],
      [223.59, 140.54],
      [233.48, 140.54],
      [233.48, 104.4],
    ],
  },
];

/** The sedan panel list for `view`, mirrored (and ids remapped) for "right"
 *  the same way bodyOutlinePoints() mirrors the single-blob outline — flip
 *  x about the profile viewBox's width, keep y. Both renderers (the SVG
 *  component's transform-based mirror and pdf.ts, which has no transform
 *  primitive as convenient) call this rather than duplicating the mirror
 *  math, so a coordinate change to SEDAN_LEFT only has to stay correct in
 *  one place. */
export function sedanPanelsForView(view: DamageMarkerView): readonly SedanPanel[] {
  if (view === "front") return SEDAN_FRONT;
  if (view === "rear") return SEDAN_REAR;
  if (view === "top") return SEDAN_TOP;
  if (view === "left") return SEDAN_LEFT;
  const [, , w] = PROFILE_VIEWBOX.split(" ").map(Number);
  const mirrorPoint = ([x, y]: Point): Point => [w - x, y];
  return SEDAN_LEFT.map((panel): SedanPanel => {
    const id = SEDAN_LEFT_TO_RIGHT_ID[panel.id] ?? panel.id;
    if (isPanelCircle(panel)) return { id, cx: w - panel.cx, cy: panel.cy, r: panel.r };
    if (isPanelMultiPoly(panel)) {
      return { id, subpaths: panel.subpaths.map((sp) => sp.map(mirrorPoint)) };
    }
    return { id, points: panel.points.map(mirrorPoint) };
  });
}

// Corner radius roundedPolygonPath() rounds each sedan panel by — bigger
// sweeping body panels get a soft, naturalistic curve; small rectangular
// ones (doors, glass, sill) stay closer to a real shutline's crisp corners.
// Keyed by the same panel-* id as everything else here; DEFAULT_PANEL_RADIUS
// covers anything not listed (future top-view/other additions).
const DEFAULT_PANEL_RADIUS = 4;
const PANEL_CORNER_RADIUS: Readonly<Record<string, number>> = {
  "panel-bumper-front": 9,
  "panel-bumper-rear": 9,
  "panel-grille": 3,
  "panel-headlight-l": 4,
  "panel-headlight-r": 4,
  "panel-taillight-l": 4,
  "panel-taillight-r": 4,
  "panel-bonnet": 11,
  "panel-boot": 11,
  "panel-windscreen": 5,
  "panel-rear-glass": 5,
  "panel-roof": 9,
  "panel-mirror-l": 1.5,
  "panel-mirror-r": 1.5,
  "panel-fender-lf": 12,
  "panel-fender-rf": 12,
  "panel-door-lf": 2.5,
  "panel-door-lr": 2.5,
  "panel-door-rf": 2.5,
  "panel-door-rr": 2.5,
  "panel-quarter-l": 12,
  "panel-quarter-r": 12,
  "panel-sill-l": 2,
  "panel-sill-r": 2,
  "panel-glass-lf": 3,
  "panel-glass-lr": 3,
  "panel-glass-rf": 3,
  "panel-glass-rr": 3,
};

export function panelCornerRadius(panelId: string): number {
  return PANEL_CORNER_RADIUS[panelId] ?? DEFAULT_PANEL_RADIUS;
}

const PANEL_LABELS: Readonly<Record<string, string>> = {
  "panel-bumper-front": "Front bumper",
  "panel-bumper-rear": "Rear bumper",
  "panel-grille": "Grille",
  "panel-headlight-l": "Headlight (left)",
  "panel-headlight-r": "Headlight (right)",
  "panel-taillight-l": "Tail light (left)",
  "panel-taillight-r": "Tail light (right)",
  "panel-bonnet": "Bonnet",
  "panel-boot": "Boot",
  "panel-windscreen": "Windscreen",
  "panel-rear-glass": "Rear glass",
  "panel-roof": "Roof",
  "panel-mirror-l": "Mirror (left)",
  "panel-mirror-r": "Mirror (right)",
  "panel-fender-lf": "Front fender (left)",
  "panel-fender-rf": "Front fender (right)",
  "panel-door-lf": "Front door (left)",
  "panel-door-lr": "Rear door (left)",
  "panel-door-rf": "Front door (right)",
  "panel-door-rr": "Rear door (right)",
  "panel-quarter-l": "Rear quarter (left)",
  "panel-quarter-r": "Rear quarter (right)",
  "panel-sill-l": "Sill (left)",
  "panel-sill-r": "Sill (right)",
  "panel-glass-lf": "Front door glass (left)",
  "panel-glass-lr": "Rear door glass (left)",
  "panel-glass-rf": "Front door glass (right)",
  "panel-glass-rr": "Rear door glass (right)",
  "panel-wheel-lf": "Wheel (front left)",
  "panel-wheel-lr": "Wheel (rear left)",
  "panel-wheel-rf": "Wheel (front right)",
  "panel-wheel-rr": "Wheel (rear right)",
};

/** Human label for a panel id — falls back to de-kebabing an unrecognised
 *  id (future body types before their PANEL_LABELS entries are added). */
export function panelLabel(panelId: string): string {
  return (
    PANEL_LABELS[panelId] ??
    panelId
      .replace(/^panel-/, "")
      .replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
  );
}
