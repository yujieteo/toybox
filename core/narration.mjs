// Narration: 1 sentence = 1 beat. The voice (core/voice.mjs) sets the length of each beat.
// Format: docs/scene-format.md. A timed item can follow a word of the narration with a cue:
// cue [i, "word", offset] gives the time of "word" in sentence i (plus offset seconds).
import { voiceId } from './voice.mjs';

export const LEAD = 0.5, GAP = 0.45, TAIL = 0.8;   // seconds of silence before, between and after sentences
export const STAND_IN = 0.066;                      // seconds for each character of a sentence that has no voice yet

// Each sentence gets start and end. Returns the length of the narration in seconds.
export function timeline(narration) {
  let t = LEAD - GAP;
  for (const n of narration) {
    n.start = r3(t + GAP); n.end = r3(t + GAP + n.seconds);
    t = n.end + (n.pause || 0);
  }
  return narration.length ? r3(t + TAIL) : 0;
}
const r3 = (v) => Math.round(v * 1000) / 1000;

// The time of word in sentence i: the start of the sentence plus the part of its length that comes
// before the word. Without a word it is the start of the sentence. Throws on a bad cue.
export function cueTime(narration, cue) {
  const [i, word = '', offset = 0] = cue;
  if (typeof word !== 'string' || !Number.isFinite(offset)) throw new Error(`Cue ${JSON.stringify(cue)} is not [sentence, "word", offset]: word must be a text and offset a number of seconds.`);
  const n = narration?.[i];
  if (!Number.isInteger(i) || !n) throw new Error(`Cue sentence ${i} does not exist. The narration has ${narration?.length || 0} sentences.`);
  const k = n.text.indexOf(word);
  if (k < 0) throw new Error(`"${word}" is not in sentence ${i}: "${n.text}".`);
  return r3(n.start + ((n.end - n.start) * k) / n.text.length + offset);
}

// Every item that can have a cue (start) and an endCue (end).
export function cued(scene) {
  return [...(scene.tracks || []).flatMap((tr) => tr.keys || []), ...(scene.camera || []), ...(scene.lighting || []),
    ...(scene.motions || []), ...(scene.chapters || []), ...(scene.callouts || [])].filter((x) => x && (x.cue || x.endCue));
}

// After a change of the narration or its voice: new beats, the cued times, and 1 caption for each sentence.
export function retime(scene) {
  const narration = scene.narration || [];
  for (const n of narration) if (!n.voice) n.seconds = r3(STAND_IN * n.text.length);
  const length = timeline(narration);
  for (const x of cued(scene)) {
    if (x.cue) x['t' in x ? 't' : 'start'] = cueTime(narration, x.cue);
    if (x.endCue) x.end = cueTime(narration, x.endCue);
  }
  for (const tr of scene.tracks || []) tr.keys.sort((a, b) => a.t - b.t);
  for (const k of ['camera', 'lighting', 'motions']) if (scene[k]) scene[k].sort((a, b) => a.t - b.t);
  if (narration.length) scene.captions = narration.map((n, i) => ({ start: n.start, end: narration[i + 1]?.start ?? length, text: n.text }));
  return length;
}

// Narration, facts and cue errors for validate: [{ code, path, message }].
export function narrationErrors(scene) {
  const errs = [], E = (code, path, message) => errs.push({ code, path, message });
  const facts = scene.facts ?? [], narration = scene.narration ?? [];
  if (!Array.isArray(facts)) E('schema', 'facts', 'facts must be an array.');
  else {
    const ids = new Set();
    facts.forEach((f, i) => {
      if (!f || typeof f.id !== 'string' || typeof f.text !== 'string' || !f.text) return E('schema', `facts[${i}]`, 'A fact needs an id and a text.');
      if (ids.has(f.id)) E('duplicate_id', `facts[${i}]`, `Duplicate fact id ${f.id}.`);
      ids.add(f.id);
      if (typeof f.source !== 'string' || !f.source.trim()) E('fact_no_source', `facts[${i}]`, `Fact ${f.id} has no source. Use only facts that you read in a source. Leave out a fact that has no source.`);
    });
  }
  if (!Array.isArray(narration)) { E('schema', 'narration', 'narration must be an array.'); return errs; }
  const known = new Set(Array.isArray(facts) ? facts.map((f) => f?.id) : []);
  let silent = 0;
  narration.forEach((n, i) => {
    const p = `narration[${i}]`;
    if (!n || typeof n.text !== 'string' || !n.text.trim()) return E('schema', p, 'A sentence needs a text.');
    if (n.pause !== undefined && !(typeof n.pause === 'number' && n.pause >= 0)) E('schema', `${p}.pause`, 'pause must be 0 or more seconds.');
    if (!(typeof n.seconds === 'number' && n.seconds > 0)) E('schema', `${p}.seconds`, 'seconds must be more than 0. Call narrate.');
    for (const f of n.facts || []) if (!known.has(f)) E('unknown_fact', `${p}.facts`, `Fact ${f} does not exist. Add it with add_fact and its source.`);
    if (!n.voice) silent++;
    else if (n.voice !== `voice/${voiceId(n.text)}.wav`) E('narration_timing', `${p}.voice`, `The voice file of sentence ${i} is for another text. Call make_voice.`);
  });
  if (errs.length) return errs;
  const want = structuredClone(narration);
  timeline(want);
  narration.forEach((n, i) => {
    if (n.start !== want[i].start || n.end !== want[i].end) E('narration_timing', `narration[${i}]`, `Sentence ${i} has start ${n.start} and end ${n.end}, but its voice gives ${want[i].start} and ${want[i].end}. Call narrate or make_voice.`);
  });
  for (const x of cued(scene)) for (const [key, cue] of [['cue', x.cue], ['endCue', x.endCue]]) {
    if (!cue) continue;
    if (!Array.isArray(cue)) { E('bad_cue', key, 'A cue is [sentence, "word", offset].'); continue; }
    try {
      const t = cueTime(narration, cue), field = key === 'endCue' ? 'end' : 't' in x ? 't' : 'start';
      if (Math.abs(x[field] - t) > 1e-3) E('narration_timing', key, `The cue ${JSON.stringify(cue)} gives ${t} s, but ${field} is ${x[field]}. Call narrate or make_voice.`);
    } catch (e) { E('bad_cue', key, e.message); }
  }
  if (silent) E('voice_missing', 'narration', `${silent} of ${narration.length} sentences have no voice yet. Their times are stand-in times. Call make_voice.`);
  return errs;
}
