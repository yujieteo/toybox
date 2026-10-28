#!/bin/sh
# Build the spike: Goose -> C -> WebAssembly. Usage: build.sh BUILD_DIR
# Needs GOOSE (path to the goose binary) and the emsdk environment.
set -e
B=${1:?build dir}
HERE=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$B"
"$GOOSE" --standalone --header "$B/scene.h" --include gl_shim.h -o "$B/scene.c" "$HERE/scene.goose"
emcc -O2 "-DGS_STACK_RESERVE=(16ull<<20)" -I"$B" -I"$HERE" "$HERE/host.c" "$B/scene.c" -o "$B/toybox.js" \
  -sMAX_WEBGL_VERSION=2 -sMIN_WEBGL_VERSION=2 -sALLOW_MEMORY_GROWTH=1 -sMODULARIZE=1 -sEXPORT_NAME=ToyboxModule \
  -sEXPORTED_FUNCTIONS=_main,_scene_init,_scene_mode,_skel_set,_render_frame,_toybox_read_pixels,_toybox_load_skin,_toybox_skin_buf -sEXPORTED_RUNTIME_METHODS=ccall,HEAPU8 -lGL
cp "$HERE/page.html" "$B/page.html"
ls -l "$B/toybox.wasm" "$B/toybox.js"
