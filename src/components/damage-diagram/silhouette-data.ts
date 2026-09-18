// Pure coordinate data for the damage-diagram artwork — split out from
// silhouettes.tsx (the React/SVG rendering) so pdf.ts can embed the exact
// same commissioned PNGs, at the same panel coordinates, for the inspection
// report (Phase 5). One data source, two renderers — this is what
// guarantees a marker's PDF position matches its on-screen position
// exactly, per the spec's acceptance criteria, rather than keeping two
// independently-typed copies in sync by hand.
import type { BodyType } from "@/lib/job";
import type { DamageMarkerView } from "@/lib/inspection";

export type Point = readonly [number, number];

export const BODY_TYPE_LABELS: Record<BodyType, string> = {
  sedan: "Sedan",
  hatchback: "Hatchback",
  suv: "SUV",
  double_cab: "Double Cab",
  van: "Van",
  coupe: "Coupe",
};

// ── Sedan panel segmentation (Phase 1 of the panel-clickable diagram) ──────
// Generic, hand-plotted straight-line panel boundaries — not traced from any
// reference photo, template, or third-party asset. Every body type uses this
// same artwork/panel set now (see silhouettes.tsx) — the earlier per-body-
// type single-blob vector outline this replaced (PROFILE_BODY/FRONT_REAR_BODY/
// TOP_BODY/bodyOutlinePoints/profileWheelCentres/viewBoxFor) was removed
// outright rather than kept around as an unused fallback, same precedent as
// the sedan-specific vector panels the real artwork below already replaced.
// Panels are authored to tile edge-to-edge (shared boundary lines have zero
// area) so their hit regions never overlap; a few small unassigned slivers
// near pillar corners are deliberate — no panel id in the spec covers that
// sliver of bodywork, rather than it being a gap left by mistake.
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
