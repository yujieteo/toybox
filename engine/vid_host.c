#include <emscripten.h>
#include "vid.h"
EMSCRIPTEN_KEEPALIVE void vid_init(void) { char *a[] = {"vid", 0}; goose_init(1, a); }
