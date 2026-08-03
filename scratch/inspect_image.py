from PIL import Image

img_path = r"e:\0.1 Github Repo\Whatsapp Bot Automation\letter-d-logo-symbol-in-colorful-rhombus-vector-16270291.png"
img = Image.open(img_path)
print("Image size:", img.size)
print("Image mode:", img.mode)

# Resize for quick color analysis
small = img.resize((100, 100))
colors = small.getcolors(10000)
colors.sort(key=lambda x: x[0], reverse=True)
print("Top 10 colors:")
for count, color in colors[:10]:
    print(f"Count: {count}, Color: {color}")
