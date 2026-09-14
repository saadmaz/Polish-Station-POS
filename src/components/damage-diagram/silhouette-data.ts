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

// ── Sedan real artwork (commissioned Illustrator drawings) ─────────────────
// The sedan's whole diagram — on-screen (silhouettes.tsx) and printed
// (pdf.ts, via doc.addImage) — is these five PNGs now; the earlier
// programmatic 3D-derived vector panels this replaced (SEDAN_FRONT/REAR/
// LEFT/TOP, a corner-rounding pass, sedanPanelsForView) were removed
// outright rather than kept around as an unused fallback. Panel coordinates
// here were hand-aligned against each PNG's own pixel space (viewBox = the
// image's native width/height) by overlaying candidate regions on the
// artwork and adjusting until they tracked the visible line art —
// approximate, not pixel-perfect, but that's adequate for a tap-to-place
// marker tool. Left/right are two separate hand-drawn files (not one
// mirrored via transform), so SEDAN_IMAGE_RIGHT's coordinates are the left
// set's numerically mirrored as an approximation of the second drawing, not
// a measurement of it directly.
export const SEDAN_IMAGE_SRC: Record<DamageMarkerView, string> = {
  front: "/Illustrations/front.png",
  rear: "/Illustrations/rear.png",
  left: "/Illustrations/left.png",
  right: "/Illustrations/right.png",
  top: "/Illustrations/top.png",
};

export const SEDAN_IMAGE_VIEWBOX: Record<DamageMarkerView, string> = {
  front: "0 0 1698 926",
  rear: "0 0 1699 926",
  left: "0 0 1981 794",
  right: "0 0 1981 794",
  top: "0 0 1698 926",
};

export const SEDAN_IMAGE_FRONT: readonly SedanPanel[] = [
  {
    id: "panel-roof",
    points: [
      [565, 60],
      [1135, 60],
      [1115, 128],
      [583, 128],
    ],
  },
  {
    id: "panel-windscreen",
    points: [
      [583, 128],
      [1115, 128],
      [1300, 232],
      [398, 232],
    ],
  },
  {
    id: "panel-mirror-l",
    points: [
      [140, 195],
      [305, 205],
      [280, 248],
      [150, 238],
    ],
  },
  {
    id: "panel-mirror-r",
    points: [
      [1558, 195],
      [1393, 205],
      [1418, 248],
      [1548, 238],
    ],
  },
  {
    id: "panel-bonnet",
    points: [
      [398, 232],
      [1300, 232],
      [1345, 345],
      [353, 345],
    ],
  },
  {
    id: "panel-headlight-l",
    points: [
      [195, 345],
      [639, 345],
      [639, 478],
      [228, 478],
    ],
  },
  {
    id: "panel-grille",
    points: [
      [639, 345],
      [1059, 345],
      [1059, 478],
      [639, 478],
    ],
  },
  {
    id: "panel-headlight-r",
    points: [
      [1059, 345],
      [1503, 345],
      [1470, 478],
      [1059, 478],
    ],
  },
  {
    id: "panel-bumper-front",
    points: [
      [228, 478],
      [1470, 478],
      [1440, 660],
      [258, 660],
    ],
  },
];

export const SEDAN_IMAGE_REAR: readonly SedanPanel[] = [
  {
    id: "panel-roof",
    points: [
      [565, 55],
      [1135, 55],
      [1115, 118],
      [583, 118],
    ],
  },
  {
    id: "panel-rear-glass",
    points: [
      [583, 118],
      [1115, 118],
      [1230, 265],
      [468, 265],
    ],
  },
  {
    id: "panel-mirror-l",
    points: [
      [140, 255],
      [305, 265],
      [280, 305],
      [150, 298],
    ],
  },
  {
    id: "panel-mirror-r",
    points: [
      [1558, 255],
      [1393, 265],
      [1418, 305],
      [1548, 298],
    ],
  },
  {
    id: "panel-boot",
    points: [
      [468, 265],
      [1230, 265],
      [1290, 350],
      [408, 350],
    ],
  },
  {
    id: "panel-taillight-l",
    points: [
      [330, 350],
      [622, 350],
      [605, 485],
      [350, 485],
    ],
  },
  {
    id: "panel-taillight-r",
    points: [
      [1368, 350],
      [1076, 350],
      [1093, 485],
      [1348, 485],
    ],
  },
  {
    id: "panel-bumper-rear",
    subpaths: [
      [
        [228, 485],
        [1470, 485],
        [1440, 660],
        [258, 660],
      ],
      [
        [622, 350],
        [1076, 350],
        [1093, 485],
        [605, 485],
      ],
    ],
  },
];

