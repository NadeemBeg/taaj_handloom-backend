#!/usr/bin/env python3
"""
Process raw saree photos into clean, watermarked catalog images + a JSON manifest.

For each source folder (mapped in src/scripts/data/categoryMap.json):
  - skips corrupt / tiny images and near-duplicate shots (average-hash)
  - keeps up to CAP best (highest-resolution) distinct images
  - fits each onto a clean neutral canvas, applies mild colour-safe enhancement,
    and stamps a very subtle "TAAJ Handloom" watermark
  - detects a descriptive dominant colour name for the product title
  - writes processed JPEGs under backend/public/products/<slug>/ and one
    square category thumbnail under backend/public/categories/<slug>.jpg

Output manifest: src/scripts/data/saree-manifest.json (consumed by importSareeProducts.ts).
Colour/design is preserved — only brightness/contrast/sharpness are nudged.

Usage: python3 backend/scripts/process_saree_images.py [SRC_DIR] [CAP]
"""
import json
import os
import sys
from datetime import datetime, timezone

from PIL import Image, ImageOps, ImageEnhance, ImageDraw, ImageFont

# ---- paths -----------------------------------------------------------------
HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.dirname(HERE)
DATA_DIR = os.path.join(BACKEND, "src", "scripts", "data")
CAT_MAP_PATH = os.path.join(DATA_DIR, "categoryMap.json")
MANIFEST_PATH = os.path.join(DATA_DIR, "saree-manifest.json")
PUBLIC = os.path.join(BACKEND, "public")
PROD_OUT = os.path.join(PUBLIC, "products")
CAT_OUT = os.path.join(PUBLIC, "categories")

SRC_DIR = sys.argv[1] if len(sys.argv) > 1 else "/home/nadeem/Downloads/saree photos"
CAP = int(sys.argv[2]) if len(sys.argv) > 2 else 15

# ---- tunables --------------------------------------------------------------
CANVAS = (1000, 1333)          # 3:4 portrait product canvas
CAT_CANVAS = (800, 800)        # square category thumbnail
PAD = 26
BG = (245, 242, 236)           # warm ivory, clean neutral
MIN_SIDE = 500                 # skip images smaller than this on the long edge
DUP_HAMMING = 8                # aHash distance below which two shots are "the same"
JPEG_Q = 86
EXTS = (".jpg", ".jpeg", ".png", ".webp")

FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf",
]


def load_font(size):
    for p in FONT_CANDIDATES:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


# ---- perceptual hash (near-duplicate detection) ----------------------------
def ahash(im):
    g = im.convert("L").resize((8, 8), Image.BILINEAR)
    px = list(g.getdata())
    avg = sum(px) / len(px)
    bits = 0
    for i, v in enumerate(px):
        if v >= avg:
            bits |= (1 << i)
    return bits


def hamming(a, b):
    return bin(a ^ b).count("1")


# ---- colour naming ---------------------------------------------------------
def dominant_color(im):
    """Average the central region, ignoring near-white background pixels."""
    rgb = im.convert("RGB")
    w, h = rgb.size
    box = rgb.crop((int(w * 0.28), int(h * 0.28), int(w * 0.72), int(h * 0.72)))
    box = box.resize((40, 40), Image.BILINEAR)
    px = list(box.getdata())
    kept = [p for p in px if not (p[0] > 232 and p[1] > 232 and p[2] > 232)]
    if len(kept) < 40:
        kept = px
    n = len(kept)
    r = sum(p[0] for p in kept) / n
    g = sum(p[1] for p in kept) / n
    b = sum(p[2] for p in kept) / n
    return (r, g, b)


def rgb_to_hsv(r, g, b):
    r, g, b = r / 255.0, g / 255.0, b / 255.0
    mx, mn = max(r, g, b), min(r, g, b)
    d = mx - mn
    if d == 0:
        h = 0.0
    elif mx == r:
        h = (60 * ((g - b) / d) + 360) % 360
    elif mx == g:
        h = (60 * ((b - r) / d) + 120) % 360
    else:
        h = (60 * ((r - g) / d) + 240) % 360
    s = 0 if mx == 0 else d / mx
    return h, s, mx


