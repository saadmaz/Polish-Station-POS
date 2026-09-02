"use server";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { adminDb } from "./firebase-admin";
import { withRetry } from "./retry";
import { requireAdmin, requireManager } from "./staff-admin";

// Enrolled tills for offline PIN login (see src/lib/offline-auth.ts). A
// device doc never holds a secret -- the till generates its own local secret
// client-side the moment enrollment succeeds and never sends it here. This
// collection exists purely so an Admin can see what's enrolled and revoke a
// specific till (lost/stolen tablet) -- see firestore.rules, `devices/{id}`.

export interface DeviceRow {
  id: string;
  label: string;
  enrolledBy: string;
  enrolledAt: string; // ISO
  revoked: boolean;
}

export type DeviceActionError = "unauthorized" | "not_found";
export type DeviceActionResult = { success: true } | { success: false; error: DeviceActionError };

const IdTokenSchema = z.object({ idToken: z.string().min(1) });

const EnrollSchema = z.object({
  idToken: z.string().min(1),
  label: z.string().trim().min(1).max(60),
});

export const enrollDeviceFn = createServerFn({ method: "POST" })
  .validator((raw: unknown) => EnrollSchema.parse(raw))
  .handler(
    async ({
      data,
    }): Promise<
      { success: true; deviceId: string } | { success: false; error: "unauthorized" }
    > => {
      const caller = await requireAdmin(data.idToken);
      if (!caller) return { success: false, error: "unauthorized" };

      const ref = adminDb.collection("devices").doc();
      await withRetry(
        () =>
          ref.set({
            label: data.label,
            enrolledBy: caller.uid,
            enrolledAt: new Date().toISOString(),
            revoked: false,
          }),
        "device enroll",
      );
      return { success: true, deviceId: ref.id };
    },
  );

const RevokeSchema = z.object({
  idToken: z.string().min(1),
  deviceId: z.string().min(1),
});

export const revokeDeviceFn = createServerFn({ method: "POST" })
  .validator((raw: unknown) => RevokeSchema.parse(raw))
  .handler(async ({ data }): Promise<DeviceActionResult> => {
    const caller = await requireAdmin(data.idToken);
    if (!caller) return { success: false, error: "unauthorized" };

    const ref = adminDb.collection("devices").doc(data.deviceId);
    const snap = await withRetry(() => ref.get(), "device lookup");
    if (!snap.exists) return { success: false, error: "not_found" };

    await withRetry(() => ref.update({ revoked: true }), "device revoke");
    return { success: true };
  });

export const listDevicesFn = createServerFn({ method: "POST" })
  .validator((raw: unknown) => IdTokenSchema.parse(raw))
  .handler(
    async ({
      data,
    }): Promise<
      { success: true; devices: DeviceRow[] } | { success: false; error: "unauthorized" }
    > => {
      const caller = await requireManager(data.idToken);
      if (!caller) return { success: false, error: "unauthorized" };

      const snap = await withRetry(
        () => adminDb.collection("devices").orderBy("enrolledAt", "desc").get(),
        "device list",
      );
      return {
        success: true,
        devices: snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<DeviceRow, "id">) })),
      };
    },
  );
