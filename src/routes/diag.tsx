import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { auth as firebaseAuth } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { diagFn } from "@/server/diag";

// TEMPORARY diagnostic page. Feeds the current admin's ID token to diagFn, which
// times each Firestore/Auth operation createStaffFn performs, and prints the
// result — so we can see WHICH call stalls on the shared host.
// DELETE along with src/server/diag.ts once the hang is understood.
export const Route = createFileRoute("/diag")({ component: Diag });

function Diag() {
  const { staff, loading } = useAuth();
  const [lines, setLines] = useState<string[]>(["waiting for session…"]);
  const [ran, setRan] = useState(false);

  useEffect(() => {
    // Wait for Firebase to restore the session before reading currentUser —
    // on a fresh page load it is null for the first moment.
    if (loading || ran) return;
    if (!staff) {
      setLines(["NOT SIGNED IN — log in first, then open /diag"]);
      return;
    }
    setRan(true);
    setLines(["running…"]);
    (async () => {
      const started = Date.now();
      try {
        const token = await firebaseAuth.currentUser?.getIdToken();
        if (!token) {
          setLines(["no id token"]);
          return;
        }
        const res = await diagFn({ data: { idToken: token } });
        setLines([...res, `TOTAL: ${Date.now() - started}ms`]);
      } catch (e) {
        setLines([`THREW after ${Date.now() - started}ms: ${e instanceof Error ? e.message : e}`]);
      }
    })();
  }, [loading, staff, ran]);

  return (
    <pre id="diag-out" style={{ padding: 24, fontFamily: "monospace", fontSize: 14 }}>
      {lines.join("\n")}
    </pre>
  );
}
