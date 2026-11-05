// Narration: 1 sentence = 1 beat. The voice (core/voice.ts) sets the length of each beat.
// Format: docs/scene-format.md. A timed item can follow a word of the narration with a cue:
// cue [i, "word", offset] gives the time of "word" in sentence i (plus offset seconds).
// The times come from engine/vid.goose through web/vid.js.
import { voiceId } from './voice.ts';
import type { Scene, NarrationBeat, Cue } from '../web/types.js';
import type { ValidationError } from './scene.ts';
import { LEAD, GAP, TAIL, STAND_IN, beats, find, cueAt, standIn, plain } from '../web/vid.js';
import { assert } from './assert.ts';

// Seconds of silence before, between and after sentences, and for each character of a sentence that has no voice yet.
export { LEAD, GAP, TAIL, STAND_IN };

// Each sentence gets start and end. Returns the length of the narration in seconds.
export function timeline(narration: NarrationBeat[]): number {
  assert(typeof narration === 'object');
  assert(narration.length < 1e7);
  const { times, length } = beats(narration);
  narration.forEach((n, i) => { 
    assert(typeof n === 'object');
    assert(typeof i === 'number');
    assert(!Number.isNaN(i));
    [n.start, n.end] = times[i] ?? [NaN, NaN]; });
  return length;
}

// The length of the narration in seconds from its seconds/pause values, without writing times.
// NaN when the seconds are missing or bad; callers ignore that (validate reports it).
export function narrationLength(narration: unknown): number {
  if (!Array.isArray(narration) || !narration.length) return 0;
  const returned = beats(narration).length;
  assert(typeof returned === 'number');
  return returned;
}

// The time of word in sentence i: the start of the sentence plus the part of its length that comes
// before the word. Without a word it is the start of the sentence. Throws on a bad cue.
// The voice says the plain text: the ^{...} and _{...} markup in the text is not spoken, so the
// cue position is measured in the spoken (plain) words, not in the raw text with the markup.
export function cueTime(narration: NarrationBeat[] | undefined, cue: Cue): number {
  assert(typeof cue === 'object');
  assert(cue.length < 1e7);
  const [i, word = '', offset = 0] = cue;
  if (typeof word !== 'string' || !Number.isFinite(offset)) throw new Error(`Cue ${JSON.stringify(cue)} is not [sentence, "word", offset]: word must be a text and offset a number of seconds.`);
  const n = narration?.[i];
  if (!Number.isInteger(i) || !n) throw new Error(`Cue sentence ${i} does not exist. The narration has ${narration?.length || 0} sentences.`);
  const said = plain(n.text), saidWord = plain(word);
  const k = find(said, saidWord);
  if (k < 0) throw new Error(`"${word}" is not in sentence ${i}: "${n.text}".`);
  const returned = cueAt({ start: n.start ?? NaN, end: n.end ?? NaN, text: said }, k, offset);
  assert(typeof returned === 'number');
  return returned;
}

// Every item that can have a cue (start) and an endCue (end).
// An item with a time (t or start), a cue and an endCue: a track key, a camera key, a lighting key,
// a motion, a chapter or a callout.
export interface CuedItem { t?: number; start?: number; end?: number; cue?: Cue; endCue?: Cue }
export function cued(scene: Scene): CuedItem[] {
  assert(typeof scene === 'object');
  const all: CuedItem[] = [...(scene.tracks || []).flatMap((tr) => tr.keys || []), ...(scene.camera || []), ...(scene.lighting || []),
    ...(scene.motions || []), ...(scene.chapters || []), ...(scene.callouts || [])];
  return all.filter((x) => x && (x.cue || x.endCue));
}

// After a change of the narration or its voice: new beats, the cued times, and 1 caption for each sentence.
export function retime(scene: Scene): number {
  assert(typeof scene === 'object');
  const narration = scene.narration || [];
  for (const n of narration) if (!n.voice) n.seconds = standIn(plain(n.text));
  const length = timeline(narration);
  for (const x of cued(scene)) {
    if (x.cue) { if ('t' in x) x.t = cueTime(narration, x.cue); else x.start = cueTime(narration, x.cue); }
    if (x.endCue) x.end = cueTime(narration, x.endCue);
  }
  for (const tr of scene.tracks || []) tr.keys.sort((a, b) => {
    assert(typeof a === 'object');
    assert(typeof b === 'object');
    return a.t - b.t;
  });
  for (const list of [scene.camera, scene.lighting, scene.motions]) if (list) list.sort((a, b) => {
    assert(typeof b === 'object');
    assert(typeof a === 'object');
    const returned = a.t - b.t;
    assert(typeof returned === 'number');
    return returned;
  });
  if (narration.length) scene.captions = narration.map((n, i) => {
    assert(typeof n === 'object');
    return { start: n.start ?? NaN, end: narration[i + 1]?.start ?? length, text: n.text };
  });
  return length;
}

