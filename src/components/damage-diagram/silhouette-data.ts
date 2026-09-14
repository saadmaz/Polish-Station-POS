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

/** Rounds every corner of a closed polygon by cutting it back and sampling
 *  the resulting quadratic-bezier curve into a dense run of straight
 *  segments — turning the straight-edged panel outlines above into the
 *  smoother, more naturalistic shapes a real car's bodywork actually has,
 *  without moving or redrawing any of the underlying points (so the
 *  hit-tested interior of each panel, already verified against the point
 *  data, is unchanged; only the few units right at each corner are
 *  affected). Points, not an SVG path string, for the same reason
 *  wheelArchPoints() is points: pdf.ts's report redraws this exact shape
 *  with jsPDF's straight-line polygon stroke, which has no curve primitive
 *  of its own — one data source, two renderers, per this file's header.
 *  `radius` is cut back along each adjacent edge (clamped to half that
 *  edge's length so short edges, like a wheel arch's many near-straight
 *  segments, don't overlap themselves — those corners are already so
 *  obtuse the rounding is invisible anyway, which is what makes it safe to
 *  run every sedan panel through this uniformly, arches included). */
export function roundedPolygonPoints(
  points: readonly Point[],
  radius: number,
  curveSegments = 6,
): Point[] {
  const n = points.length;
  if (radius <= 0 || n < 3) return [...points];
  const at = (i: number): Point => points[((i % n) + n) % n];
  const cut = (from: Point, to: Point): Point => {
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const len = Math.hypot(dx, dy);
    const t = len === 0 ? 0 : Math.min(radius, len / 2) / len;
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
    const prev = at(i - 1);
    const curr = at(i);
    const next = at(i + 1);
    const start = cut(curr, prev);
    const end = cut(curr, next);
    for (let s = 0; s <= curveSegments; s++) {
      out.push(quadAt(start, curr, end, s / curveSegments));
    }
  }
  return out;
}

/** SVG-path-string wrapper around roundedPolygonPoints(), for the on-screen
 *  renderer (silhouettes.tsx) — see roundedPolygonPoints' own comment for
 *  why the underlying computation is points-based rather than curve
 *  commands. */
export function roundedPolygonPath(points: readonly Point[], radius: number): string {
  const rounded = roundedPolygonPoints(points, radius);
  return (
    rounded.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ") +
    " Z"
  );
}

