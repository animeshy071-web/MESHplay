# MESHplay — boot film: the 3D wordmark rises from the wave ocean, ring flare,
# theme pulse. 4 seconds @ 24fps, H.264. Rendered headlessly:
#
#   blender.exe -b --python scripts/blender/boot_film.py -- <out.mp4>

import bpy
import math
import sys

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
out = argv[0] if argv else 'boot.mp4'
FRAMES = 96
FPS = 24

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
for eng in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE', 'CYCLES'):
    try:
        scene.render.engine = eng
        break
    except TypeError:
        continue


# ---------- wave floor (reduced) ----------
def wave_modifier(obj, name, direction, height, wavelength, cycles, offset):
    mod = obj.modifiers.new(name, 'WAVE')
    mod.use_x = direction in ('x', 'both')
    mod.use_y = direction in ('y', 'both')
    mod.height = height
    mod.width = wavelength
    mod.speed = wavelength * cycles / FRAMES
    mod.time_offset = offset


def ribbon_mat():
    mat = bpy.data.materials.new('Ribbon')
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    em = nt.nodes.new('ShaderNodeEmission')
    tex = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = (0.04, 0.01, 0.13, 1.0)
    ramp.color_ramp.elements[1].color = (0.9, 0.75, 1.0, 1.0)
    nt.links.new(tex.outputs['Object'], sep.inputs[0])
    nt.links.new(sep.outputs['Z'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], em.inputs['Color'])
    em.inputs['Strength'].default_value = 2.4
    nt.links.new(em.outputs['Emission'], out.inputs['Surface'])
    return mat


for i, (y, z, size, height, offset) in enumerate([
    (0.0, -0.4, 9.0, 0.5, 0.0),
    (-3.2, -1.2, 7.0, 0.38, 9.0),
    (3.2, -2.0, 8.0, 0.3, 17.0),
]):
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=140, y_subdivisions=20, size=size, location=(0, y, z))
    obj = bpy.context.active_object
    obj.data.materials.append(ribbon_mat())
    wave_modifier(obj, 'Flow', 'x', height, 7.0, 4, offset)

# dust
dust = bpy.data.materials.new('Dust')
dust.use_nodes = True
dnt = dust.node_tree
dnt.nodes.clear()
dout = dnt.nodes.new('ShaderNodeOutputMaterial')
dem = dnt.nodes.new('ShaderNodeEmission')
dem.inputs['Color'].default_value = (0.85, 0.7, 1.0, 1.0)
dem.inputs['Strength'].default_value = 3.0
dnt.links.new(dem.outputs['Emission'], dout.inputs['Surface'])

import random
random.seed(11)
for i in range(110):
    bpy.ops.mesh.primitive_ico_sphere_add(
        subdivisions=1, radius=random.uniform(0.005, 0.02),
        location=(random.uniform(-14, 14), random.uniform(-8, 6), random.uniform(-1, 6)),
    )
    bpy.context.active_object.data.materials.append(dust)

# ---------- the wordmark ----------
fonts_dir = bpy.utils.system_resource('DATAFILES')
curve = bpy.data.curves.new(type='FONT', name='Logo')
curve.body = 'MESHplay'
curve.extrude = 0.07
curve.bevel_depth = 0.013
curve.align_x = 'CENTER'
curve.align_y = 'CENTER'
curve.size = 1.5
logo = bpy.data.objects.new('Logo', curve)
bpy.context.collection.objects.link(logo)
logo.rotation_euler = (math.radians(90), 0, 0)
logo.location = (0, 0, 0.6)

mat = bpy.data.materials.new('Brand')
mat.use_nodes = True
bsdf = mat.node_tree.nodes['Principled BSDF']
bsdf.inputs['Base Color'].default_value = (0.3, 0.14, 0.7, 1.0)
bsdf.inputs['Metallic'].default_value = 0.85
bsdf.inputs['Roughness'].default_value = 0.25
bsdf.inputs['Emission Color'].default_value = (0.5, 0.25, 1.0, 1.0)
bsdf.inputs['Emission Strength'].default_value = 0.6
logo.data.materials.append(mat)