def color_name(rgb):
    r, g, b = rgb
    h, s, v = rgb_to_hsv(r, g, b)
    if v < 0.16:
        return "Black"
    if s < 0.12:
        if v > 0.86:
            return "Ivory"
        if v > 0.62:
            return "Off-White"
        if v > 0.34:
            return "Grey"
        return "Charcoal"
    # chromatic
    if h < 15 or h >= 345:
        return "Maroon" if v < 0.55 else "Red"
    if h < 40:
        if v < 0.45:
            return "Brown"
        return "Rust" if s > 0.55 else "Beige"
    if h < 66:
        if s < 0.35:
            return "Beige"
        return "Mustard" if v < 0.75 else "Yellow"
    if h < 160:
        return "Emerald" if v < 0.55 else "Green"
    if h < 200:
        return "Teal"
    if h < 255:
        if v < 0.45:
            return "Navy"
        return "Sky Blue" if (v > 0.78 and s < 0.55) else "Blue"
    if h < 292:
        return "Purple"
    # magenta / pink
    if s > 0.55 and v > 0.55:
        return "Rani Pink"
    return "Pink"


# ---- image pipeline --------------------------------------------------------
def enhance(im):
    """Colour-safe: nudge contrast/colour/sharpness only, never remap hues."""
    im = ImageEnhance.Contrast(im).enhance(1.06)
    im = ImageEnhance.Color(im).enhance(1.04)
    im = ImageEnhance.Sharpness(im).enhance(1.12)
    return im


def fit_canvas(im, canvas, bg):
    cw, ch = canvas
    inner = (cw - 2 * PAD, ch - 2 * PAD)
    src = im.copy()
    src.thumbnail(inner, Image.LANCZOS)
    bgim = Image.new("RGB", canvas, bg)
    x = (cw - src.width) // 2
    y = (ch - src.height) // 2
    if src.mode in ("RGBA", "LA", "P"):
        src = src.convert("RGBA")
        bgim.paste(src, (x, y), src)
    else:
        bgim.paste(src, (x, y))
    return bgim


