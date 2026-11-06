"""Gera os ícones PNG da extensão a partir de um bitmap pixel-art 16x16.

Uso: python3 scripts/generate-icons.py
Requer Pillow (pip install pillow).
"""
from pathlib import Path
from PIL import Image

# . = transparente | o = laranja | d = laranja escuro (sombra) | w = creme
BITMAP = [
    "................",
    "................",
    "...oooooooooo...",
    "..oooooooooooo..",
    ".oooooooooooooo.",
    ".oooooooooooooo.",
    ".ooowwowwowwooo.",
    ".ooowwowwowwooo.",
    ".oooooooooooooo.",
    ".ooooooooooooood",
    "..oooooooooooodd",
    "..ooodddddddddd.",
    "..ood...........",
    "..od............",
    "..d.............",
    "................",
]

COLORS = {
    "o": (217, 119, 87, 255),   # #D97757 – laranja Claude
    "d": (174, 86, 48, 255),    # #AE5630 – sombra
    "w": (250, 249, 245, 255),  # #FAF9F5 – creme
}

ROOT = Path(__file__).resolve().parent.parent


def render(size: int) -> Image.Image:
    base = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    px = base.load()
    for y, row in enumerate(BITMAP):
        assert len(row) == 16, (y, row)
        for x, ch in enumerate(row):
            if ch in COLORS:
                px[x, y] = COLORS[ch]
    return base.resize((size, size), Image.NEAREST)


if __name__ == "__main__":
    out = ROOT / "icons"
    out.mkdir(exist_ok=True)
    for size in (16, 32, 48, 128):
        render(size).save(out / f"icon{size}.png")
    print("ícones gerados em", out)
