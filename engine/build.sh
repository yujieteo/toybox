#!/bin/sh
# Build the engine: Goose -> C -> WebAssembly. Usage: build.sh BUILD_DIR
# Needs the emsdk environment. With GOOSE (path to the goose binary) set, it first
# regenerates the committed engine/scene.c, scene.h, vid.c and vid.h from the .goose files.
# It also builds the committed web/vid.wasm (the motion words, marks and narration times).
set -e
B=${1:?build dir}
HERE=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$B"
if [ -n "$GOOSE" ]; then
  ( cd "$HERE" && "$GOOSE" --standalone --header scene.h --include gl_shim.h -o scene.c scene.goose )
  ( cd "$HERE" && "$GOOSE" --standalone --header vid.h -o vid.c vid.goose )
fi
EXPORTS=_main,_scene_init,_scene_resize,_scene_lod,_skel_set,_scene_reset,_obj_add,_trk_begin,_key_add,_cam_add,_light_add,_set_backdrop,_set_cutaway,_ground_map,_cam_user,_obj_bone,_obj_pose,_render_frame,_project,_proj_x,_proj_y,_obj_wx,_obj_wy,_obj_wz,_obj_visible,_cam_x,_cam_y,_cam_z,_toybox_read_pixels,_toybox_load_skin,_toybox_up_buf,_toybox_up_size,_toybox_mesh_upload,_toybox_ground_upload
# Goose reserves data stack address space with mmap. WebAssembly cannot, so the reserve is set small.
emcc -O2 "-DGS_STACK_RESERVE=(16ull<<20)" -I"$HERE" "$HERE/host.c" "$HERE/scene.c" -o "$B/toybox.js" \
  -sMAX_WEBGL_VERSION=2 -sMIN_WEBGL_VERSION=2 -sALLOW_MEMORY_GROWTH=1 -sMODULARIZE=1 -sEXPORT_NAME=ToyboxModule \
  -sEXPORTED_FUNCTIONS=$EXPORTS -sEXPORTED_RUNTIME_METHODS=HEAPU8,HEAPF32,HEAPU32 -lGL
VID=_vid_init,_clear,_put,_out,_out_len,_moves,_seed_of,_pose,_marks,_plain,_lead,_gap,_tail,_stand_in,_stand_in_seconds,_timeline,_find,_cue_time
emcc -O2 "-DGS_STACK_RESERVE=(1ull<<20)" -I"$HERE" "$HERE/vid_host.c" "$HERE/vid.c" -o "$HERE/../web/vid.wasm" \
  --no-entry -sSTANDALONE_WASM -sALLOW_MEMORY_GROWTH=1 -sEXPORTED_FUNCTIONS=$VID
ls -l "$B/toybox.wasm" "$B/toybox.js" "$HERE/../web/vid.wasm"
