// Power of 10 rule 5: a failed assertion stops the program with a stack that names the line.
// The checker counts a call named assert whose first argument is not a constant.
export function assert(condition: boolean): asserts condition {
  if (!condition) throw new Error('Assertion failed.');
}
