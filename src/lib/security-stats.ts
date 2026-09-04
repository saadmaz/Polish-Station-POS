// Pure formatters for the Staff & Access "security posture" Stat tiles (see
// src/components/access-panel.tsx). Kept separate and dependency-free so the
// exact string a tile renders can be unit-tested against its source constant
// without rendering the component -- see security-stats.test.ts.

export function formatSessionTimeout(sessionTimeoutMs: number): string {
  return `${sessionTimeoutMs / 60_000} min`;
}

export function formatOfflineLockoutThreshold(lockoutThreshold: number): string {
  return `${lockoutThreshold} fails`;
}

// A doubling backoff has no single "duration" -- rendering one would be
// exactly the kind of rounded, misleading number this replaces. Render the
// curve's own shape (base + "doubling"), not a flattened figure.
export function formatOfflineLockoutBackoff(lockoutBaseMs: number): string {
  return `${lockoutBaseMs / 1000}s, doubling per fail`;
}
