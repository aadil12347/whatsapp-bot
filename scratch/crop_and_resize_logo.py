import os
from PIL import Image

src_path = r"e:\0.1 Github Repo\Whatsapp Bot Automation\letter-d-logo-symbol-in-colorful-rhombus-vector-16270291.png"
img = Image.open(src_path).convert("RGBA")

# Resize high quality for launcher icon
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
    icon = img.resize((s, s), Image.Resampling.LANCZOS)
    icon.save(out_path, "PNG")
    print(f"Saved {out_path} ({s}x{s})")

# Save assets/logo.png
assets_path = r"e:\0.1 Github Repo\Whatsapp Bot Automation\daniewatch_app\assets\logo.png"
os.makedirs(os.path.dirname(assets_path), exist_ok=True)
img.save(assets_path, "PNG")
print(f"Saved {assets_path}")
