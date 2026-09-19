// Interactive damage diagram — Phase 3. Step A (standalone, no Firestore/
// Storage) was reviewed in isolation first; this is Step B, wired into the
// real inspection flow via InspectionSheet. Touch-first; designed and
// tested at 375px.
//
// Interaction model:
//   - tap empty space  -> places a new marker there (default minor/scratch),
//                         opens the editor for it immediately
//   - tap existing marker -> opens the editor for it
//   - drag existing marker -> repositions it live
//   - long-press existing marker -> delete, behind a confirmation
// A pointer-down starts a long-press timer; movement past a small threshold
// cancels it and switches to drag instead, so the same gesture start can't
// be read as both.
//
// Per-marker evidence photos (linking a marker to Inspection.photos) are
// temporarily disabled — see PHOTO_CAPTURE_ENABLED in inspection.ts. This
// component no longer takes an upload/URL-resolution callback at all; a
// marker's `photoIds` field stays in the data model (empty) so the feature
// can come back later without touching that shape.
import { useCallback, useRef, useState } from "react";
import { useConfirm } from "@/hooks/use-confirm";
import type { BodyType } from "@/lib/job";
import {
  DAMAGE_MARKER_TYPES,
  DAMAGE_MARKER_SEVERITIES,
  type DamageMarker,
  type DamageMarkerView,
} from "@/lib/inspection";
import { VehicleSilhouette, panelLabel, SEDAN_IMAGE_VIEWBOX } from "./silhouettes";
import {
  MARKER_TYPE_COLOR,
  MARKER_TYPE_LABELS,
  SEVERITY_SHAPE,
  SEVERITY_LABELS,
  markerShapePath,
} from "./marker-style";

const VIEWS: DamageMarkerView[] = ["front", "rear", "left", "right", "top"];
const LONG_PRESS_MS = 550;
const DRAG_THRESHOLD_PX = 6;

interface DamageDiagramProps {
  bodyType: BodyType;
  markers: DamageMarker[];
  onMarkersChange: (markers: DamageMarker[]) => void;
}

