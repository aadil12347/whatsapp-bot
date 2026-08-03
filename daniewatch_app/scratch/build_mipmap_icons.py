import os
from PIL import Image

master_path = r"e:\0.1 Github Repo\Whatsapp Bot Automation\daniewatch_app\scratch\app_icon_master.png"
if not os.path.exists(master_path):
    # Fallback to screenshot.png if generated in cwd
    master_path = r"e:\0.1 Github Repo\Whatsapp Bot Automation\daniewatch_app\screenshot.png"

img = Image.open(master_path).convert("RGBA")
w, h = img.size
min_dim = min(w, h)
left = (w - min_dim) / 2
top = (h - min_dim) / 2
img_cropped = img.crop((left, top, left + min_dim, top + min_dim))

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
    print(f"Saved launcher icon: {out_path} ({s}x{s})")

print("All Android launcher icons updated successfully!")
