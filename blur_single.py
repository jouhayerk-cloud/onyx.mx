from PIL import Image, ImageFilter

try:
    img_path = "public/tutorial/step4.png"
    y_start = 580
    
    img = Image.open(img_path)
    
    # Blur username
    username_box = (1750, 40, 1900, 90)
    u_crop = img.crop(username_box)
    u_blur = u_crop.filter(ImageFilter.GaussianBlur(radius=15))
    img.paste(u_blur, username_box)
    
    # Blur item details
    items_box = (150, y_start, 1920, img.height)
    i_crop = img.crop(items_box)
    i_blur = i_crop.filter(ImageFilter.GaussianBlur(radius=15))
    img.paste(i_blur, items_box)
    
    img.save(img_path)
    print(f"Processed {img_path}")
except Exception as e:
    print(f"Failed {img_path}: {e}")
