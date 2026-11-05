#include <assert.h>
#include <emscripten.h>
#include "vid.h"
/* __attribute__((used)) is what EMSCRIPTEN_KEEPALIVE expands to; the pinned Power of 10 checker's C parser
   cannot read that macro before a declaration. */
__attribute__((used)) void vid_init(void) {
  char *a[] = {"vid", 0};
  assert(a[0] != 0);
  assert(a[1] == 0);
  goose_init(1, a);
}
