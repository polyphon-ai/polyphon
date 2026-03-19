#!/usr/bin/env python3
"""Generate and insert a hero image for a Hugo blog post leaf bundle.

Usage:
    python3 scripts/generate-post-image.py site/content/blog/my-post/index.md [extra context]

Reads ANTHROPIC_API_KEY and OPENAI_API_KEY from environment (or .env at repo root).
Self-re-execs with .venv/bin/python3 if available.
"""

import os
import sys
from pathlib import Path

# Self-re-exec with venv python if not already running in it
_VENV_PYTHON = Path(__file__).parent.parent / ".venv" / "bin" / "python3"
if _VENV_PYTHON.exists() and Path(sys.executable).resolve() != _VENV_PYTHON.resolve():
    os.execv(str(_VENV_PYTHON), [str(_VENV_PYTHON)] + sys.argv)

# Load .env from repo root if present
_ENV_FILE = Path(__file__).parent.parent / ".env"
if _ENV_FILE.exists():
    for _line in _ENV_FILE.read_text().splitlines():
        _line = _line.strip()
        if _line and not _line.startswith("#") and "=" in _line:
            _k, _v = _line.split("=", 1)
            os.environ.setdefault(_k.strip(), _v.strip())

import base64
import subprocess
import urllib.request

try:
    import anthropic
    import openai
except ImportError:
    print("Missing packages. Run: python3 -m venv .venv && .venv/bin/pip install anthropic openai")
    sys.exit(1)

HOUSE_STYLE = (
    "Flat vector illustration. Dark navy or charcoal background. "
    "Electric blue and warm amber as primary accent colors. "
    "Clean lines, minimal detail, no photorealism. "
    "No text, letters, words, or numbers anywhere in the image. "
    "Modern SaaS marketing illustration aesthetic, similar to Stripe or Linear. "
    "Landscape orientation, 16:9 ratio."
)


def derive_visual_concept(post_content: str, extra_context: str) -> str:
    client = anthropic.Anthropic()
    prompt = (
        "Read the following blog post and derive a 2-3 sentence concrete visual concept "
        "for a hero illustration. Focus on the central metaphor or theme of the post. "
        "Be specific about what objects, shapes, or scenes should appear in the image. "
        "Do not mention text, words, or UI elements."
    )
    if extra_context:
        prompt += f"\n\nAdditional direction from the author: {extra_context}"
    prompt += f"\n\nBlog post:\n\n{post_content[:6000]}"

    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=300,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text.strip()


def generate_image_url(concept: str) -> str:
    client = openai.OpenAI()
    full_prompt = f"{concept}\n\nStyle: {HOUSE_STYLE}"
    response = client.images.generate(
        model="dall-e-3",
        prompt=full_prompt,
        size="1792x1024",
        quality="hd",
        n=1,
    )
    return response.data[0].url


def download(url: str, dest: Path) -> None:
    urllib.request.urlretrieve(url, dest)


def convert_to_webp(png: Path, webp: Path) -> None:
    subprocess.run(["cwebp", "-q", "90", str(png), "-o", str(webp)], check=True, capture_output=True)


def make_thumbnail(webp: Path, thumb_dir: Path, size: int = 400) -> None:
    thumb_dir.mkdir(parents=True, exist_ok=True)
    thumb = thumb_dir / webp.name
    subprocess.run(
        ["cwebp", "-q", "85", "-resize", str(size), "0", str(webp), "-o", str(thumb)],
        check=True,
        capture_output=True,
    )


def generate_alt_text(webp: Path) -> str:
    client = anthropic.Anthropic()
    encoded = base64.standard_b64encode(webp.read_bytes()).decode("utf-8")
    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=64,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {"type": "base64", "media_type": "image/webp", "data": encoded},
                    },
                    {
                        "type": "text",
                        "text": "Write accurate alt text for this image in 10-15 words. Return only the alt text, no quotes or punctuation at the end.",
                    },
                ],
            }
        ],
    )
    return message.content[0].text.strip()


def insert_into_post(post_path: Path, webp_name: str, alt_text: str) -> None:
    content = post_path.read_text()

    # Add image field to YAML frontmatter if not already present
    if "\nimage:" not in content:
        # Split on first and second ---
        parts = content.split("---", 2)
        if len(parts) == 3:
            frontmatter = parts[1].rstrip("\n")
            body = parts[2]
            frontmatter += f'\nimage: "{webp_name}"'
            content = f"---{frontmatter}\n---{body}"

    # Insert figure-float shortcode at start of body (after frontmatter block)
    shortcode = f'{{{{< figure-float src="{webp_name}" alt="{alt_text}" >}}}}\n\n'
    if "figure-float" not in content:
        parts = content.split("---", 2)
        if len(parts) == 3:
            parts[2] = "\n" + shortcode + parts[2].lstrip("\n")
            content = "---".join(parts)

    post_path.write_text(content)


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python3 scripts/generate-post-image.py <path/to/index.md> [extra context]")
        sys.exit(1)

    post_path = Path(sys.argv[1])
    extra_context = " ".join(sys.argv[2:])

    if not post_path.exists():
        print(f"Error: {post_path} does not exist")
        sys.exit(1)

    bundle_dir = post_path.parent
    slug = bundle_dir.name
    png_path = bundle_dir / f"{slug}.png"
    webp_path = bundle_dir / f"{slug}.webp"
    thumb_dir = bundle_dir / "thumbs"

    print(f"📖  Reading post…")
    post_content = post_path.read_text()

    print("🧠  Deriving visual concept with Claude…")
    concept = derive_visual_concept(post_content, extra_context)
    print(f"\n    {concept}\n")

    print("🎨  Generating image with DALL-E 3…")
    image_url = generate_image_url(concept)

    print(f"⬇️   Downloading PNG…")
    download(image_url, png_path)

    print(f"🔄  Converting to WebP…")
    convert_to_webp(png_path, webp_path)

    print(f"🖼   Creating thumbnail…")
    make_thumbnail(webp_path, thumb_dir)

    print("✍️   Generating alt text with Claude Vision…")
    alt_text = generate_alt_text(webp_path)
    print(f"\n    {alt_text}\n")

    print("📝  Inserting into post…")
    insert_into_post(post_path, f"{slug}.webp", alt_text)

    print(f"✅  Done → {webp_path}")


if __name__ == "__main__":
    main()
