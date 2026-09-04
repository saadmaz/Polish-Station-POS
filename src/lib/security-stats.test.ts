import { describe, it, expect } from "vitest";
import { SESSION_TIMEOUT_MS, LOCKOUT_THRESHOLD, LOCKOUT_BASE_MS } from "./security-constants";
import {
  formatSessionTimeout,
  formatOfflineLockoutThreshold,
  formatOfflineLockoutBackoff,
} from "./security-stats";

// Guards the Staff & Access "security posture" Stat tiles (access-panel.tsx)
// against silently drifting from the constants that actually govern
// behaviour. Each assertion hardcodes the CURRENT expected display string:
// if SESSION_TIMEOUT_MS / LOCKOUT_THRESHOLD / LOCKOUT_BASE_MS ever change,
// this fails and forces a deliberate update instead of the security screen
// quietly showing a stale number.
describe("security stat tiles reflect their source constants", () => {
  it("Session Timeout tile matches SESSION_TIMEOUT_MS", () => {
    expect(formatSessionTimeout(SESSION_TIMEOUT_MS)).toBe("15 min");
  });

  it("Offline PIN Lockout tile matches LOCKOUT_THRESHOLD", () => {
    expect(formatOfflineLockoutThreshold(LOCKOUT_THRESHOLD)).toBe("5 fails");
  });

  it("Offline Lockout Backoff tile matches LOCKOUT_BASE_MS and states a curve, not a flat duration", () => {
    const value = formatOfflineLockoutBackoff(LOCKOUT_BASE_MS);
    expect(value).toBe("30s, doubling per fail");
    // The old tile said "5 min" -- a single number. Reject any regression
    // back toward a flat duration string.
    expect(value).not.toMatch(/^\d+\s*min$/);
  });
});
