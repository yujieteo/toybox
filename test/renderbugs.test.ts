// Regression tests for the render-timing fixes: duration recomputation, motion-word tails, the
// narration floor, marks in narration (voice id and cue times), negative caption times and the
// chapter caption of a narrated scene. See the findings in the timeline audit.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { newScene, validate, srt, motionEnd } from '../core/scene.ts';
import { runTool } from '../core/commands.ts';
import { cueTime, STAND_IN, timeline } from '../core/narration.ts';
import { voiceFile } from '../core/voice.ts';
import { plain } from '../web/vid.js';
import type { Scene, NarrationBeat } from '../web/types.ts';
import { must as need, okResult, firstError, isOk } from './helpers.ts';

const OUT = fileURLToPath(new URL('../evals/out', import.meta.url));
const codes = (s: Scene): string[] => validate(s).map((e) => e.code);
const run = (s: Scene, tool: string, args: unknown, ctx: object = {}) => runTool(s, tool, args, ctx);
// The result of a successful command.
const must = (r: unknown): unknown => okResult<unknown>(r);
const ceilMs = (v: number): number => Math.ceil(v * 1000 - 1e-6) / 1000;
const bare = (): Scene => {
  const s = newScene({});
  must(run(s, 'place', { model: 'car-sedan', at: [0, 0], id: 'car' }));
  must(run(s, 'set_camera', { t: 0, shot: 'wide', frame: ['car'] }));
  return s;
};

function tests1(): void {
test('duration is recomputed when the content gets shorter (make_voice after stand-in times)', () => {
  const s = newScene({});
  must(run(s, 'narrate', { sentences: ['A very long sentence with no voice file at all in the fixtures so it uses a long stand-in time.'] }));
  const standIn = s.duration;
  assert.ok(standIn > 4, String(standIn));
  must(run(s, 'narrate', { sentences: ['This is a zebra crossing.', 'White stripes mark it on the road.'] }, { sceneDir: OUT }));
  assert.ok(need(s.narration).every((n) => n.voice));
  assert.ok(s.duration < standIn, `${s.duration} < ${standIn}`);
  assert.equal(s.duration, need(s.captions.at(-1)).end);
  assert.ok(s.duration >= timeline(need(s.narration)) - 1e-9);
  assert.deepEqual(codes(s), []);
});

test('a duration that a scene file set longer than the content stays as a floor', () => {
  const s = newScene({ duration: 30 });
  must(run(s, 'place', { model: 'car-sedan', at: [0, 0], id: 'car' }));
  assert.equal(s.duration, 30);
  must(run(s, 'animate', { id: 'car', channel: 'yaw', keys: [{ t: 0, v: 0 }, { t: 10, v: 90 }] }));
  assert.equal(s.duration, 30);
  must(run(s, 'remove', { id: 'car' }));
  assert.equal(s.duration, 30);   // an explicit floor is not auto-derived, so it is kept
});

test('removing the only timed content recomputes an auto duration to 0', () => {
  const s = newScene({});
  must(run(s, 'place', { model: 'car-sedan', at: [0, 0], id: 'car' }));
  must(run(s, 'animate', { id: 'car', channel: 'yaw', keys: [{ t: 0, v: 0 }, { t: 30, v: 90 }] }));
  assert.equal(s.duration, 30);
  must(run(s, 'remove', { id: 'car' }));
  assert.equal(s.duration, 0);
});

test('duration is rounded up to the millisecond, so a successful command validates', () => {
  const s = bare();
  must(run(s, 'add_chapter', { id: 'c1', start: 0, end: 12.0004, title: 'One', caption: 'A taxi waits.', focus: ['car'], shot: 'wide' }));
  assert.equal(s.duration, 12.001);
  assert.ok(!codes(s).includes('duration_too_short'), JSON.stringify(validate(s)));
  const t = newScene({});
  must(run(t, 'place', { model: 'narrator', at: [0, 0], id: 'n' }));
  must(run(t, 'add_motion', { id: 'n', move: 'hop', t: 2.0004, d: 0.5 }));
  assert.equal(t.duration, ceilMs(motionEnd(need(need(t.motions)[0]))));
  assert.ok(!codes(t).includes('duration_too_short'), JSON.stringify(validate(t)));
});
}
tests1();

