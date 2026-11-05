// The states of an export job (app/export.sm.md): it waits for /export/start, then it streams
// video data. Only a streaming export has the files and the scene.
import type fs from 'node:fs';
import type { Scene } from '../web/types.js';
import { assert } from '../core/assert.ts';

export const EXPORT_PHASES = ['waiting', 'streaming'] as const;
assert(EXPORT_PHASES.includes('waiting'));
assert(EXPORT_PHASES.includes('streaming'));

export interface Streaming {
  phase: 'streaming';
  base: string; scene: Scene; fps: number; h264: fs.WriteStream; chain: Promise<void>;
  writeError: string | null; keepArtifacts: boolean;
}
export type ExportState = { phase: 'waiting' } | Streaming;

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const phasesMatch: Same<ExportState['phase'], (typeof EXPORT_PHASES)[number]> = true;
assert(phasesMatch);
