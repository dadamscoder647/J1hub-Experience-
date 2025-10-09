#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

SERVICE_WORKER="service-worker.js"
if [[ ! -f "$SERVICE_WORKER" ]]; then
  echo "Error: $SERVICE_WORKER not found in repository root." >&2
  exit 1
fi

read -rp "Enter version suffix (e.g., 2024.04): " SUFFIX
if [[ -z "${SUFFIX// }" ]]; then
  echo "Error: version suffix cannot be empty." >&2
  exit 1
fi

CACHE_VERSION="j1hub-v${SUFFIX}"
RELEASE_TAG="v${SUFFIX}"

if git rev-parse -q --verify "refs/tags/${RELEASE_TAG}" > /dev/null; then
  echo "Error: tag ${RELEASE_TAG} already exists." >&2
  exit 1
fi

# Update CACHE_VERSION in the service worker
perl -0pi -e "s/const CACHE_VERSION = \".*?\";/const CACHE_VERSION = \"${CACHE_VERSION//\//\\/}\";/" "$SERVICE_WORKER"

# Stage, commit, tag, and push the release
git add -A
git commit -m "release: ${RELEASE_TAG}" || {
  echo "Nothing to commit." >&2
  exit 1
}

git tag "$RELEASE_TAG"
git push --follow-tags
