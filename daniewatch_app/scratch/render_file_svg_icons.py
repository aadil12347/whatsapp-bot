import os
from svglib.svglib import svg2rlg
from reportlab.graphics import renderPM
from PIL import Image

svg_path = r"e:\0.1 Github Repo\Whatsapp Bot Automation\daniewatch_app\assets\logo.svg"
drawing = svg2rlg(svg_path)

# Render high-resolution master PNG (1024x1024)
master_png_path = r"e:\0.1 Github Repo\Whatsapp Bot Automation\daniewatch_app\scratch\logo_master_vector.png"
os.makedirs(os.path.dirname(master_png_path), exist_ok=True)
renderPM.drawToFile(drawing, master_png_path, fmt="PNG", dpi=180)

# Load master PNG with PIL
img = Image.open(master_png_path).convert("RGBA")
w, h = img.size
min_dim = min(w, h)
left = (w - min_dim) / 2
top = (h - min_dim) / 2
img_cropped = img.crop((left, top, left + min_dim, top + min_dim))

# Output directories for Android launcher icons
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
    icon = img_cropped.resize((s, s), Image.Resampling.LANCZOS)
    icon.save(out_path, "PNG")
    print(f"Generated {out_path} ({s}x{s})")

# Save assets/logo.png (512x512)
logo_png_path = r"e:\0.1 Github Repo\Whatsapp Bot Automation\daniewatch_app\assets\logo.png"
logo_png = img_cropped.resize((512, 512), Image.Resampling.LANCZOS)
logo_png.save(logo_png_path, "PNG")
print(f"Generated {logo_png_path} (512x512)")
