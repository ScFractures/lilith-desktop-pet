"""Convert an FBX or GLB character into the compact GLB the desktop pet app loads.

Run:
  Blender -b --python import_fbx_glb.py -- <source.fbx|source.glb> <out.glb> [--texture path] [--polys 260000] [--tex 4096] [--height 0.98]

The source is left untouched. Meshes are joined, decimated and exported with
Y-up coordinates so the renderer can normalise and rotate them like the original
Lilith model. GLB input keeps its embedded textures. --height uniformly scales
the mesh so its Blender Z extent matches, keeping characters authored at
different scales the same in-app size.
"""
import bpy
import os
import shutil
import sys
import tempfile
import time

argv = sys.argv
args = argv[argv.index("--") + 1:] if "--" in argv else []

FBX = args[0]
OUT = args[1]
TEXTURE = None
TARGET_POLYS = 260000
TEX_MAX = 4096
TARGET_HEIGHT = 0.0
i = 2
while i < len(args):
    if args[i] == "--texture" and i + 1 < len(args):
        TEXTURE = args[i + 1]; i += 2
    elif args[i] == "--polys" and i + 1 < len(args):
        TARGET_POLYS = int(args[i + 1]); i += 2
    elif args[i] == "--tex" and i + 1 < len(args):
        TEX_MAX = int(args[i + 1]); i += 2
    elif args[i] == "--height" and i + 1 < len(args):
        TARGET_HEIGHT = float(args[i + 1]); i += 2
    else:
        raise SystemExit(f"unknown argument: {args[i]}")

t0 = time.time()

bpy.ops.wm.read_factory_settings(use_empty=True)
if FBX.lower().endswith((".glb", ".gltf")):
    bpy.ops.import_scene.gltf(filepath=FBX)
else:
    bpy.ops.import_scene.fbx(filepath=FBX)

# Static pet: keep only meshes, so imported cameras/lights/empties don't end up in the GLB
for obj in list(bpy.data.objects):
    if obj.type != "MESH":
        bpy.data.objects.remove(obj, do_unlink=True)

meshes = [o for o in bpy.data.objects if o.type == "MESH"]
if not meshes:
    raise SystemExit("no mesh found in FBX")
print(f"[mesh] {len(meshes)} mesh objects")

# The join operator merges UV layers by name; unify first so every part keeps
# its UVs on TEXCOORD_0 (localised layer names would otherwise split them).
for o in meshes:
    for uv in o.data.uv_layers:
        if uv.name != "UVMap":
            uv.name = "UVMap"
    for mat in o.data.materials:
        if mat and mat.use_nodes:
            for n in mat.node_tree.nodes:
                if n.type == "UVMAP":
                    n.uv_map = "UVMap"

active = max(meshes, key=lambda o: len(o.data.vertices))
bpy.ops.object.select_all(action="DESELECT")
for o in meshes:
    o.select_set(True)
bpy.context.view_layer.objects.active = active
bpy.ops.object.join()
model = bpy.context.view_layer.objects.active
model.name = "Lilith"
total_polys = len(model.data.polygons)
print(f"[mesh] joined: verts={len(model.data.vertices)} polys={total_polys} "
      f"materials={len(model.data.materials)}")

# Material tuning: the pet renderer ignores metalness, but a black character
# with metallic=1 renders as a silhouette in some glTF viewers.
for mat in model.data.materials:
    if not mat or not mat.use_nodes:
        continue
    for n in mat.node_tree.nodes:
        if n.type == "BSDF_PRINCIPLED":
            n.inputs["Metallic"].default_value = 0.0
            if TEXTURE:
                for img_node in [x for x in mat.node_tree.nodes if x.type == "TEX_IMAGE"]:
                    if img_node.image is None:
                        img_node.image = bpy.data.images.load(TEXTURE, check_existing=True)
                    elif os.path.abspath(bpy.path.abspath(img_node.image.filepath)) != os.path.abspath(TEXTURE):
                        img_node.image.filepath = TEXTURE
                        img_node.image.reload()

# Downscale the source atlas: it is 8K while the pet is only ~500 px tall, so
# 4K keeps the detail and cuts both download size and GPU memory roughly 4x.
# Resized copies go to a temp dir so the artist's source folder stays untouched.
for img in list(bpy.data.images):
    if img.users == 0:
        bpy.data.images.remove(img)
tmp_dir = tempfile.mkdtemp(prefix="lilith-glb-")
seen = set()
for img in list(bpy.data.images):
    if img.size[0] == 0:
        continue
    path = os.path.abspath(bpy.path.abspath(img.filepath)) if img.filepath else img.name
    if path in seen or max(img.size) <= TEX_MAX:
        continue
    seen.add(path)
    w = TEX_MAX
    h = max(1, round(img.size[1] * TEX_MAX / img.size[0]))
    img.scale(w, h)
    base = os.path.splitext(os.path.basename(img.filepath or img.name))[0] or "texture"
    resized = os.path.join(tmp_dir, base + f"_{w}.jpg")
    img.filepath_raw = resized
    img.file_format = "JPEG"
    img.save()
    # Packed GLB images keep their original bytes even after scale(); replace the
    # datablock with a fresh copy of the resized file so the exporter embeds it.
    new_img = bpy.data.images.load(resized)
    new_img.pack()
    for mat in bpy.data.materials:
        if not mat or not mat.node_tree:
            continue
        for node in mat.node_tree.nodes:
            if node.type == "TEX_IMAGE" and node.image is img:
                node.image = new_img
    bpy.data.images.remove(img)
    print(f"[tex] {os.path.basename(resized)} {w}x{h} {os.path.getsize(resized)/1e6:.2f} MB")

# Decimate to the same budget as the original model so the window stays light.
ratio = min(1.0, TARGET_POLYS / max(total_polys, 1))
if ratio < 1.0:
    mod = model.modifiers.new("Decimate", "DECIMATE")
    mod.ratio = ratio
    mod.use_collapse_triangulate = True
    bpy.context.view_layer.objects.active = model
    bpy.ops.object.modifier_apply(modifier=mod.name)
print(f"[decimate] ratio={ratio:.3f} -> verts={len(model.data.vertices)} "
      f"polys={len(model.data.polygons)}")

if TARGET_HEIGHT > 0:
    bpy.context.view_layer.update()
    height = model.dimensions.z
    if height <= 0:
        raise SystemExit("cannot fit height: model has no Z extent")
    s = TARGET_HEIGHT / height
    model.scale = tuple(v * s for v in model.scale)
    bpy.context.view_layer.objects.active = model
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bpy.context.view_layer.update()
    print(f"[scale] z={height:.4f} -> {model.dimensions.z:.4f} (x{s:.4f})")

os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
kwargs = dict(
    filepath=OUT,
    export_format="GLB",
    export_apply=True,
    export_yup=True,
    export_animations=False,
    export_skins=False,
    export_morph=False,
    export_cameras=False,
    export_lights=False,
    export_extras=False,
    export_image_format="AUTO",
    export_materials="EXPORT",
    use_selection=True,
)
props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
kwargs = {k: v for k, v in kwargs.items() if k in props}
bpy.ops.object.select_all(action="DESELECT")
model.select_set(True)
bpy.context.view_layer.objects.active = model
bpy.ops.export_scene.gltf(**kwargs)
print(f"[export] {OUT} {os.path.getsize(OUT)/1e6:.2f} MB")
shutil.rmtree(tmp_dir, ignore_errors=True)
print(f"[done] {time.time()-t0:.1f}s")
