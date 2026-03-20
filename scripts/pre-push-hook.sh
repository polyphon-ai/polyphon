#!/usr/bin/env bash
# Pre-push release gate — runs only when pushing a tag.
set -euo pipefail

input=$(cat)
if ! echo "$input" | grep -q 'refs/tags/'; then
  exit 0
fi

echo "Tag push detected — running release gate checks..."

npm run lint
npm run test:unit
npm run test:integration
npm run test:e2e
