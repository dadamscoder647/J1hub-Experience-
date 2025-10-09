#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_WORKER="$REPO_ROOT/service-worker.js"

if [[ ! -f "$SERVICE_WORKER" ]]; then
  echo "service-worker.js not found at $SERVICE_WORKER" >&2
  exit 1
fi

read -rp "Enter release version suffix (e.g., 6 or 2024.03): " SUFFIX

if [[ -z "${SUFFIX// }" ]]; then
  echo "Version suffix cannot be empty." >&2
  exit 1
fi

NEW_CACHE_VERSION="j1hub-v${SUFFIX}"

if ! grep -q 'const CACHE_VERSION = "j1hub-' "$SERVICE_WORKER"; then
  echo "Unable to locate CACHE_VERSION declaration in $SERVICE_WORKER" >&2
  exit 1
fi

sed -i.bak "s/const CACHE_VERSION = \"j1hub-v[^\"]*\";/const CACHE_VERSION = \"${NEW_CACHE_VERSION}\";/" "$SERVICE_WORKER"
rm "$SERVICE_WORKER.bak"

git -C "$REPO_ROOT" add -A
git -C "$REPO_ROOT" commit -m "release: v${SUFFIX}"
git -C "$REPO_ROOT" tag "v${SUFFIX}"
git -C "$REPO_ROOT" push --follow-tags
