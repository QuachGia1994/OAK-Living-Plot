#!/usr/bin/env python3
"""Generate Living Plot LP monogram brand rasters (dev-only)."""
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    import subprocess
    import sys
    subprocess.check_call([sys.executable, "-m", "pip", "install", "pillow", "-q"])
    from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1] / "apps" / "mobile" / "assets"
BRAND = ROOT / "brand"
BRAND.mkdir(parents=True, exist_ok=True)

NAVY = (12, 11, 10, 255)
GOLD = (217, 164, 94, 255)
GOLD_SOFT = (240, 193, 125, 255)
TRANSPARENT = (0, 0, 0, 0)


def load_serif(size: int):
    candidates = [
        "C:/Windows/Fonts/georgia.ttf",
        "C:/Windows/Fonts/georgiab.ttf",
        "C:/Windows/Fonts/times.ttf",
        "C:/Windows/Fonts/timesbd.ttf",
        "/System/Library/Fonts/Supplemental/Georgia.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
    ]
    for path in candidates:
        p = Path(path)
        if p.exists():
            return ImageFont.truetype(str(p), size=size)
    return ImageFont.load_default()


def draw_monogram(size: int, bg, fg=GOLD) -> Image.Image:
    img = Image.new("RGBA", (size, size), bg)
    draw = ImageDraw.Draw(img)
    font = load_serif(int(size * 0.52))
    text = "LP"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = (size - tw) / 2 - bbox[0]
    y = (size - th) / 2 - bbox[1] - size * 0.02
    draw.text((x, y), text, font=font, fill=fg)
    # restrained underline flourish
    line_y = int(size * 0.78)
    margin = int(size * 0.28)
    draw.rounded_rectangle(
        [margin, line_y, size - margin, line_y + max(2, size // 120)],
        radius=max(1, size // 200),
        fill=GOLD_SOFT,
    )
    return img


def main():
    icon = draw_monogram(1024, NAVY)
    icon.save(BRAND / "living-plot-app-icon.png", optimize=True)
    icon.save(ROOT / "living-plot-icon.png", optimize=True)

    adaptive = draw_monogram(1024, TRANSPARENT)
    adaptive.save(BRAND / "living-plot-adaptive-foreground.png", optimize=True)

    splash = draw_monogram(512, TRANSPARENT)
    splash.save(BRAND / "living-plot-splash-mark.png", optimize=True)

    header = draw_monogram(128, TRANSPARENT)
    header.save(BRAND / "living-plot-monogram.png", optimize=True)

    print("wrote", BRAND)
    for p in sorted(BRAND.glob("*")):
        print(p.name, p.stat().st_size)


if __name__ == "__main__":
    main()
