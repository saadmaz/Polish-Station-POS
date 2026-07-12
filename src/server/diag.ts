"use server";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { adminAuth, adminDb } from "./firebase-admin";

// TEMPORARY diagnostic. The staff server functions hang and never return, so a
// diagnostic that only reports at the END tells us nothing. Instead this writes
// its progress to Firestore after EVERY step (writes are proven to work from
// this host), so even if it hangs we can read the doc and see exactly which
// call it died on. DELETE once the hang is understood.

const DiagSchema = z.object({ idToken: z.string().min(1) });

export const diagFn = createServerFn({ method: "POST" })
  .validator((raw: unknown) => DiagSchema.parse(raw))
  .handler(async ({ data }): Promise<string[]> => {
    const runId = `run${Date.now()}`;
    const ref = adminDb.collection("_diag").doc(runId);
    const steps: string[] = [];

    // Each step is recorded BEFORE and AFTER, so a hang leaves the "before"
    // marker as the last thing written — pinpointing the exact culprit.
    const mark = async (s: string) => {
      steps.push(`${s} @${Date.now()}`);
      await ref.set({ steps, at: Date.now() }).catch(() => {});
    };

    await mark("00_handler_entered");

    await mark("01_before_verifyIdToken");
    let uid = "unknown";
    try {
      const decoded = await adminAuth.verifyIdToken(data.idToken);
      uid = decoded.uid;
      await mark(`02_after_verifyIdToken_ok_uid=${uid}`);
    } catch (e) {
      await mark(`02_verifyIdToken_THREW: ${e instanceof Error ? e.message : e}`);
    }

    await mark("03_before_callerRead");
    try {
      await adminDb.collection("staff").doc(uid).get();
      await mark("04_after_callerRead_ok");
    } catch (e) {
      await mark(`04_callerRead_THREW: ${e instanceof Error ? e.message : e}`);
    }

    await mark("05_before_nameQuery");
    try {
      await adminDb.collection("staff").where("name", "==", "__nobody__").get();
      await mark("06_after_nameQuery_ok");
    } catch (e) {
      await mark(`06_nameQuery_THREW: ${e instanceof Error ? e.message : e}`);
    }

    await mark("07_before_docCreate");
    try {
      await adminDb.collection("_diag").doc(`c${Date.now()}`).create({ at: Date.now() });
      await mark("08_after_docCreate_ok");
    } catch (e) {
      await mark(`08_docCreate_THREW: ${e instanceof Error ? e.message : e}`);
    }

    await mark("09_DONE");
    return steps;
  });
