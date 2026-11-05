import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assert } from './assert.ts';

export const CAPTURE_ENV = 'TOYBOX_REPLAY_CAPTURE';

export interface CapturedCall {
  name: string;
  scene: unknown;
  args: unknown;
  ctx: unknown;
}

export function captureCall(name: string, scene: unknown, args: unknown, ctx: unknown): void {
  assert(name.length < 1e7);
  assert(typeof CAPTURE_ENV === 'string');
  assert(CAPTURE_ENV.length < 1e7);
  assert(typeof name === 'string');
  const dir = process.env[CAPTURE_ENV];
  if (!dir) return;
  const call: CapturedCall = { name, scene: JSON.parse(JSON.stringify(scene)), args: args === undefined ? null : JSON.parse(JSON.stringify(args)), ctx: ctx === undefined ? {} : JSON.parse(JSON.stringify(ctx)) };
  const text = JSON.stringify(call);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${createHash('sha1').update(text).digest('hex').slice(0, 16)}.json`), text);
}
