import bpy
import json
import sys

out = {
    "blender_version": bpy.app.version_string,
    "objects": [],
    "actions": [],
    "materials": [],
    "images": [],
    "scene_fps": bpy.context.scene.render.fps,
    "scene_frame_range": [bpy.context.scene.frame_start, bpy.context.scene.frame_end],
}

for obj in bpy.data.objects:
    info = {
        "name": obj.name,
        "type": obj.type,
        "parent": obj.parent.name if obj.parent else None,
        "location": [round(v, 4) for v in obj.location],
        "rotation_euler": [round(v, 4) for v in obj.rotation_euler],
        "scale": [round(v, 4) for v in obj.scale],
        "dimensions": [round(v, 4) for v in obj.dimensions],
    }
    if obj.type == "MESH":
        info["verts"] = len(obj.data.vertices)
        info["polys"] = len(obj.data.polygons)
        info["materials"] = [m.name for m in obj.data.materials if m]
        info["has_armature_modifier"] = any(m.type == "ARMATURE" for m in obj.modifiers)
        info["shape_keys"] = bool(obj.data.shape_keys)
        info["vertex_groups"] = len(obj.vertex_groups)
    if obj.type == "ARMATURE":
        info["bones"] = len(obj.data.bones)
        info["bone_names"] = [b.name for b in obj.data.bones][:80]
    if obj.animation_data:
        info["active_action"] = obj.animation_data.action.name if obj.animation_data.action else None
        info["nla_tracks"] = [t.name for t in obj.animation_data.nla_tracks]
    out["objects"].append(info)

for act in bpy.data.actions:
    fmin, fmax = act.frame_range
    out["actions"].append({
        "name": act.name,
        "frame_range": [round(fmin, 1), round(fmax, 1)],
        "num_fcurves": len(act.fcurves),
        "users": act.users,
    })

for mat in bpy.data.materials:
    minfo = {"name": mat.name, "use_nodes": mat.use_nodes, "blend_method": mat.blend_method}
    if mat.use_nodes:
        minfo["nodes"] = [n.type for n in mat.node_tree.nodes]
    out["materials"].append(minfo)

for img in bpy.data.images:
    out["images"].append({
        "name": img.name,
        "size": list(img.size),
        "packed": bool(img.packed_file),
        "filepath": img.filepath,
    })

print("=== JSON START ===")
print(json.dumps(out, indent=1, ensure_ascii=False))
print("=== JSON END ===")
