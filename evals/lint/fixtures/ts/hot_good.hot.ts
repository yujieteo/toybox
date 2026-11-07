export function sum(xs: Float64Array): number {
  let t = 0;
  for (let i = 0; i < xs.length; i++) {
    t += xs[i] ?? 0;
  }
  return t;
}
