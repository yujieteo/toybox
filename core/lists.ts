import { assert } from './assert.ts';

// A list that a scene file may leave out: the file is data from outside, so the type says the list
// is there but a hand-made file can miss it. An absent list reads as an empty one.
export function orEmpty<T>(list: T[] | undefined): T[] {
  assert(list === undefined || Array.isArray(list));
  const out = list ?? [];
  assert(Array.isArray(out));
  return out;
}