def watermark(im):
    """Very subtle diagonal 'TAAJ Handloom' — visible only on close inspection."""
    w, h = im.size
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    font = load_font(max(28, w // 11))
    text = "TAAJ Handloom"
    tb = d.textbbox((0, 0), text, font=font)
    tw, th = tb[2] - tb[0], tb[3] - tb[1]
    txt = Image.new("RGBA", (tw + 20, th + 20), (0, 0, 0, 0))
    dt = ImageDraw.Draw(txt)
    # faint light + faint dark shadow so it survives on light AND dark grounds
    dt.text((11, 11), text, font=font, fill=(20, 20, 20, 26))
    dt.text((10, 10), text, font=font, fill=(255, 255, 255, 40))
    txt = txt.rotate(30, expand=True, resample=Image.BICUBIC)
    lx = (w - txt.width) // 2
    ly = (h - txt.height) // 2
    layer.alpha_composite(txt, (lx, ly))
    # tiny solid mark, bottom-right, also low opacity
    sfont = load_font(max(16, w // 34))
    st = "TAAJ Handloom"
    sb = d.textbbox((0, 0), st, font=sfont)
    d.text((w - (sb[2] - sb[0]) - 22, h - (sb[3] - sb[1]) - 26),
           st, font=sfont, fill=(255, 255, 255, 70))
    out = Image.alpha_composite(im.convert("RGBA"), layer)
    return out.convert("RGB")


def process_one(src_path, out_path, canvas):
    im = Image.open(src_path)
    im = ImageOps.exif_transpose(im)
    color = color_name(dominant_color(im))
    im = enhance(im.convert("RGB"))
    im = fit_canvas(im, canvas, BG)
    im = watermark(im)
    im.save(out_path, "JPEG", quality=JPEG_Q, optimize=True)
    return color, canvas


def list_images(folder):
    if not os.path.isdir(folder):
        return []
    out = []
    for f in os.listdir(folder):
        if f.lower().endswith(EXTS) and not f.startswith("."):
            out.append(os.path.join(folder, f))
    return out


def main():
    with open(CAT_MAP_PATH) as fh:
        folders = json.load(fh)["folders"]

    os.makedirs(PROD_OUT, exist_ok=True)
    os.makedirs(CAT_OUT, exist_ok=True)

    manifest = {"generatedAt": datetime.now(timezone.utc).isoformat(),
                "sourceDir": SRC_DIR, "cap": CAP, "categories": {}}
    totals = {"folders": 0, "processed": 0, "skipped_dupe": 0,
              "skipped_small": 0, "skipped_bad": 0, "seen": 0}

    for folder_name, cfg in folders.items():
        slug = cfg["slug"]
        src_folder = os.path.join(SRC_DIR, folder_name)
        files = list_images(src_folder)
        totals["seen"] += len(files)
        if not files:
            print(f"  [skip] {folder_name}: no images")
            continue

        # rank candidates by resolution (proxy for quality), collect hashes
        cands = []
        for p in files:
            try:
                with Image.open(p) as im:
                    im2 = ImageOps.exif_transpose(im)
                    w, hgt = im2.size
                    if max(w, hgt) < MIN_SIDE:
                        totals["skipped_small"] += 1
                        continue
                    cands.append((w * hgt, p, ahash(im2)))
            except Exception:
                totals["skipped_bad"] += 1
                continue
        cands.sort(key=lambda c: c[0], reverse=True)

        selected = []
        for area, p, hsh in cands:
            if len(selected) >= CAP:
                break
            if any(hamming(hsh, s[2]) < DUP_HAMMING for s in selected):
                totals["skipped_dupe"] += 1
                continue
            selected.append((area, p, hsh))

        out_dir = os.path.join(PROD_OUT, slug)
        os.makedirs(out_dir, exist_ok=True)

        products = []
        for i, (area, p, hsh) in enumerate(selected, start=1):
            sku = f"{cfg['skuPrefix']}{i:03d}"
            out_name = f"{sku}.jpg"
            out_path = os.path.join(out_dir, out_name)
            try:
                color, (w, hgt) = process_one(p, out_path, CANVAS)
            except Exception as e:
                totals["skipped_bad"] += 1
                print(f"    ! failed {os.path.basename(p)}: {e}")
                continue
            products.append({
                "sku": sku,
                "color": color,
                "url": f"/static/products/{slug}/{out_name}",
                "width": w, "height": hgt,
                "source": os.path.basename(p),
            })
            totals["processed"] += 1

        # category thumbnail from the first selected image
        cat_img_url = None
        if selected:
            cat_path = os.path.join(CAT_OUT, f"{slug}.jpg")
            try:
                process_one(selected[0][1], cat_path, CAT_CANVAS)
                cat_img_url = f"/static/categories/{slug}.jpg"
            except Exception:
                pass

        manifest["categories"][slug] = {
            "folder": folder_name,
            "name": cfg["name"],
            "isNew": cfg["isNew"],
            "skuPrefix": cfg["skuPrefix"],
            "image": ({"url": cat_img_url} if cat_img_url else None),
            "products": products,
        }
        totals["folders"] += 1
        print(f"  [ok] {folder_name} -> {slug}: {len(products)} products "
              f"(from {len(files)} files)")

    with open(MANIFEST_PATH, "w") as fh:
        json.dump(manifest, fh, indent=2)

    print("\n=== summary ===")
    print(f"  categories written : {totals['folders']}")
    print(f"  images seen        : {totals['seen']}")
    print(f"  products processed : {totals['processed']}")
    print(f"  skipped duplicate  : {totals['skipped_dupe']}")
    print(f"  skipped too small  : {totals['skipped_small']}")
    print(f"  skipped bad/corrupt: {totals['skipped_bad']}")
    print(f"  manifest           : {MANIFEST_PATH}")


if __name__ == "__main__":
    main()