function tests2(): void {
test('a trailing motion word is covered by the scene duration', () => {
  const hop = newScene({});
  must(run(hop, 'place', { model: 'narrator', at: [0, 0], id: 'n' }));
  must(run(hop, 'add_motion', { id: 'n', move: 'hop', t: 2 }));
  assert.equal(hop.duration, 2.96);   // the landing bounce, not only t + d (2 + 0.5)
  assert.ok(!codes(hop).includes('duration_too_short'), JSON.stringify(validate(hop)));

  const pop = newScene({});
  must(run(pop, 'place', { model: 'narrator', at: [0, 0], id: 'n' }));
  must(run(pop, 'add_motion', { id: 'n', move: 'pop', t: 1 }));
  assert.equal(pop.duration, 1.5);    // the whole grow-from-nothing

  const longHop = newScene({});
  must(run(longHop, 'place', { model: 'narrator', at: [0, 0], id: 'n' }));
  must(run(longHop, 'add_motion', { id: 'n', move: 'hop', t: 4, d: 1 }));
  assert.equal(longHop.duration, 5.76);   // 4 + 1.6 * 1 + 0.16
});

test('a narrated scene can never be shorter than its voice, and needs one caption per sentence', () => {
  const s = newScene({});
  must(run(s, 'narrate', { sentences: ['This is a zebra crossing.', 'White stripes mark it on the road.'] }, { sceneDir: OUT }));
  assert.deepEqual(codes(s), []);
  const length = timeline(need(s.narration));
  s.captions = []; s.duration = 1;
  const c = codes(s);
  assert.ok(c.includes('duration_too_short'), JSON.stringify(c));
  assert.ok(c.includes('narration_no_captions'), JSON.stringify(c));
  s.duration = length;   // the voice fits now: only the missing captions are reported
  assert.ok(!codes(s).includes('duration_too_short'), JSON.stringify(validate(s)));
});

test('the voice speaks the plain text: the voice id and cues ignore the ^{} markup', () => {
  assert.equal(voiceFile('31^{st}'), voiceFile('31st'));
  assert.notEqual(voiceFile('31^{st}'), voiceFile('31^{th}'));
  const text = 'The 31^{st} of May is here.', said = plain(text);
  assert.equal(said, 'The 31st of May is here.');
  const n: NarrationBeat[] = [{ text, start: 0.5, end: 3.5 }];
  const k = said.indexOf('May');
  const want = Math.round((0.5 + ((3.5 - 0.5) * k) / said.length) * 1000) / 1000;
  assert.equal(cueTime(n, [0, 'May']), want);
  // the word itself may be written with its markup: it is found in the spoken text
  assert.equal(cueTime(n, [0, '31^{st}']), cueTime(n, [0, '31st']));
  // the stand-in time counts the spoken characters, not the markup
  const s = newScene({});
  must(run(s, 'narrate', { sentences: [text] }));
  assert.equal(need(need(s.narration)[0]).seconds, Math.round(STAND_IN * said.length * 1000) / 1000);
});
}
tests2();

function tests3(): void {
test('negative caption, chapter and callout times are refused and srt() never goes negative', () => {
  const s = bare();
  assert.equal(firstError(run(s, 'add_caption', { start: -2, end: 3, text: 'Hello there' })).code, 'schema');
  assert.equal(firstError(run(s, 'add_chapter', { id: 'c1', start: -1.5, end: 5, title: 'One', caption: 'A taxi waits.', focus: ['car'], shot: 'wide' })).code, 'schema');
  assert.equal(firstError(run(s, 'add_callout', { start: -1, end: 3, text: 'Taxi' })).code, 'schema');
  const narrated = newScene({});
  must(run(narrated, 'narrate', { sentences: ['This is a zebra crossing.'] }, { sceneDir: OUT }));
  // a cue with a negative offset makes a negative chapter start: refused
  assert.ok(!isOk(run(narrated, 'add_chapter', { id: 'c1', cue: [0, 'This', -2], end_cue: [0], title: 'One' })));
  // a bad scene file still writes a usable .srt: the timestamp is clamped at 0
  const bad = newScene({}); bad.captions = [{ start: -1.5, end: 3, text: 'Hello' }];
  assert.equal(srt(bad), '1\n00:00:00,000 --> 00:00:03,000\nHello\n');
});

test('add_chapter refuses a caption in a narrated scene instead of discarding it', () => {
  const s = newScene({});
  must(run(s, 'narrate', { sentences: ['This is a zebra crossing.'] }, { sceneDir: OUT }));
  const r = run(s, 'add_chapter', { id: 'c1', start: 0, end: 2, title: 'One', caption: 'A chapter caption' });
  assert.equal(isOk(r), false);
  assert.equal(firstError(r).code, 'narrated');
  assert.equal(s.chapters.length, 0);
});
}
tests3();
