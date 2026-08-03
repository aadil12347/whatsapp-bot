import os
from PIL import Image, ImageDraw, ImageFilter

def draw_logo(size):
    # Render at 4x super sampling for anti-aliasing
    scale = 4
    w = size * scale
    h = size * scale
    center = (w / 2, h / 2)
    r = (w / 2) * 0.92

    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # 1. Circle Background Gradient fill (Dark Void -> Emerald Ink)
    # Radial/Linear approximation in PIL
    for i in range(int(r), 0, -1):
        ratio = i / r
        # Lerp between #064E3B (ratio 1.0) and #0B0F19 (ratio 0.0)
        red = int(0x0B + (0x06 - 0x0B) * ratio)
        green = int(0x0F + (0x4E - 0x0F) * ratio)
        blue = int(0x19 + (0x3B - 0x19) * ratio)
        draw.ellipse([center[0] - i, center[1] - i, center[0] + i, center[1] + i], fill=(red, green, blue, 255))

    # 2. Outer Champagne Gold Ring Accent
    gold_color = (248, 231, 201, 255) # #F8E7C9
    ring_thickness = int(w * 0.035)
    draw.ellipse([center[0] - r, center[1] - r, center[0] + r, center[1] + r], outline=gold_color, width=ring_thickness)

    # 3. Stylized "D" Monogram Outline
    # Coordinates relative to center
    d_left = center[0] - r * 0.32
    d_top = center[1] - r * 0.52
    d_bottom = center[1] + r * 0.52
    d_right = center[0] + r * 0.22
    stroke_w = int(w * 0.055)

    # Vertical bar of D
    draw.line([(d_left, d_top), (d_left, d_bottom)], fill=gold_color, width=stroke_w)
    # Top horizontal
    draw.line([(d_left, d_top), (d_right, d_top)], fill=gold_color, width=stroke_w)
    # Bottom horizontal
    draw.line([(d_left, d_bottom), (d_right, d_bottom)], fill=gold_color, width=stroke_w)

    # Right Arc of D
    arc_box = [center[0] - r * 0.22, d_top, center[0] + r * 0.68, d_bottom]
    draw.arc(arc_box, start=270, end=90, fill=gold_color, width=stroke_w)

    # 4. Play Triangle inside D
    px = center[0] - r * 0.05
    py = center[1]
    psize = r * 0.32

    p1 = (px - psize * 0.35, py - psize * 0.65)
    p2 = (px + psize * 0.55, py)
    p3 = (px - psize * 0.35, py + psize * 0.65)

    draw.polygon([p1, p2, p3], fill=gold_color)

    # Downsample with LANCZOS high-quality anti-aliasing
    final_img = img.resize((size, size), Image.Resampling.LANCZOS)
    return final_img

# Output directories
res_dir = r"e:\0.1 Github Repo\Whatsapp Bot Automation\daniewatch_app\android\app\src\main\res"
sizes = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}

for folder, s in sizes.items():
    out_folder = os.path.join(res_dir, folder)
    os.makedirs(out_folder, exist_ok=True)
    out_path = os.path.join(out_folder, "ic_launcher.png")
    icon = draw_logo(s)
    icon.save(out_path, "PNG")
    print(f"Generated {out_path} ({s}x{s})")

print("All Android launcher icons generated successfully!")
