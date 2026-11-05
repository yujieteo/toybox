#include <assert.h>
#include <emscripten.h>
#include "scene.h"
int main(void) {
  char *a[] = {"toybox", 0};
  assert(a[0] != 0);
  assert(a[1] == 0);
  goose_init(1, a);
  return 0;
}
