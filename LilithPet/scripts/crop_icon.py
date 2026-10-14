import bpy, numpy as np, sys
args = sys.argv[sys.argv.index('--') + 1:]
src, out = args[0], args[1]
img = bpy.data.images.load(src)
w, h = img.size
arr = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1]  # row0 = top
lum = arr[..., :3].mean(axis=2)
mask = lum < 0.93
left = mask[:, : int(w * 0.42)]
ys, xs = np.where(left)
y0, y1 = int(ys.min()), int(ys.max())
x0, x1 = int(xs.min()), int(xs.max())
print('figure bbox', x0, y0, x1, y1)
cx = (x0 + x1) // 2
fw, fh = x1 - x0, y1 - y0
side = int(max(fw * 0.92, fh * 0.46))
side = min(side, h - 4)
x0c = max(0, min(w - side, cx - side // 2))
y0c = max(0, y0 - int(fh * 0.02))
if y0c + side > h:
    y0c = h - side
sub = arr[y0c:y0c + side, x0c:x0c + side]
print('crop', x0c, y0c, side)
outimg = bpy.data.images.new('crop', sub.shape[1], sub.shape[0], alpha=True)
outimg.pixels = sub[::-1].flatten().tolist()
outimg.filepath_raw = out
outimg.file_format = 'PNG'
outimg.save()
print('saved', out, 'size', sub.shape[1], sub.shape[0])
