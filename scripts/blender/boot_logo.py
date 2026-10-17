# MESHplay brand renderer — builds a 3D logo scene and renders it headlessly.
#
#   blender.exe -b --python scripts/blender/boot_logo.py -- <output.png> [text]
#
# Designed as the starter scene: open the rendered result in Blender's GUI,
# tweak, re-render. Everything here is intentionally simple to edit.

import bpy
import math
import sys

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
out = argv[0] if argv else 'render.png'
text_body = argv[1] if len(argv) > 1 else 'MESHplay'

# ---------- clean slate ----------
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# ---------- 3D wordmark ----------
curve = bpy.data.curves.new(type='FONT', name='Logo')
curve.body = text_body
curve.extrude = 0.055
curve.bevel_depth = 0.011
curve.bevel_resolution = 4
curve.align_x = 'CENTER'
curve.align_y = 'CENTER'
curve.size = 1.7
logo = bpy.data.objects.new('Logo', curve)
bpy.context.collection.objects.link(logo)
logo.rotation_euler = (math.radians(90), 0, 0)  # stand upright facing camera

mat = bpy.data.materials.new('Brand')
mat.use_nodes = True
bsdf = mat.node_tree.nodes['Principled BSDF']
bsdf.inputs['Base Color'].default_value = (0.32, 0.15, 0.72, 1.0)
bsdf.inputs['Metallic'].default_value = 0.85
bsdf.inputs['Roughness'].default_value = 0.28
bsdf.inputs['Emission Color'].default_value = (0.45, 0.22, 0.95, 1.0)
bsdf.inputs['Emission Strength'].default_value = 0.35
logo.data.materials.append(mat)

# ---------- camera ----------
cam_data = bpy.data.cameras.new('Camera')
cam_data.lens = 62
cam = bpy.data.objects.new('Camera', cam_data)
bpy.context.collection.objects.link(cam)
cam.location = (0, -4.4, 0.25)
cam.rotation_euler = (math.radians(90), 0, 0)
scene.camera = cam

# ---------- lighting: key + violet rim ----------
key = bpy.data.lights.new('Key', 'AREA')
key.energy = 900
key.size = 4
key_obj = bpy.data.objects.new('Key', key)
bpy.context.collection.objects.link(key_obj)
key_obj.location = (-2.2, -3.2, 2.6)
key_obj.rotation_euler = (math.radians(55), 0, math.radians(-30))

rim = bpy.data.lights.new('Rim', 'AREA')
rim.energy = 2200
rim.color = (0.55, 0.28, 1.0)
rim.size = 3.5
rim_obj = bpy.data.objects.new('Rim', rim)
bpy.context.collection.objects.link(rim_obj)
rim_obj.location = (2.8, 2.2, -1.2)
rim_obj.rotation_euler = (math.radians(-115), 0, math.radians(-135))

# ---------- deep-space world ----------
world = bpy.data.worlds.new('World')
scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes['Background']
bg.inputs[0].default_value = (0.012, 0.006, 0.030, 1.0)
bg.inputs[1].default_value = 1.0

# ---------- render settings ----------
scene.render.engine = 'CYCLES'
scene.cycles.samples = 96
scene.cycles.use_denoising = True
scene.render.resolution_x = 1920
scene.render.resolution_y = 1080
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = out

# GPU if the machine has one, CPU otherwise
try:
    prefs = bpy.context.preferences.addons['cycles'].preferences
    for dev_type in ('OPTIX', 'CUDA'):
        try:
            prefs.compute_device_type = dev_type
            prefs.get_devices()
            if any(d.type == dev_type for d in prefs.devices):
                for d in prefs.devices:
                    d.use = True
                scene.cycles.device = 'GPU'
                print(f'GPU: {dev_type}')
                break
        except Exception:
            continue
except Exception as exc:
    print('GPU setup skipped:', exc)

bpy.ops.render.render(write_still=True)
print('RENDER_OK ->', out)