export function DamageDiagram({ bodyType, markers, onMarkersChange }: DamageDiagramProps) {
  const [view, setView] = useState<DamageMarkerView>("front");
  const [selectedSeq, setSelectedSeq] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const { confirm, ConfirmDialog } = useConfirm();

  const pointerState = useRef<{
    seq: number;
    startX: number;
    startY: number;
    longPressTimer: ReturnType<typeof setTimeout> | null;
    dragging: boolean;
  } | null>(null);

  // Every body type's on-screen diagram is the real illustrator artwork
  // now, sized to each PNG's own pixel dimensions — see silhouette-data.ts's
  // "Sedan real artwork" section.
  const viewBox = SEDAN_IMAGE_VIEWBOX[view];
  const [, , vbW, vbH] = viewBox.split(" ").map(Number);
  const viewMarkers = markers.filter((m) => m.view === view);
  const selected = markers.find((m) => m.seq === selectedSeq) ?? null;

  const clientToNormalized = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } => {
      const svg = svgRef.current;
      if (!svg) return { x: 0.5, y: 0.5 };
      const rect = svg.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      const y = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
      return { x, y };
    },
    [],
  );

  function updateMarker(seq: number, patch: Partial<DamageMarker>) {
    onMarkersChange(markers.map((m) => (m.seq === seq ? { ...m, ...patch } : m)));
  }

  // Resolves the panel-* id (see silhouette-data.ts) under a tap —
  // elementFromPoint finds the topmost hit-testable element there, since
  // panels render with fill="transparent" specifically to receive pointer
  // events.
  function resolvePanelId(clientX: number, clientY: number): string | undefined {
    const el = document.elementFromPoint(clientX, clientY);
    const panelEl = el?.closest("[id^='panel-']");
    return panelEl?.id;
  }

  function placeNewMarker(clientX: number, clientY: number) {
    const { x, y } = clientToNormalized(clientX, clientY);
    const seq = markers.length > 0 ? Math.max(...markers.map((m) => m.seq)) + 1 : 1;
    const panelId = resolvePanelId(clientX, clientY);
    const marker: DamageMarker = {
      seq,
      view,
      x,
      y,
      type: "scratch",
      severity: "minor",
      note: "",
      photoIds: [],
      ...(panelId ? { panelId } : {}),
    };
    onMarkersChange([...markers, marker]);
    setSelectedSeq(seq);
  }

  // Background tap-to-place uses the same pointerdown/up tap detection as
  // markers do, rather than a click handler gated on `e.target ===
  // svgRef.current` — the silhouette artwork itself is a filled, hit-
  // testable shape covering most of the viewBox, so a tap on the car body
  // (exactly where most damage markers get placed) would otherwise land on
  // the <path>, not the <svg> root, and silently do nothing. A marker's own
  // pointerdown handler calls stopPropagation(), so this background handler
  // never fires for taps that start on an existing marker.
  const backgroundPointerDown = useRef<{ x: number; y: number } | null>(null);

  function handleBackgroundPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    backgroundPointerDown.current = { x: e.clientX, y: e.clientY };
  }

  function handleBackgroundPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    const start = backgroundPointerDown.current;
    backgroundPointerDown.current = null;
    if (!start) return;
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > DRAG_THRESHOLD_PX) return; // treat as a pan/scroll, not a tap
    placeNewMarker(e.clientX, e.clientY);
  }

  function handleMarkerPointerDown(e: React.PointerEvent, seq: number) {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    pointerState.current = {
      seq,
      startX: e.clientX,
      startY: e.clientY,
      dragging: false,
      longPressTimer: setTimeout(() => void handleLongPress(seq), LONG_PRESS_MS),
    };
  }

  function handleMarkerPointerMove(e: React.PointerEvent) {
    const ps = pointerState.current;
    if (!ps) return;
    const dx = e.clientX - ps.startX;
    const dy = e.clientY - ps.startY;
    if (!ps.dragging && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
      if (ps.longPressTimer) clearTimeout(ps.longPressTimer);
      ps.dragging = true;
    }
    if (ps.dragging) {
      const { x, y } = clientToNormalized(e.clientX, e.clientY);
      updateMarker(ps.seq, { x, y });
    }
  }

  function handleMarkerPointerUp(e: React.PointerEvent, seq: number) {
    const ps = pointerState.current;
    if (ps?.longPressTimer) clearTimeout(ps.longPressTimer);
    const wasDragging = ps?.dragging ?? false;
    pointerState.current = null;
    if (!wasDragging) setSelectedSeq(seq); // a plain tap — open the editor
    e.stopPropagation();
  }

  async function handleLongPress(seq: number) {
    if (pointerState.current) pointerState.current.longPressTimer = null;
    const marker = markers.find((m) => m.seq === seq);
    if (!marker) return;
    const ok = await confirm({
      title: `Delete marker #${seq}?`,
      description: `${MARKER_TYPE_LABELS[marker.type]} · ${SEVERITY_LABELS[marker.severity]}`,
    });
    if (!ok) return;
    onMarkersChange(markers.filter((m) => m.seq !== seq));
    if (selectedSeq === seq) setSelectedSeq(null);
  }

  return (
    <div className="space-y-4">
      {ConfirmDialog}

      <div className="flex flex-wrap gap-1.5">
        {VIEWS.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium capitalize ${
              v === view
                ? "border-primary bg-primary/10 text-primary"
                : "border-input bg-background hover:bg-accent"
            }`}
          >
            {v}
            {markers.some((m) => m.view === v) && (
              <span className="ml-1.5 rounded-full bg-muted-foreground/20 px-1.5 text-[10px]">
                {markers.filter((m) => m.view === v).length}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="relative touch-none select-none rounded-xl border border-border bg-card">
        <svg
          ref={svgRef}
          viewBox={viewBox}
          onPointerDown={handleBackgroundPointerDown}
          onPointerUp={handleBackgroundPointerUp}
          className="h-auto w-full cursor-crosshair text-foreground/70"
          style={{ touchAction: "none" }}
        >
          <VehicleSilhouette bodyType={bodyType} view={view} />
          {viewMarkers.map((m) => {
            const shape = SEVERITY_SHAPE[m.severity];
            const color = MARKER_TYPE_COLOR[m.type];
            const cx = m.x * vbW;
            const cy = m.y * vbH;
            // Proportional to viewBox width, not a fixed unit count — the
            // real-artwork viewBoxes are image pixel space, much larger than
            // a hand-picked fixed unit count, so a fixed r=13 would render as
            // a barely-visible speck against that.
            const r = vbW * 0.05;
            const markerStrokeWidth = r * 0.15;
            return (
              <g
                key={m.seq}
                data-marker-seq={m.seq}
                transform={`translate(${cx},${cy})`}
                onPointerDown={(e) => handleMarkerPointerDown(e, m.seq)}
                onPointerMove={handleMarkerPointerMove}
                onPointerUp={(e) => handleMarkerPointerUp(e, m.seq)}
                className="cursor-grab active:cursor-grabbing"
              >
                {shape === "circle" ? (
                  <circle
                    r={r}
                    fill={color}
                    stroke={m.seq === selectedSeq ? "var(--foreground)" : "white"}
                    strokeWidth={markerStrokeWidth}
                  />
                ) : (
                  <path
                    d={markerShapePath(shape, r)}
                    fill={color}
                    stroke={m.seq === selectedSeq ? "var(--foreground)" : "white"}
                    strokeWidth={markerStrokeWidth}
                    strokeLinejoin="round"
                  />
                )}
                <text
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={r * 0.85}
                  fontWeight={700}
                  fill="white"
                  className="pointer-events-none"
                >
                  {m.seq}
                </text>
              </g>
            );
          })}
        </svg>
        <p className="border-t border-border px-3 py-1.5 text-center text-[11px] text-muted-foreground">
          Tap to place a marker · drag to move · long-press to delete
        </p>
      </div>

      {selected && (
        <MarkerEditor
          marker={selected}
          onChange={(patch) => updateMarker(selected.seq, patch)}
          onClose={() => setSelectedSeq(null)}
          onDelete={() => void handleLongPress(selected.seq)}
        />
      )}

      <DamageMarkerTable markers={markers} onSelect={setSelectedSeq} />
    </div>
  );
}

// ── Editor ────────────────────────────────────────────────────────────────

interface MarkerEditorProps {
  marker: DamageMarker;
  onChange: (patch: Partial<DamageMarker>) => void;
  onClose: () => void;
  onDelete: () => void;
}

function MarkerEditor({ marker, onChange, onClose, onDelete }: MarkerEditorProps) {
  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Marker #{marker.seq}</h3>
          {marker.panelId && (
            <p className="text-xs text-muted-foreground">{panelLabel(marker.panelId)}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Close
        </button>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">Type</label>
        <div className="flex flex-wrap gap-1.5">
          {DAMAGE_MARKER_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onChange({ type: t })}
              className="rounded-md border px-2 py-1 text-xs"
              style={
                t === marker.type
                  ? {
                      borderColor: MARKER_TYPE_COLOR[t],
                      background: `color-mix(in oklch, ${MARKER_TYPE_COLOR[t]} 15%, transparent)`,
                    }
                  : undefined
              }
            >
              {MARKER_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">Severity</label>
        <div className="flex gap-1.5">
          {DAMAGE_MARKER_SEVERITIES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onChange({ severity: s })}
              className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-semibold ${
                s === marker.severity
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-input bg-background hover:bg-accent"
              }`}
            >
              {SEVERITY_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">Note</label>
        <textarea
          rows={2}
          value={marker.note}
          onChange={(e) => onChange({ note: e.target.value })}
          className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="What it looks like, roughly how big…"
        />
      </div>

      <button
        type="button"
        onClick={onDelete}
        className="w-full rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/10"
      >
        Delete marker
      </button>
    </div>
  );
}

