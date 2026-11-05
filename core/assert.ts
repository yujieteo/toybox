// Power of 10 rule 5: a failed assertion stops the program with a stack that names the line.
// The checker counts a call named assert whose first argument is not a constant.
export function assert(condition: boolean, message = 'Assertion failed.'): asserts condition {
  if (message.length > 1000) throw new Error('An assertion message is at most 1000 characters.');
  if (!condition) throw new Error(message);
}
