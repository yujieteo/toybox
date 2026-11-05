// Typed helpers for the tests: they turn untyped data (command results, JSON files, child output) into types at one place.
import assert from 'node:assert/strict';
import { isRecord } from '../web/dom.js';

export interface ErrInfo { code: string; message: string; path?: string }

// Returns v, or throws when it is undefined or null. It replaces a `!` assertion.
export function must<T>(v: T | undefined | null, what = 'value'): T {
  if (v === undefined || v === null) throw new Error(`missing ${what}`);
  return v;
}

// Reads outside data (a command result, a JSON file) as the type T. The JSON round trip is the one typed boundary.
export function view<T>(v: unknown, check?: (x: unknown) => x is T): T {
  const copy: unknown = JSON.parse(JSON.stringify(v));
  assert.ok(check === undefined || check(copy));
  return copy as T; // allow-unsafe: a test reads data that it made or a fixture, the assertions check it
}

// The result of a successful command, read as T. It fails the test when the command failed.
export function okResult<T>(r: unknown, check?: (x: unknown) => x is T): T {
  assert.ok(isRecord(r) && r.ok === true, JSON.stringify(r));
  return view<T>(r.result, check);
}

// True when the command succeeded.
export function isOk(r: unknown): boolean {
  return isRecord(r) && r.ok === true;
}

// The errors of a failed command. It fails the test when the command succeeded.
export function errorsOf(r: unknown): ErrInfo[] {
  assert.ok(isRecord(r) && r.ok === false, `the command did not fail: ${JSON.stringify(r)}`);
  const errors = view<ErrInfo[] | undefined>(r.errors);
  assert.ok(Array.isArray(errors) && errors.length > 0, `the command has no errors: ${JSON.stringify(r)}`);
  return errors;
}

export function firstError(r: unknown): ErrInfo {
  return must(errorsOf(r)[0], 'first error');
}
