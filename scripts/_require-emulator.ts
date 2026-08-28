// Every Admin-SDK script in this directory must call this before
// initializeApp(). It flips the previous default (every script connects to
// the real project unless someone remembers to set FIRESTORE_EMULATOR_HOST
// first) to the opposite: refuse to run against anything but the emulator
// unless the real project is targeted deliberately and explicitly.
//
// Mirrors the guard scripts/seed-emulator.mjs already had — this just
// applies the same pattern to every other script here, which previously had
// no such check at all.
export function requireEmulatorOrExplicitProduction(): void {
  if (process.env.FIRESTORE_EMULATOR_HOST) return;

  if (process.argv.includes("--production")) {
    console.warn(
      `⚠️  --production passed: this run targets the REAL project ` +
        `(${process.env.FIREBASE_PROJECT_ID ?? "(FIREBASE_PROJECT_ID not set)"}), not the emulator.\n`,
    );
    return;
  }

  console.error(
    "❌ Refusing to run: FIRESTORE_EMULATOR_HOST is not set, which means this would hit the real " +
      "Firestore project.\n" +
      "   Start the emulator and set FIRESTORE_EMULATOR_HOST (e.g. 127.0.0.1:8080), or run this " +
      "under `firebase emulators:exec`.\n" +
      "   If you genuinely intend to target the live project, pass --production explicitly.",
  );
  process.exit(1);
}

/**
 * For destructive scripts (wipe-all-data, purge-staff) that must never be
 * given an escape hatch to the real project, deliberately unlike
 * requireEmulatorOrExplicitProduction() above: there is no --production
 * override here, on purpose. Emulator or nothing.
 */
export function requireEmulatorOnly(): void {
  if (process.env.FIRESTORE_EMULATOR_HOST) return;
  console.error(
    "❌ Refusing to run: this script is destructive and emulator-only, with no override flag.\n" +
      "   Start the emulator and set FIRESTORE_EMULATOR_HOST (e.g. 127.0.0.1:8080), or run this " +
      "under `firebase emulators:exec`.",
  );
  process.exit(1);
}
