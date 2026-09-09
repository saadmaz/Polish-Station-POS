// Hand-rolled canvas signature pad — no library, matching this app's pattern
// everywhere else (photo capture/compression is also plain canvas, no lib).
// A typed name is never accepted as a signature (see the spec's Phase 4
// hard rule), so there is deliberately no text-input fallback here.
import { useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";

export interface SignaturePadHandle {
  /** null if nothing has been drawn yet — callers must not accept an empty pad as a signature. */
  toBlob: () => Promise<Blob | null>;
  isEmpty: () => boolean;
  clear: () => void;
}

interface SignaturePadProps {
  onHandleReady: (handle: SignaturePadHandle) => void;
  className?: string;
}

/** Pointer-events drawing surface. Reports readiness via onHandleReady
 *  rather than forwardRef + useImperativeHandle — one less API shape to
 *  learn in a codebase with no other imperative-ref components. */
export function SignaturePad({ onHandleReady, className }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const [hasDrawn, setHasDrawn] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Backing-store scaled for device pixel ratio so strokes stay crisp,
    // CSS size stays the layout size — same reasoning as any canvas doing
    // hi-DPI drawing.
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1a1a1a";
  }, []);

  useEffect(() => {
    onHandleReady({
      isEmpty: () => !hasDrawn,
      clear: () => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        setHasDrawn(false);
      },
      toBlob: () =>
        new Promise((resolve) => {
          const canvas = canvasRef.current;
          if (!canvas || !hasDrawn) {
            resolve(null);
            return;
          }
          canvas.toBlob(resolve, "image/png");
        }),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasDrawn]);

  function pointFromEvent(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    lastPointRef.current = pointFromEvent(e);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const last = lastPointRef.current;
    if (!canvas || !ctx || !last) return;
    const point = pointFromEvent(e);
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    lastPointRef.current = point;
    if (!hasDrawn) setHasDrawn(true);
  }

  function handlePointerUp() {
    drawingRef.current = false;
    lastPointRef.current = null;
  }

  return (
    <div className={`relative rounded-md border border-input bg-background ${className ?? ""}`}>
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        className="h-40 w-full touch-none"
        style={{ touchAction: "none" }}
      />
      {!hasDrawn && (
        <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
          Sign here
        </p>
      )}
    </div>
  );
}

/** Small "Clear" button paired with a pad — kept separate so callers control layout. */
export function SignaturePadClearButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 rounded-md border border-input bg-background px-2.5 py-1 text-xs font-medium hover:bg-accent"
    >
      <RotateCcw className="h-3 w-3" />
      Clear
    </button>
  );
}
