#!/usr/bin/env bash
# optimize-images.sh — convert images to WebP and generate thumbnails
# Usage: ./scripts/optimize-images.sh [optional path filter]

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FILTER="${1:-}"

convert_to_webp() {
    local src="$1"
    local dest="${src%.*}.webp"
    if [[ ! -f "$dest" ]] || [[ "$src" -nt "$dest" ]]; then
        echo "  convert: $(realpath --relative-to="$REPO_ROOT" "$src")"
        cwebp -q 90 "$src" -o "$dest" 2>/dev/null
    fi
}

make_thumbnail() {
    local src="$1"
    local size="$2"
    local thumb_dir
    thumb_dir="$(dirname "$src")/thumbs"
    local thumb="$thumb_dir/$(basename "$src")"
    mkdir -p "$thumb_dir"
    if [[ ! -f "$thumb" ]] || [[ "$src" -nt "$thumb" ]]; then
        echo "  thumb:   $(realpath --relative-to="$REPO_ROOT" "$thumb") (${size}px)"
        cwebp -q 85 -resize "$size" 0 "$src" -o "$thumb" 2>/dev/null
    fi
}

is_icon() {
    local name
    name="$(basename "$1")"
    [[ "$name" == favicon* ]] || [[ "$name" == apple-touch-icon* ]] || [[ "$name" == android-chrome* ]]
}

echo "→ Converting raster images to WebP..."
while IFS= read -r img; do
    is_icon "$img" && continue
    [[ -n "$FILTER" && "$img" != *"$FILTER"* ]] && continue
    convert_to_webp "$img"
done < <(find "$REPO_ROOT/site" \( -name "*.png" -o -name "*.jpg" -o -name "*.jpeg" -o -name "*.gif" \))

echo "→ Generating blog post thumbnails (400px)..."
while IFS= read -r webp; do
    is_icon "$webp" && continue
    [[ "$webp" == */thumbs/* ]] && continue
    [[ -n "$FILTER" && "$webp" != *"$FILTER"* ]] && continue
    make_thumbnail "$webp" 400
done < <(find "$REPO_ROOT/site/content" -name "*.webp")

echo "→ Generating avatar thumbnails (300px)..."
if [[ -d "$REPO_ROOT/site/static/images/avatars" ]]; then
    while IFS= read -r webp; do
        is_icon "$webp" && continue
        [[ "$webp" == */thumbs/* ]] && continue
        make_thumbnail "$webp" 300
    done < <(find "$REPO_ROOT/site/static/images/avatars" -name "*.webp")
fi

echo "✓ Done"
