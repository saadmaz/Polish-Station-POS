"use server";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { adminAuth, adminDb } from "./firebase-admin";

// TEMPORARY diagnostic. Times each operation createStaffFn performs so we can
// see which one stalls on the shared host, instead of guessing. Returns the
// timings to the caller. Requires a valid ID token (so it is not an open probe
// of the admin SDK), but does no writes to real collections.
// DELETE once the staff-action hang is understood.

const DiagSchema = z.object({ idToken: z.string().min(1) });

async function time<T>(label: string, fn: () => Promise<T>): Promise<[string, T | null]> {
  const t = Date.now();
  try {
    const v = await Promise.race([
      fn(),
      new Promise<never>((_, r) => setTimeout(() => r(new Error("TIMEOUT-30s")), 30_000)),
    ]);
    return [`${label}: ${Date.now() - t}ms OK`, v as T];
  } catch (e) {
    return [`${label}: ${Date.now() - t}ms ERR ${e instanceof Error ? e.message : e}`, null];
  }
}

export const diagFn = createServerFn({ method: "POST" })
  .validator((raw: unknown) => DiagSchema.parse(raw))
  .handler(async ({ data }): Promise<string[]> => {
    const out: string[] = [];

    const [verifyMsg, decoded] = await time("1_verifyIdToken", () =>
      adminAuth.verifyIdToken(data.idToken),
    );
    out.push(verifyMsg);

    const uid = decoded?.uid ?? "unknown";

    const [readMsg] = await time("2_callerDocRead", () =>
      adminDb.collection("staff").doc(uid).get(),
    );
    out.push(readMsg);

    const [queryMsg] = await time("3_nameQuery", () =>
      adminDb.collection("staff").where("name", "==", "__nobody__").get(),
    );
    out.push(queryMsg);

    const [createMsg] = await time("4_docCreate", async () => {
      const ref = adminDb.collection("_diag").doc(`d${Date.now()}`);
      await ref.create({ at: Date.now() });
      return ref.id;
    });
    out.push(createMsg);

    const [batchMsg] = await time("5_batchCommit", () => {
      const b = adminDb.batch();
      b.set(adminDb.collection("_diag").doc(`b${Date.now()}`), { at: Date.now() });
      return b.commit();
    });
    out.push(batchMsg);

    // NOTE: deliberately does NOT call revokeRefreshTokens — that would sign the
    // admin out, and createStaffFn (the operation that hangs) never calls it.

    return out;
  });
