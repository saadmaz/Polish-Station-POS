import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { auth as firebaseAuth } from "@/lib/firebase";
import { diagFn } from "@/server/diag";

// TEMPORARY diagnostic page. Signs the current admin's ID token into diagFn,
// which times each Firestore/Auth operation createStaffFn performs, and prints
// the result — so we can see WHICH call stalls on the shared host.
// DELETE along with src/server/diag.ts once the hang is understood.
export const Route = createFileRoute("/diag")({ component: Diag });

function Diag() {
  const [lines, setLines] = useState<string[]>(["running…"]);

  useEffect(() => {
    (async () => {
      const started = Date.now();
      try {
        const token = await firebaseAuth.currentUser?.getIdToken();
        if (!token) {
          setLines(["NOT SIGNED IN — log in first, then open /diag"]);
          return;
        }
        const res = await diagFn({ data: { idToken: token } });
        setLines([...res, `TOTAL: ${Date.now() - started}ms`]);
      } catch (e) {
        setLines([`THREW after ${Date.now() - started}ms: ${e instanceof Error ? e.message : e}`]);
      }
    })();
  }, []);

  return (
    <pre id="diag-out" style={{ padding: 24, fontFamily: "monospace", fontSize: 14 }}>
      {lines.join("\n")}
    </pre>
  );
}
