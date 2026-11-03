// JSON.parse and Response.json() give unknown, not any, so each reader must check the data
// (the same change as ts-reset).
interface JSON {
  parse(text: string, reviver?: (this: unknown, key: string, value: unknown) => unknown): unknown;
}
interface Body {
  json(): Promise<unknown>;
}