# rise from the ocean: z -4 -> 0.6, slight tilt settle, frames 1..40 ease-out
logo.keyframe_insert(data_path='location', frame=1)
logo.location.z = 0.6
logo.keyframe_insert(data_path='location', frame=1)
logo.location.z = -4.0
logo.keyframe_insert(data_path='location', frame=1)
logo.location.z = 0.6
logo.keyframe_insert(data_path='location', frame=40)
logo.rotation_euler.x = math.radians(78)
logo.keyframe_insert(data_path='rotation_euler', frame=1)
logo.rotation_euler.x = math.radians(90)
logo.keyframe_insert(data_path='rotation_euler', frame=40)

# ring flare: torus scales out and fades, frames 36..70
bpy.ops.mesh.primitive_torus_add(major_radius=1.4, minor_radius=0.018, location=(0, 0, 0.6))
ring = bpy.context.active_object
ring.rotation_euler = (math.radians(90), 0, 0)
ring_mat = bpy.data.materials.new('Ring')
ring_mat.use_nodes = True
rnt = ring_mat.node_tree
rnt.nodes.clear()
rout = rnt.nodes.new('ShaderNodeOutputMaterial')
rem = rnt.nodes.new('ShaderNodeEmission')
rem.inputs['Color'].default_value = (0.75, 0.5, 1.0, 1.0)
rem.inputs['Strength'].default_value = 6.0
rnt.links.new(rem.outputs['Emission'], rout.inputs['Surface'])
ring.data.materials.append(ring_mat)
ring.scale = (0.2, 0.2, 0.2)
ring.keyframe_insert(data_path='scale', frame=36)
ring.scale = (2.6, 2.6, 2.6)
ring.keyframe_insert(data_path='scale', frame=70)
ring.hide_viewport = True
ring.hide_render = True
ring.keyframe_insert(data_path='hide_render', frame=35)
ring.hide_render = False
ring.keyframe_insert(data_path='hide_render', frame=36)
ring.hide_render = True
ring.keyframe_insert(data_path='hide_render', frame=70)

# ---------- camera & lights ----------
cam_data = bpy.data.cameras.new('Camera')
cam_data.lens = 58
cam = bpy.data.objects.new('Camera', cam_data)
bpy.context.collection.objects.link(cam)
cam.location = (0, -5.2, 1.4)
cam.rotation_euler = (math.radians(84), 0, 0)
scene.camera = cam

key = bpy.data.lights.new('Key', 'AREA')
key.energy = 1000
key.size = 4
key_obj = bpy.data.objects.new('Key', key)
bpy.context.collection.objects.link(key_obj)
key_obj.location = (-2.4, -3.4, 2.8)
key_obj.rotation_euler = (math.radians(55), 0, math.radians(-30))

rim = bpy.data.lights.new('Rim', 'AREA')
rim.energy = 2600
rim.color = (0.55, 0.28, 1.0)
rim.size = 3.5
rim_obj = bpy.data.objects.new('Rim', rim)
bpy.context.collection.objects.link(rim_obj)
rim_obj.location = (2.8, 2.0, -1.0)
rim_obj.rotation_euler = (math.radians(-115), 0, math.radians(-135))

world = bpy.data.worlds.new('World')
scene.world = world
world.use_nodes = True
wbg = world.node_tree.nodes['Background']
wbg.inputs[0].default_value = (0.012, 0.005, 0.03, 1.0)
wbg.inputs[1].default_value = 1.0

# ---------- compositor bloom ----------
scene.use_nodes = True
cnt = scene.node_tree
cnt.nodes.clear()
rl = cnt.nodes.new('CompositorNodeRLayers')
glare = cnt.nodes.new('CompositorNodeGlare')
glare.glare_type = 'FOG_GLOW'
glare.quality = 'MEDIUM'
glare.threshold = 0.85
glare.size = 8
composite = cnt.nodes.new('CompositorNodeComposite')
cnt.links.new(rl.outputs['Image'], glare.inputs['Image'])
cnt.links.new(glare.outputs['Image'], composite.inputs['Image'])

# ---------- output ----------
scene.render.image_settings.file_format = 'FFMPEG'
scene.render.ffmpeg.format = 'MPEG4'
scene.render.ffmpeg.codec = 'H264'
scene.render.ffmpeg.constant_rate_factor = 'HIGH'
scene.render.fps = FPS
scene.frame_start = 1
scene.frame_end = FRAMES
scene.render.resolution_x = 1920
scene.render.resolution_y = 1080
scene.render.filepath = out

bpy.ops.render.render(animation=True)
print('BOOT_OK ->', out)