// ── Table ─────────────────────────────────────────────────────────────────

function DamageMarkerTable({
  markers,
  onSelect,
}: {
  markers: DamageMarker[];
  onSelect: (seq: number) => void;
}) {
  if (markers.length === 0) {
    return <p className="text-sm text-muted-foreground">No damage markers placed yet.</p>;
  }
  const sorted = [...markers].sort((a, b) => a.seq - b.seq);
  return (
    <div className="rounded-xl border border-border">
      {/* Mobile: stacked cards */}
      <div className="divide-y divide-border md:hidden">
        {sorted.map((m) => (
          <div
            key={m.seq}
            onClick={() => onSelect(m.seq)}
            className="cursor-pointer px-3 py-2.5 hover:bg-accent/50"
          >
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-muted-foreground">#{m.seq}</span>
              <span className="text-sm font-medium">{MARKER_TYPE_LABELS[m.type]}</span>
              <span className="text-xs text-muted-foreground">{SEVERITY_LABELS[m.severity]}</span>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
              <span className="capitalize">{m.view}</span>
              {m.panelId && <span>· {panelLabel(m.panelId)}</span>}
            </div>
            {m.note && <div className="mt-0.5 truncate text-xs text-muted-foreground">{m.note}</div>}
          </div>
        ))}
      </div>

      {/* Tablet/desktop: table */}
      <div className="hidden overflow-x-auto md:block">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <th className="px-3 py-2">#</th>
            <th className="px-3 py-2">View</th>
            <th className="px-3 py-2">Panel</th>
            <th className="px-3 py-2">Type</th>
            <th className="px-3 py-2">Severity</th>
            <th className="px-3 py-2">Note</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((m) => (
            <tr
              key={m.seq}
              onClick={() => onSelect(m.seq)}
              className="cursor-pointer border-b border-border last:border-0 hover:bg-accent/50"
            >
              <td className="px-3 py-2 font-mono">{m.seq}</td>
              <td className="px-3 py-2 capitalize">{m.view}</td>
              <td className="px-3 py-2 text-muted-foreground">
                {m.panelId ? panelLabel(m.panelId) : "—"}
              </td>
              <td className="px-3 py-2">{MARKER_TYPE_LABELS[m.type]}</td>
              <td className="px-3 py-2">{SEVERITY_LABELS[m.severity]}</td>
              <td className="max-w-[220px] truncate px-3 py-2 text-muted-foreground">
                {m.note || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
