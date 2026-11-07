export function fact(n: number): number {
  if (n < 2) {
    return 1;
  }
  return n * fact(n - 1);
}
