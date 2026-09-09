// TEMPORARY. Phase 3 Step A harness for reviewing the damage diagram in
// isolation — no auth, no Firestore, no Storage, purely local React state —
// per the spec's "build standalone, no persistence, review in isolation"
// instruction for this phase. DELETE this route once Step B wires
// DamageDiagram into InspectionSheet for real; see damage-diagram.tsx.
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import type { BodyType } from "@/lib/job";
import type { DamageMarker } from "@/lib/inspection";
import { DamageDiagram, type LocalMarkerPhoto } from "@/components/damage-diagram/damage-diagram";
import { BODY_TYPE_LABELS } from "@/components/damage-diagram/silhouettes";

export const Route = createFileRoute("/diagram-preview")({ component: DiagramPreview });

const BODY_TYPES: BodyType[] = ["sedan", "hatchback", "suv", "double_cab", "van", "coupe"];

function DiagramPreview() {
  const [bodyType, setBodyType] = useState<BodyType>("sedan");
  const [markers, setMarkers] = useState<DamageMarker[]>([]);
  const [photos, setPhotos] = useState<Record<string, LocalMarkerPhoto>>({});

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <div>
        <h1 className="text-lg font-semibold">Damage diagram — Phase 3 Step A preview</h1>
        <p className="text-xs text-muted-foreground">
          Temporary, unauthenticated, local-state-only harness. Nothing here is saved anywhere.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {BODY_TYPES.map((bt) => (
          <button
            key={bt}
            type="button"
            onClick={() => setBodyType(bt)}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
              bt === bodyType
                ? "border-primary bg-primary/10 text-primary"
                : "border-input bg-background hover:bg-accent"
            }`}
          >
            {BODY_TYPE_LABELS[bt]}
          </button>
        ))}
      </div>

      <DamageDiagram
        bodyType={bodyType}
        markers={markers}
        onMarkersChange={setMarkers}
        photos={photos}
        onPhotosChange={setPhotos}
      />
    </div>
  );
}
