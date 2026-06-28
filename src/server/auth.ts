"use server";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { adminAuth, adminDb } from "./firebase-admin";

const LoginSchema = z.object({
  staffId: z.string().min(1).max(20),
  pin:     z.string().length(4).regex(/^\d{4}$/),
});

export type LoginResult =
  | { success: true;  customToken: string }
  | { success: false; error: "invalid_credentials" }
  | { success: false; error: "locked";   remainingSec: number }
  | { success: false; error: "inactive" };

export const loginFn = createServerFn({ method: "POST" })
  .validator((raw: unknown) => LoginSchema.parse(raw))
  .handler(async ({ data }): Promise<LoginResult> => {
    const { staffId, pin } = data;

    const staffRef = adminDb.collection("staff").doc(staffId);
    const snap     = await staffRef.get();

    if (!snap.exists) {
      // Constant-time response to prevent user enumeration via timing
      await new Promise(r => setTimeout(r, 200));
      return { success: false, error: "invalid_credentials" };
    }

    const staff = snap.data()!;

    if (staff.active === false) {
      return { success: false, error: "inactive" };
    }

    // Server-side lockout — persisted in Firestore, survives page refresh
    if (staff.lockedUntil) {
      const lockedMs: number =
        typeof staff.lockedUntil.toMillis === "function"
          ? staff.lockedUntil.toMillis()
          : Number(staff.lockedUntil);
      if (lockedMs > Date.now()) {
        const remainingSec = Math.ceil((lockedMs - Date.now()) / 1000);
        return { success: false, error: "locked", remainingSec };
      }
    }

    const valid = await bcrypt.compare(pin, staff.pinHash as string);

    if (!valid) {
      const newFails = ((staff.failCount as number) ?? 0) + 1;
      const update: Record<string, unknown> = { failCount: newFails };
      if (newFails >= 5) {
        // Lock for 5 minutes, reset counter
        update.lockedUntil = new Date(Date.now() + 5 * 60 * 1000);
        update.failCount   = 0;
      }
      await staffRef.update(update);
      return { success: false, error: "invalid_credentials" };
    }

    // Successful login — reset fail counter
    await staffRef.update({ failCount: 0, lockedUntil: null });

    // Issue a Firebase custom token carrying role + name as claims
    const customToken = await adminAuth.createCustomToken(staffId, {
      role: staff.role,
      name: staff.name,
    });

    return { success: true, customToken };
  });
