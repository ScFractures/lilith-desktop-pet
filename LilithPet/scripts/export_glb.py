"""Export Lilith.blend to GLB for the desktop pet app.

Run:
  Blender -b ~/Desktop/Lilith.blend --python export_glb.py -- <fbm_dir> <out_dir> [--render]
"""
import bpy
import bmesh
import os
import sys
import math
import time
from mathutils import Vector

argv = sys.argv
args = argv[argv.index("--") + 1:] if "--" in argv else []
FBM_DIR = args[0]
OUT_DIR = args[1]
DO_RENDER = "--render" in args
TARGET_POLYS = 260000

t0 = time.time()

# ---------------------------------------------------------------- textures
remapped, missing = 0, []
for img in bpy.data.images:
    base = os.path.basename(img.filepath)
    if not base:
        continue
    candidate = os.path.join(FBM_DIR, base)
    if os.path.exists(candidate):
        img.filepath = candidate
        img.reload()
        remapped += 1
    else:
        missing.append(base)
print(f"[tex] remapped={remapped} missing={len(missing)}")
for m in missing[:5]:
    print(f"[tex]   missing: {m}")

# ---------------------------------------------------------------- cleanup
scene = bpy.context.scene
for obj in list(bpy.data.objects):
    if obj.type in {"CAMERA", "LIGHT", "EMPTY"}:
        bpy.data.objects.remove(obj, do_unlink=True)

meshes = [o for o in bpy.data.objects if o.type == "MESH"]
print(f"[mesh] {len(meshes)} mesh objects")

# Unify UV layer names before joining. The join merges UV layers by name, and
# some parts have localized names ("属性" vs "Attribute") which would split the
# data across TEXCOORD_0/TEXCOORD_1 and make those parts sample empty UVs.
renamed = 0
for o in meshes:
    for uv in o.data.uv_layers:
        if uv.name != "UVMap":
            uv.name = "UVMap"
            renamed += 1
    for mat in o.data.materials:
        if mat and mat.use_nodes:
            for n in mat.node_tree.nodes:
                if n.type == "UVMAP":
                    n.uv_map = "UVMap"
print(f"[uv] unified uv layers to 'UVMap' (renamed {renamed})")

# select all meshes; make active the one with most verts
active = max(meshes, key=lambda o: len(o.data.vertices))
bpy.ops.object.select_all(action="DESELECT")
for o in meshes:
    o.select_set(True)
bpy.context.view_layer.objects.active = active
bpy.ops.object.join()
model = bpy.context.view_layer.objects.active
model.name = "Lilith"
total_polys = len(model.data.polygons)
total_verts = len(model.data.vertices)
print(f"[mesh] joined: verts={total_verts} polys={total_polys} materials={len(model.data.materials)}")

# world-space bounds
mw = model.matrix_world
coords = [mw @ Vector(c) for c in model.bound_box]
mn = Vector((min(c.x for c in coords), min(c.y for c in coords), min(c.z for c in coords)))
mx = Vector((max(c.x for c in coords), max(c.y for c in coords), max(c.z for c in coords)))
print(f"[bbox] min={tuple(round(v,4) for v in mn)} max={tuple(round(v,4) for v in mx)} "
      f"size={tuple(round(v,4) for v in (mx-mn))}")

# ---------------------------------------------------------------- decimate
ratio = min(1.0, TARGET_POLYS / max(total_polys, 1))
mod = model.modifiers.new("Decimate", "DECIMATE")
mod.ratio = ratio
mod.use_collapse_triangulate = True
bpy.context.view_layer.objects.active = model
bpy.ops.object.modifier_apply(modifier=mod.name)
print(f"[decimate] ratio={ratio:.3f} -> verts={len(model.data.vertices)} polys={len(model.data.polygons)}")

# ---------------------------------------------------------------- materials check
for i, mat in enumerate(model.data.materials):
    if mat is None:
        continue
    img = None
    if mat.use_nodes:
        for n in mat.node_tree.nodes:
            if n.type == "TEX_IMAGE" and n.image:
                img = n.image
                break
    if img is None:
        print(f"[mat] {i}:{mat.name} NO IMAGE")
    elif img.size[0] == 0:
        print(f"[mat] {i}:{mat.name} IMAGE NOT LOADED {img.name}")

# ---------------------------------------------------------------- export
def export_glb(path, draco):
    kwargs = dict(
        filepath=path,
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
        export_draco_mesh_compression_enable=draco,
        export_draco_mesh_compression_level=6,
        export_draco_position_quantization=14,
        export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=12,
        use_selection=True,
    )
    props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    kwargs = {k: v for k, v in kwargs.items() if k in props}
    bpy.ops.object.select_all(action="DESELECT")
    model.select_set(True)
    bpy.context.view_layer.objects.active = model
    bpy.ops.export_scene.gltf(**kwargs)
    size = os.path.getsize(path) / 1e6
    print(f"[export] {path} {size:.2f} MB draco={draco}")

os.makedirs(OUT_DIR, exist_ok=True)
export_glb(os.path.join(OUT_DIR, "lilith.glb"), draco=False)

# ---------------------------------------------------------------- preview render
if DO_RENDER:
    scn = scene
    scn.render.engine = "CYCLES"
    scn.cycles.device = "CPU"
    scn.cycles.samples = 24
    scn.cycles.use_denoising = True
    scn.render.resolution_x = 512
    scn.render.resolution_y = 640
    scn.render.film_transparent = True
    scn.view_settings.view_transform = "Standard"

    size = mx - mn
    center = (mx + mn) / 2

    cam_data = bpy.data.cameras.new("PCam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = max(size.x, size.z) * 1.25
    cam = bpy.data.objects.new("PCam", cam_data)
    scn.collection.objects.link(cam)
    scn.camera = cam

    sun_data = bpy.data.lights.new("Sun", "SUN")
    sun_data.energy = 3.0
    sun = bpy.data.objects.new("Sun", sun_data)
    scn.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(50), 0, math.radians(30))

    fill_data = bpy.data.lights.new("Fill", "SUN")
    fill_data.energy = 1.2
    fill = bpy.data.objects.new("Fill", fill_data)
    scn.collection.objects.link(fill)
    fill.rotation_euler = (math.radians(70), 0, math.radians(-140))

    dist = max(size) * 3
    for tag, dy in (("front", -1), ("back", 1)):
        cam.location = (center.x, center.y + dy * dist, center.z)
        cam.rotation_euler = (math.radians(90), 0, 0 if dy < 0 else math.radians(180))
        scn.render.filepath = os.path.join(OUT_DIR, f"preview_{tag}.png")
        bpy.ops.render.render(write_still=True)
        print(f"[render] {scn.render.filepath}")

print(f"[done] {time.time()-t0:.1f}s")
