#!/bin/bash
# Orchestrates the e2e suite against the Firebase emulator only. Intended to
# run inside `firebase emulators:exec`, which sets FIRESTORE_EMULATOR_HOST /
# FIREBASE_AUTH_EMULATOR_HOST for us — every script here refuses to run
# without those set, so this can never touch the real production project.
#
# Serves the real production build (vite build + start.mjs) rather than
# `vite dev`: this app's SSR module graph is large enough (firebase-admin,
# google-cloud/grpc, 46 UI components, ...) that Vite's on-demand dev-mode
# compilation made the very first page load flaky/slow in CI-like conditions.
# A prebuilt bundle is fast, deterministic, and is what actually ships.
set -e

node scripts/seed-emulator.mjs

export VITE_USE_FIREBASE_EMULATOR=true
export VITE_FIREBASE_API_KEY=demo-key
export VITE_FIREBASE_AUTH_DOMAIN=localhost
export VITE_FIREBASE_PROJECT_ID=demo-pos-polishstation
export VITE_FIREBASE_STORAGE_BUCKET=demo-pos-polishstation.appspot.com
export VITE_FIREBASE_MESSAGING_SENDER_ID=000000000000
export VITE_FIREBASE_APP_ID=1:000000000000:web:0000000000000000000000
export FIREBASE_PROJECT_ID=demo-pos-polishstation

echo "Building against the emulator config..."
npm run build > /tmp/ps-e2e-build.log 2>&1 || { echo "Build failed:"; cat /tmp/ps-e2e-build.log; exit 1; }

PORT=5173 node start.mjs > /tmp/ps-e2e-server.log 2>&1 &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null' EXIT

echo "Waiting for server on :5173..."
for i in $(seq 1 30); do
  if curl -s --max-time 5 -o /dev/null http://127.0.0.1:5173/; then
    echo "Server ready."
    break
  fi
  sleep 1
  if [ "$i" = "30" ]; then
    echo "Server never came up. Log:"
    cat /tmp/ps-e2e-server.log
    exit 1
  fi
done

STATUS=0
node scripts/e2e/login.mjs || STATUS=1
node scripts/e2e/booking-flow.mjs || STATUS=1
node scripts/e2e/equipment-integrity.mjs || STATUS=1

exit $STATUS
