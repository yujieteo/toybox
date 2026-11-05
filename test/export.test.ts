// Unit tests for the MP4 export helpers and the daemon import. The full export needs Chrome,
// the engine build and ffmpeg, so it is covered by the manual runs in the task evidence, not here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { srt, encoderConfig } from '../web/export.js';
import { srt as coreSrt } from '../core/scene.ts';
import type { Scene } from '../web/types.ts';
import { view } from './helpers.ts';

// A scene that has only captions: the SRT reads nothing else.
const withCaptions = (captions: Scene['captions']): Scene => view<Scene>({ captions });

function tests1(): void {
test('the export .srt is in time order and writes raised and lowered text as plain text', () => {
  const scene = withCaptions([{ start: 5, end: 7, text: 'B ^{raised} and _{low}.' }, { start: 1, end: 3, text: 'A' }]);
  assert.equal(srt(scene), '1\n00:00:01,000 --> 00:00:03,000\nA\n\n2\n00:00:05,000 --> 00:00:07,000\nB raised and low.\n');
  assert.equal(srt(scene), coreSrt(scene));
});

test('the export .srt rounds milliseconds at the hour, minute and second boundaries', () => {
  assert.equal(srt(withCaptions([{ start: 1.2345, end: 2.0004, text: 'x' }])), '1\n00:00:01,235 --> 00:00:02,000\nx\n');
  assert.equal(srt(withCaptions([{ start: 59.9996, end: 61, text: 'x' }])), '1\n00:01:00,000 --> 00:01:01,000\nx\n');
  assert.equal(srt(withCaptions([])), '');
});

test('encoderConfig picks the AVC level from the coded area and the frame rate', () => {
  assert.deepEqual(encoderConfig(1920, 1080, 30), { codec: 'avc1.640028', level: '4.0', bitrate: 6220800 });
  assert.deepEqual(encoderConfig(1080, 1920, 30), { codec: 'avc1.640028', level: '4.0', bitrate: 6220800 });
  assert.deepEqual(encoderConfig(1280, 720, 30), { codec: 'avc1.640028', level: '4.0', bitrate: 6e6 });
  assert.equal(encoderConfig(1920, 1080, 60).level, '4.2');
  assert.equal(encoderConfig(2560, 1440, 30).level, '5.0');
  assert.equal(encoderConfig(2560, 1440, 60).level, '5.0');
  assert.equal(encoderConfig(3840, 2160, 30).level, '5.1');
  assert.equal(encoderConfig(3840, 2160, 60).level, '5.2');
});

test('encoderConfig keeps at least 6 Mbit/s for 1080p30 and caps the bitrate at 40 Mbit/s', () => {
  assert.ok(encoderConfig(1920, 1080, 30).bitrate >= 6e6);
  assert.ok(encoderConfig(640, 360, 30).bitrate >= 6e6);
  assert.equal(encoderConfig(3840, 2160, 60).bitrate, 40e6);
});

test('encoderConfig refuses a size or frame rate that the browser cannot encode', () => {
  assert.throws(() => encoderConfig(7680, 4320, 30), /cannot encode 7680x4320/);
  assert.throws(() => encoderConfig(1920, 1080, 0), /frame rate 0/);
  assert.throws(() => encoderConfig(1920, 1080, 61), /frame rate 61/);
  assert.throws(() => encoderConfig(1920.5, 1080, 30), /whole number/);
  assert.throws(() => encoderConfig(8, 8, 30), /whole number/);
});

test('the export module loads in Node, so the daemon can share encoderConfig', async () => {
  const m = await import('../web/export.js');
  assert.equal(typeof m.exportVideo, 'function');
  assert.equal(typeof m.srt, 'function');
  assert.equal(typeof m.encoderConfig, 'function');
});
}
tests1();
