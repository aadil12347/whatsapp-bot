import os, math
from PIL import Image, ImageDraw

def render_logo(size):
    # 8x super sampling for ultra-crisp anti-aliasing
    scale = 8
    w = size * scale
    h = size * scale
    center = (w / 2, h / 2)
    r = (w / 2) * 0.90

    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # 1. Background Circle (#0B0F19 to #064E3B)
    for i in range(int(r), 0, -2):
        ratio = i / r
        red = int(0x0B + (0x06 - 0x0B) * ratio)
        green = int(0x0F + (0x4E - 0x0F) * ratio)
        blue = int(0x19 + (0x3B - 0x19) * ratio)
        draw.ellipse([center[0] - i, center[1] - i, center[0] + i, center[1] + i], fill=(red, green, blue, 255))

    # 2. Outer Champagne Gold Ring Accent (#F8E7C9)
    gold = (248, 231, 201, 255)
    border_w = int(w * 0.025)
    draw.ellipse([center[0] - r, center[1] - r, center[0] + r, center[1] + r], outline=gold, width=border_w)

    # 3. Outer Dash Orbit Ring
    r_orbit = r * 0.82
    num_dashes = 24
    dash_w = int(w * 0.008)
    for k in range(num_dashes):
        if k % 2 == 0:
            a1 = (k / num_dashes) * 2 * math.pi
            a2 = ((k + 0.7) / num_dashes) * 2 * math.pi
            points = []
            steps = 10
            for step in range(steps + 1):
                ang = a1 + (a2 - a1) * (step / steps)
                points.append((center[0] + r_orbit * math.cos(ang), center[1] + r_orbit * math.sin(ang)))
            draw.line(points, fill=(248, 231, 201, 100), width=dash_w)

    # 4. Monogram "D" Path
    d_stroke_w = int(w * 0.05)

    x_left = center[0] - r * 0.30
    y_top = center[1] - r * 0.46
    y_bottom = center[1] + r * 0.46
    x_right = center[0] + r * 0.05
    x_peak = center[0] + r * 0.50

    d_points = []
    # Top horizontal
    steps = 20
    for i in range(steps):
        t = i / steps
        d_points.append((x_left + (x_right - x_left) * t, y_top))

    # Right cubic curve (from (x_right, y_top) through (x_peak, center.y) to (x_right, y_bottom))
    steps = 40
    for i in range(steps + 1):
        t = i / steps
        p_y = (1-t)*(1-t)*y_top + 2*(1-t)*t*center[1] + t*t*y_bottom
        p_x = (1-t)*(1-t)*x_right + 2*(1-t)*t*x_peak + t*t*x_right
        d_points.append((p_x, p_y))

    # Bottom horizontal
    steps = 20
    for i in range(steps):
        t = i / steps
        d_points.append((x_right - (x_right - x_left) * t, y_bottom))

    # Left vertical
    steps = 20
    for i in range(steps + 1):
        t = i / steps
        d_points.append((x_left, y_bottom - (y_bottom - y_top) * t))

    draw.line(d_points, fill=gold, width=d_stroke_w, joint="curve")

    # 5. Play Button Triangle inside D
    px = center[0] - r * 0.04
    py = center[1]
    psize = r * 0.28

    p1 = (px - psize * 0.35, py - psize * 0.55)
    p2 = (px + psize * 0.55, py)
    p3 = (px - psize * 0.35, py + psize * 0.55)

    draw.polygon([p1, p2, p3], fill=gold)

    # Downsample with LANCZOS
    return img.resize((size, size), Image.Resampling.LANCZOS)

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
    icon = render_logo(s)
    icon.save(out_path, "PNG")
    print(f"Rendered {out_path} ({s}x{s})")

# Also save 512x512 preview to scratch
scratch_path = r"C:\Users\mdani\.gemini\antigravity-ide\brain\af2cacdd-d3cc-47ef-bb09-8827336217ed\scratch\logo_preview.png"
preview = render_logo(512)
preview.save(scratch_path, "PNG")
print(f"Saved 512x512 preview to {scratch_path}")
