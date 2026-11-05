// The two modules that the architecture figure imports are not in this repo: the renderer provides
// them (docs/figures/architecture.ts). These types cover only what the figure uses.
declare module '*/emil.js' {
  export const gray: { readonly 900: string; readonly 1100: string; readonly 1200: string };
  export const hue: { readonly blue: { readonly 3: string; readonly 7: string } };
  export const weight: { readonly name: number };
  export function card(radius: number): { fill: string; stroke: string };
  export function emilTheme(figure: object): void;
  export function useEmil(figure: object, layout: object, mode: string): {
    r: { card: number };
    line: { thin: number; normal: number };
    text: { label: number; small: number };
  };
}
declare module '*/cs.js' {
  export function box(parent: object, x: number, y: number, w: number, h: number, options: object): void;
  export function route(parent: object, path: readonly (string | readonly number[])[], options: object): void;
}
