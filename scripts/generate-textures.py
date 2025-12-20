#!/usr/bin/env python3
"""
Generate zone textures using OpenAI's gpt-image-1.5 API.
Run with: python3 scripts/generate-textures.py
"""

import os
import base64
from pathlib import Path

try:
    from openai import OpenAI
except ImportError:
    print("Error: openai package not installed. Run: pip install openai")
    exit(1)

# Output directory
OUTPUT_DIR = Path(__file__).parent.parent / "public" / "textures" / "zones"

# Texture prompts for each zone
TEXTURES = {
    "industrial_floor": (
        "Seamless tileable industrial metal floor texture, dark steel plates with rust stains "
        "and oil marks, rivets and grating, worn metallic surface, top-down view, game asset, "
        "dark color scheme, 512x512 pixels"
    ),
    "industrial_wall": (
        "Seamless tileable industrial wall texture, corrugated metal sheets with pipes and "
        "conduits running across, rust patches and grime, concrete sections, dark atmosphere, "
        "game asset, 512x512 pixels"
    ),
    "ritual_floor": (
        "Seamless tileable dark stone floor texture with glowing purple mystical runes, "
        "ancient carved arcane symbols, candlewax stains, occult dungeon floor, dark purple "
        "and black color scheme, top-down view, game asset, 512x512 pixels"
    ),
    "ritual_wall": (
        "Seamless tileable dark dungeon wall texture with carved arcane symbols, glowing "
        "purple crystalline veins in dark stone, mystical energy cracks, ancient masonry, "
        "game asset, 512x512 pixels"
    ),
    "organic_floor": (
        "Seamless tileable dirty organic floor texture, mud and debris, scattered small bones "
        "and organic matter, nest materials like straw and fur, grimy dungeon floor, earthy "
        "brown and dark colors, top-down view, game asset, 512x512 pixels"
    ),
    "organic_wall": (
        "Seamless tileable organic cave wall texture, earthy browns and dark colors, roots "
        "and vines growing through cracks, moisture stains, natural rock formation with "
        "organic growth, game asset, 512x512 pixels"
    ),
    "neutral_floor": (
        "Seamless tileable clean stone floor texture, polished grey flagstones with minimal "
        "wear, orderly geometric pattern, safe room floor appearance, neutral grey tones, "
        "top-down view, game asset, 512x512 pixels"
    ),
    "neutral_wall": (
        "Seamless tileable clean stone wall texture, well-maintained grey masonry blocks, "
        "minimal decoration, sturdy dungeon wall, neutral grey and brown tones, game asset, "
        "512x512 pixels"
    ),
}


def generate_texture(client: OpenAI, name: str, prompt: str) -> bool:
    """Generate a single texture and save it."""
    output_path = OUTPUT_DIR / f"{name}.png"

    # Skip if already exists
    if output_path.exists():
        print(f"  [SKIP] {name}.png already exists")
        return True

    print(f"  [GEN] {name}...")

    try:
        response = client.images.generate(
            model="gpt-image-1",
            prompt=prompt,
            n=1,
            size="1024x1024",
            quality="medium",
        )

        # Get image URL and download
        image_url = response.data[0].url
        if image_url:
            import urllib.request
            urllib.request.urlretrieve(image_url, output_path)
            print(f"  [OK] Saved {name}.png")
            return True

        # Or handle b64 response
        if hasattr(response.data[0], 'b64_json') and response.data[0].b64_json:
            image_data = base64.b64decode(response.data[0].b64_json)
            with open(output_path, "wb") as f:
                f.write(image_data)
            print(f"  [OK] Saved {name}.png")
            return True

        print(f"  [ERR] No image data in response")
        return False

    except Exception as e:
        print(f"  [ERR] Failed to generate {name}: {e}")
        return False


def main():
    # Check API key
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("Error: OPENAI_API_KEY environment variable not set")
        print("Run: export OPENAI_API_KEY='your-key-here'")
        exit(1)

    # Create output directory
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    print(f"Generating zone textures to: {OUTPUT_DIR}")
    print(f"Total textures to generate: {len(TEXTURES)}")
    print()

    client = OpenAI(api_key=api_key)

    success_count = 0
    for name, prompt in TEXTURES.items():
        if generate_texture(client, name, prompt):
            success_count += 1

    print()
    print(f"Complete! Generated {success_count}/{len(TEXTURES)} textures")

    if success_count < len(TEXTURES):
        print("Some textures failed. Re-run the script to retry failed ones.")


if __name__ == "__main__":
    main()