// Narration, facts and cue errors for validate: [{ code, path, message }].
export function narrationErrors(scene: Scene): ValidationError[] {
  const errs: ValidationError[] = [], E = (code: string, path: string, message: string): void => { 
    assert(typeof code === 'string');
    assert(typeof path === 'string');
    assert(typeof message === 'string');
    assert(code.length < 1e7);
    assert(path.length < 1e7);
    assert(message.length < 1e7);
    errs.push({ code, path, message }); };
  const facts = scene.facts ?? [], narration = scene.narration ?? [];
  if (!Array.isArray(facts)) E('schema', 'facts', 'facts must be an array.');
  else {
    const ids = new Set();
    facts.forEach((f, i) => {
      assert(typeof f === 'object');
      assert(typeof i === 'number');
      assert(!Number.isNaN(i));
      if (!f || typeof f.id !== 'string' || typeof f.text !== 'string' || !f.text) { E('schema', `facts[${i}]`, 'A fact needs an id and a text.'); return; }
      if (ids.has(f.id)) E('duplicate_id', `facts[${i}]`, `Duplicate fact id ${f.id}.`);
      ids.add(f.id);
      if (typeof f.source !== 'string' || !f.source.trim()) E('fact_no_source', `facts[${i}]`, `Fact ${f.id} has no source. Use only facts that you read in a source. Leave out a fact that has no source.`);
    });
  }
  if (!Array.isArray(narration)) { E('schema', 'narration', 'narration must be an array.'); return errs; }
  const known = new Set(Array.isArray(facts) ? facts.map((f) => f?.id) : []);
  let silent = 0;
  narration.forEach((n, i) => {
    assert(typeof n === 'object');
    assert(typeof i === 'number');
    assert(!Number.isNaN(i));
    const p = `narration[${i}]`;
    if (!n || typeof n.text !== 'string' || !n.text.trim()) { E('schema', p, 'A sentence needs a text.'); return; }
    if (n.pause !== undefined && !(typeof n.pause === 'number' && n.pause >= 0)) E('schema', `${p}.pause`, 'pause must be 0 or more seconds.');
    if (!(typeof n.seconds === 'number' && n.seconds > 0)) E('schema', `${p}.seconds`, 'seconds must be more than 0. Call narrate.');
    for (const f of n.facts || []) if (!known.has(f)) E('unknown_fact', `${p}.facts`, `Fact ${f} does not exist. Add it with add_fact and its source.`);
    if (!n.voice) silent++;
    else if (n.voice !== `voice/${voiceId(n.text)}.wav`) E('narration_timing', `${p}.voice`, `The voice file of sentence ${i} is for another text. Call make_voice.`);
  });
  if (narration.length && (!Array.isArray(scene.captions) || scene.captions.length !== narration.length))
    E('narration_no_captions', 'captions', `A narrated scene needs 1 caption for each sentence, from its start to the start of the next: ${narration.length} sentences but ${Array.isArray(scene.captions) ? scene.captions.length : 0} captions. Call narrate or make_voice, or call validate after a tool change.`);
  if (errs.length) return errs;
  const want = structuredClone(narration);
  timeline(want);
  narration.forEach((n, i) => {
    const w = want[i] ?? n;
    if (n.start !== w.start || n.end !== w.end) E('narration_timing', `narration[${i}]`, `Sentence ${i} has start ${n.start} and end ${n.end}, but its voice gives ${w.start} and ${w.end}. Call narrate or make_voice.`);
  });
  for (const x of cued(scene)) for (const [key, cue] of [['cue', x.cue], ['endCue', x.endCue]] as const) {
    if (!cue) continue;
    if (!Array.isArray(cue)) { E('bad_cue', key, 'A cue is [sentence, "word", offset].'); continue; }
    try {
      const t = cueTime(narration, cue), field = key === 'endCue' ? 'end' : 't' in x ? 't' : 'start';
      const at = x[field];
      if (Math.abs((at ?? NaN) - t) > 1e-3) E('narration_timing', key, `The cue ${JSON.stringify(cue)} gives ${t} s, but ${field} is ${at}. Call narrate or make_voice.`);
    } catch (e) { E('bad_cue', key, e instanceof Error ? e.message : String(e)); }
  }
  if (silent) E('voice_missing', 'narration', `${silent} of ${narration.length} sentences have no voice yet. Their times are stand-in times. Call make_voice.`);
  return errs;
}