// Front/rear share the same band layout (roof/glass/hood-or-boot/lights) at
// the same coordinates — only the ids and the rear's lack of a grille panel
// differ — so the geometry is defined once and reused.
const SEDAN_FRONT_REAR_ROOF: readonly Point[] = [
  [100, 38],
  [160, 38],
  [172, 52],
  [88, 52],
];
const SEDAN_FRONT_REAR_GLASS: readonly Point[] = [
  [88, 52],
  [172, 52],
  [190, 86],
  [70, 86],
];
const SEDAN_FRONT_REAR_MAIN_PANEL: readonly Point[] = [
  [70, 86],
  [190, 86],
  [205, 116],
  [55, 116],
];
const SEDAN_FRONT_REAR_LIGHT_L: readonly Point[] = [
  [45, 122],
  [95, 116],
  [95, 142],
  [48, 142],
];
const SEDAN_FRONT_REAR_LIGHT_R: readonly Point[] = [
  [215, 122],
  [165, 116],
  [165, 142],
  [212, 142],
];
const SEDAN_FRONT_REAR_BUMPER_BAND: readonly Point[] = [
  [35, 178],
  [38, 142],
  [222, 142],
  [225, 178],
];
const SEDAN_FRONT_REAR_CENTRE_BAND: readonly Point[] = [
  [95, 116],
  [165, 116],
  [165, 142],
  [95, 142],
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
      [70, 86],
      [60, 86],
      [55, 78],
      [68, 76],
    ],
  },
  {
    id: "panel-mirror-r",
    points: [
      [190, 86],
      [200, 86],
      [205, 78],
      [192, 76],
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
// bodyOutlinePoints() already uses for the single-blob outline.
// 24 segments (vs. the 8 other body types' single-blob outline uses) — at
// this radius a plain 8-segment arch reads as faintly faceted once every
// corner elsewhere is rounded too; 24 is smooth at this stroke width without
// meaningfully growing the panel's point count.
const SEDAN_ARCH_SEGMENTS = 24;
const SEDAN_PROFILE_FRONT_ARCH = wheelArchPoints(
  PROFILE_WHEELS.sedan[0],
  PROFILE_GROUND_Y,
  WHEEL_ARCH_RADIUS,
  SEDAN_ARCH_SEGMENTS,
);
const SEDAN_PROFILE_REAR_ARCH = wheelArchPoints(
  PROFILE_WHEELS.sedan[1],
  PROFILE_GROUND_Y,
  WHEEL_ARCH_RADIUS,
  SEDAN_ARCH_SEGMENTS,
);
// x boundaries between adjacent profile panels — chosen so each wheel arch
// (front: 73-127, rear: 273-327, given PROFILE_WHEELS.sedan + the arch
// radius above) sits fully inside its own panel, never straddling a seam.
const SEDAN_PROFILE_FENDER_DOOR_X = 130;
const SEDAN_PROFILE_DOOR_DOOR_X = 195;
const SEDAN_PROFILE_DOOR_QUARTER_X = 255;
const SEDAN_PROFILE_BELT_Y = 95;
const SEDAN_PROFILE_SILL_Y = 128;

export const SEDAN_LEFT: readonly SedanPanel[] = [
  {
    id: "panel-fender-lf",
    points: [
      [30, PROFILE_GROUND_Y],
      [30, 112],
      [48, 88],
      [90, 72],
      [SEDAN_PROFILE_FENDER_DOOR_X, 60],
      [SEDAN_PROFILE_FENDER_DOOR_X, PROFILE_GROUND_Y],
      ...SEDAN_PROFILE_FRONT_ARCH,
    ],
  },
  {
    id: "panel-glass-lf",
    points: [
      [SEDAN_PROFILE_FENDER_DOOR_X, 60],
      [SEDAN_PROFILE_DOOR_DOOR_X, 47],
      [SEDAN_PROFILE_DOOR_DOOR_X, SEDAN_PROFILE_BELT_Y],
      [SEDAN_PROFILE_FENDER_DOOR_X, SEDAN_PROFILE_BELT_Y],
    ],
  },
  {
    id: "panel-glass-lr",
    points: [
      [SEDAN_PROFILE_DOOR_DOOR_X, 47],
      [SEDAN_PROFILE_DOOR_QUARTER_X, 52],
      [SEDAN_PROFILE_DOOR_QUARTER_X, SEDAN_PROFILE_BELT_Y],
      [SEDAN_PROFILE_DOOR_DOOR_X, SEDAN_PROFILE_BELT_Y],
    ],
  },
  {
    id: "panel-door-lf",
    points: [
      [SEDAN_PROFILE_FENDER_DOOR_X, SEDAN_PROFILE_BELT_Y],
      [SEDAN_PROFILE_DOOR_DOOR_X, SEDAN_PROFILE_BELT_Y],
      [SEDAN_PROFILE_DOOR_DOOR_X, SEDAN_PROFILE_SILL_Y],
      [SEDAN_PROFILE_FENDER_DOOR_X, SEDAN_PROFILE_SILL_Y],
    ],
  },
  {
    id: "panel-door-lr",
    points: [
      [SEDAN_PROFILE_DOOR_DOOR_X, SEDAN_PROFILE_BELT_Y],
      [SEDAN_PROFILE_DOOR_QUARTER_X, SEDAN_PROFILE_BELT_Y],
      [SEDAN_PROFILE_DOOR_QUARTER_X, SEDAN_PROFILE_SILL_Y],
      [SEDAN_PROFILE_DOOR_DOOR_X, SEDAN_PROFILE_SILL_Y],
    ],
  },
  {
    id: "panel-sill-l",
    points: [
      [SEDAN_PROFILE_FENDER_DOOR_X, SEDAN_PROFILE_SILL_Y],
      [SEDAN_PROFILE_DOOR_QUARTER_X, SEDAN_PROFILE_SILL_Y],
      [SEDAN_PROFILE_DOOR_QUARTER_X, PROFILE_GROUND_Y],
      [SEDAN_PROFILE_FENDER_DOOR_X, PROFILE_GROUND_Y],
    ],
  },
  {
    id: "panel-quarter-l",
    points: [
      [SEDAN_PROFILE_DOOR_QUARTER_X, PROFILE_GROUND_Y],
      [SEDAN_PROFILE_DOOR_QUARTER_X, 52],
      [275, 58],
      [300, 80],
      [330, 100],
      [370, 118],
      [370, PROFILE_GROUND_Y],
      ...SEDAN_PROFILE_REAR_ARCH,
    ],
  },
  {
    id: "panel-mirror-l",
    points: [
      [112, 56],
      [128, 44],
      [134, 52],
      [120, 64],
    ],
  },
  { id: "panel-wheel-lf", cx: PROFILE_WHEELS.sedan[0], cy: 150, r: 20 },
  { id: "panel-wheel-lr", cx: PROFILE_WHEELS.sedan[1], cy: 150, r: 20 },
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
// outline (bonnet/boot) with a smaller inset roof/glass shape in the middle,
// the standard top-down car diagram convention — the visible strip between
// the two, left and right, is what panel-door-*f/*r pick up.
export const SEDAN_TOP: readonly SedanPanel[] = [
  {
    id: "panel-bonnet",
    points: [
      [200, 15],
      [225, 20],
      [240, 50],
      [160, 50],
      [175, 20],
    ],
  },
  {
    id: "panel-windscreen",
    points: [
      [185, 50],
      [215, 50],
      [225, 68],
      [175, 68],
    ],
  },
  {
    id: "panel-roof",
    points: [
      [175, 68],
      [225, 68],
      [225, 130],
      [175, 130],
    ],
  },
  {
    id: "panel-rear-glass",
    points: [
      [175, 130],
      [225, 130],
      [215, 148],
      [185, 148],
    ],
  },
  {
    id: "panel-boot",
    points: [
      [185, 148],
      [215, 148],
      [240, 155],
      [230, 185],
      [200, 190],
      [170, 185],
      [160, 155],
    ],
  },
  {
    id: "panel-door-lf",
    points: [
      [155, 68],
      [175, 68],
      [175, 99],
      [155, 99],
    ],
  },
  {
    id: "panel-door-lr",
    points: [
      [155, 99],
      [175, 99],
      [175, 130],
      [155, 130],
    ],
  },
  {
    id: "panel-door-rf",
    points: [
      [245, 68],
      [225, 68],
      [225, 99],
      [245, 99],
    ],
  },
  {
    id: "panel-door-rr",
    points: [
      [245, 99],
      [225, 99],
      [225, 130],
      [245, 130],
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