export const SEDAN_IMAGE_LEFT: readonly SedanPanel[] = [
  {
    id: "panel-fender-lf",
    points: [
      [40, 610],
      [40, 340],
      [100, 270],
      [280, 150],
      [470, 255],
      [470, 610],
    ],
  },
  {
    id: "panel-glass-lf",
    points: [
      [470, 300],
      [1010, 300],
      [1010, 140],
      [640, 120],
      [470, 255],
    ],
  },
  {
    id: "panel-door-lf",
    points: [
      [470, 300],
      [1010, 300],
      [1010, 560],
      [470, 560],
    ],
  },
  {
    id: "panel-glass-lr",
    points: [
      [1010, 300],
      [1400, 300],
      [1370, 140],
      [1010, 140],
    ],
  },
  {
    id: "panel-door-lr",
    points: [
      [1010, 300],
      [1400, 300],
      [1400, 560],
      [1010, 560],
    ],
  },
  {
    id: "panel-sill-l",
    points: [
      [470, 560],
      [1400, 560],
      [1400, 610],
      [470, 610],
    ],
  },
  {
    id: "panel-quarter-l",
    points: [
      [1400, 610],
      [1400, 255],
      [1600, 150],
      [1880, 270],
      [1940, 340],
      [1940, 610],
    ],
  },
  {
    id: "panel-mirror-l",
    points: [
      [660, 150],
      [775, 130],
      [785, 175],
      [670, 195],
    ],
  },
  { id: "panel-wheel-lf", cx: 205, cy: 460, r: 140 },
  { id: "panel-wheel-lr", cx: 1790, cy: 460, r: 140 },
];

export const SEDAN_IMAGE_TOP: readonly SedanPanel[] = [
  {
    id: "panel-bonnet",
    points: [
      [20, 463],
      [430, 220],
      [430, 706],
    ],
  },
  {
    id: "panel-windscreen",
    points: [
      [430, 220],
      [620, 170],
      [620, 756],
      [430, 706],
    ],
  },
  {
    id: "panel-roof",
    points: [
      [620, 170],
      [1180, 170],
      [1180, 756],
      [620, 756],
    ],
  },
  {
    id: "panel-rear-glass",
    points: [
      [1180, 170],
      [1300, 220],
      [1300, 706],
      [1180, 756],
    ],
  },
  {
    id: "panel-boot",
    points: [
      [1300, 220],
      [1678, 463],
      [1300, 706],
    ],
  },
  {
    id: "panel-door-lf",
    points: [
      [430, 60],
      [780, 60],
      [780, 170],
      [620, 170],
      [430, 220],
    ],
  },
  {
    id: "panel-door-lr",
    points: [
      [780, 60],
      [1180, 60],
      [1180, 170],
      [780, 170],
    ],
  },
  {
    id: "panel-door-rf",
    points: [
      [430, 866],
      [780, 866],
      [780, 756],
      [620, 756],
      [430, 706],
    ],
  },
  {
    id: "panel-door-rr",
    points: [
      [780, 866],
      [1180, 866],
      [1180, 756],
      [780, 756],
    ],
  },
];

/** Image-backed sedan panels for `view` — mirrors SEDAN_IMAGE_LEFT's
 *  coordinates about its own viewBox width and remaps each id via
 *  SEDAN_LEFT_TO_RIGHT_ID for "right", rather than reading a second
 *  measured set, since right.png is only approximated by the left
 *  drawing's numbers (see the header comment above). */
export function sedanImagePanelsForView(view: DamageMarkerView): readonly SedanPanel[] {
  if (view === "front") return SEDAN_IMAGE_FRONT;
  if (view === "rear") return SEDAN_IMAGE_REAR;
  if (view === "top") return SEDAN_IMAGE_TOP;
  if (view === "left") return SEDAN_IMAGE_LEFT;
  const [, , w] = SEDAN_IMAGE_VIEWBOX.left.split(" ").map(Number);
  const mirrorPoint = ([x, y]: Point): Point => [w - x, y];
  return SEDAN_IMAGE_LEFT.map((panel): SedanPanel => {
    const id = SEDAN_LEFT_TO_RIGHT_ID[panel.id] ?? panel.id;
    if (isPanelCircle(panel)) return { id, cx: w - panel.cx, cy: panel.cy, r: panel.r };
    if (isPanelMultiPoly(panel)) {
      return { id, subpaths: panel.subpaths.map((sp) => sp.map(mirrorPoint)) };
    }
    return { id, points: panel.points.map(mirrorPoint) };
  });
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
