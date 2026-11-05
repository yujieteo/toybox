// The MRT demo page: a static showcase of one narrated Toybox scene, "How to board an MRT".
// The page uses the same viewer and controls as web/viewer.html and adds a "How to board" step
// list from the scene chapters, a sources list and a loading state. It needs no server, no
// account and no daemon: run `bun scripts/build-web.ts`, then host dist/web/, assets/ and the
// engine files together. Build the scene with `bun evals/mrt.ts`.
import { createViewer, type Viewer } from './viewer.js';
import type { Scene } from './types.js';
import { byId, htmlById, messageOf, orEmpty } from './dom.js';
import { bindControls } from './controls.js';
import { upgradeScene } from './format.js';
import { plain } from './vid.js';
import { assert } from './assert.ts';

// The demo scene, relative to this page.
export const SCENE_URL = 'scenes/mrt/mrt.toybox.json';

// ---------------------------------------------------------------- page logic (pure, so the test
// can check it): the "How to board" steps and the active step.

// One step for each chapter, in the order of the scene. A step holds the narration sentences that
// start inside the chapter's time range. The page shows the number (index + 1), the title and the
// sentences; a click plays the scene from `start`.
export interface Step { index: number; title: string; start: number; end: number; sentences: string[] }
export function chapterSteps(scene: Pick<Scene, 'captions' | 'chapters' | 'duration'>): Step[] {
  assert(typeof scene === 'object');
  const captions = orEmpty(scene.captions);
  const chapters = orEmpty(scene.chapters);
  const duration = scene.duration || 0;
  return chapters.map((chapter, index) => {
    assert(typeof chapters === 'object');
    assert(typeof duration === 'number');
    assert(typeof chapter === 'object');
    assert(typeof index === 'number');
    assert(!Number.isNaN(index));
    const start = Number.isFinite(chapter.start) ? chapter.start : 0;
    const end = Number.isFinite(chapter.end) ? chapter.end : chapters[index + 1]?.start ?? duration;
    const sentences = captions
      .filter((caption) => {
        assert(typeof caption === 'object');
        return caption.start >= start - 1e-6 && caption.start < end - 1e-6;
      })
      .map((caption) => {
        assert(typeof caption === 'object');
        const returned = plain(caption.text);
        assert(typeof returned === 'string');
        assert(returned.length < 1e7);
        return returned;
      });
    return { index, title: chapter.title ? plain(chapter.title) : `Step ${index + 1}`, start, end, sentences };
  });
}

// The step that is active at time t, or -1 before the first chapter starts. A time after a
// chapter's end keeps that chapter active until the next one starts.
export function activeStep(steps: Pick<Step, 'start'>[], t: number): number {
  assert(typeof steps === 'object');
  assert(typeof t === 'number');
  assert(steps.length < 1e7);
  assert(!Number.isNaN(t));
  let active = -1;
  steps.forEach((step, i) => { 
    assert(typeof step === 'object');
    assert(typeof i === 'number');
    assert(!Number.isNaN(i));
    if (t >= step.start - 1e-6) active = i; });
  return active;
}

// "1:05" for a step label.
export function clock(seconds: number): string {
  assert(typeof seconds === 'number');
  assert(!Number.isNaN(seconds));
  const s = Math.max(0, Math.round(seconds));
  const returned = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  assert(typeof returned === 'string');
  assert(returned.length < 1e7);
  return returned;
}

// ---------------------------------------------------------------- the page

declare global { var toybox: Viewer | undefined }   // a handle for screenshots and QA
const $ = htmlById;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string | null, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// The step list: a button for each step, so a click plays from the chapter start, the tab key
// moves between steps, and the current step carries aria-current.
function renderSteps(steps: Step[], playFrom: (time: number) => void): { buttons: HTMLButtonElement[]; nows: HTMLElement[] } {
  assert(typeof steps === 'object');
  assert(typeof playFrom === 'function');
  assert(steps.length < 1e7);
  const list = $('steps');
  const buttons: HTMLButtonElement[] = [], nows: HTMLElement[] = [];
  list.replaceChildren(...steps.map((step, index) => {
    assert(typeof step === 'object');
    assert(typeof index === 'number');
    assert(!Number.isNaN(index));
    const button = el('button', 'step');
    button.type = 'button';
    button.setAttribute('aria-label', `Step ${index + 1}: ${step.title}. Play from ${clock(step.start)}.`);
    const text = el('span');
    text.append(el('span', 'step-title', step.title));
    for (const sentence of step.sentences) text.append(el('span', 'step-text', sentence));
    const now = el('span', 'step-now', 'Now');
    now.hidden = true;
    now.setAttribute('aria-hidden', 'true');
    button.append(el('span', 'step-num', String(index + 1)), text, now);
    button.addEventListener('click', () => { playFrom(step.start); });
    const item = document.createElement('li');
    item.append(button);
    buttons.push(button); nows.push(now);
    return item;
  }));
  return { buttons, nows };
}

// The sources: one link for each URL that the facts and the chapters name, with the URL shown
// once (facts first). Links to other sites open a new tab with rel="noopener".
function renderSources(scene: Scene): void {
  assert(typeof scene === 'object');
  const list = $('sources');
  const seen = new Set<string>(), items: HTMLElement[] = [];
  const link = (source: string | undefined): HTMLAnchorElement | null => {
    if (!source) return null;
    let url: URL;
    try { url = new URL(source); } catch { return null; }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (seen.has(url.href)) return null;
    seen.add(url.href);
    const a = document.createElement('a');
    a.href = url.href;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = url.href;
    return a;
  };
  for (const fact of scene.facts ?? []) {
    const item = el('li', null, fact.text ? `${plain(fact.text)} ` : '');
    const a = link(fact.source);
    if (a) item.append(a);
    items.push(item);
  }
  for (const chapter of orEmpty(scene.chapters)) {
    const a = link(chapter.source);
    if (!a) continue;
    const item = el('li', null, `Chapter: ${chapter.title ? plain(chapter.title) : chapter.id}. `);
    item.append(a);
    items.push(item);
  }
  if (!items.length) items.push(el('li', null, 'The scene file names no sources.'));
  list.replaceChildren(...items);
  // The credit lines of the scene file show above the build credit line. A line that only
  // repeats the source links above adds nothing, so the page skips it.
  const credits = $('credits'), build = credits.firstElementChild;
  for (const line of orEmpty(scene.credits)) {
    const urls = (line.match(/https?:\/\/\S+/g) ?? []).map((url) => {
      assert(typeof url === 'string');
      assert(url.length < 1e7);
      try { return new URL(url).href; } catch { return url; }
    });
    if (urls.length > 1 && urls.every((url) => {
      assert(typeof url === 'string');
      assert(url.length < 1e7);
      return seen.has(url);
    })) continue;
    credits.insertBefore(el('li', null, line), build);
  }
}

function fitStage(v: Viewer, stage: HTMLElement, canvas: HTMLCanvasElement): void {
  assert(typeof v === 'object');
  assert(typeof stage === 'object');
  assert(typeof canvas === 'object');
  const r = stage.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2);
  const w = Math.round(r.width * d), h = Math.round(r.height * d);
  canvas.width = w; canvas.height = h; v.resize(w, h);
  if (v.scene) v.draw(v.t);
}

// controls.js owns v.onframe and v.onchange. Keep them and add the active step. Returns the marker.
function bindSteps(v: Viewer, steps: Step[]): () => void {
  assert(typeof v === 'object');
  assert(typeof steps === 'object');
  assert(steps.length < 1e7);
  const controlsFrame = v.onframe, controlsChange = v.onchange;
  const { buttons, nows } = renderSteps(steps, (time) => { 
    assert(typeof time === 'number');
    assert(!Number.isNaN(time));
    v.seek(time); v.play(); });
  let active = -2;
  const mark = (): void => {
    const i = activeStep(steps, v.t);
    if (i === active) return;
    active = i;
    buttons.forEach((button, k) => {
      assert(typeof button === 'object');
      assert(typeof k === 'number');
      assert(!Number.isNaN(k));
      if (k === i) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
    });
    nows.forEach((now, k) => { 
      assert(typeof now === 'object');
      assert(typeof k === 'number');
      assert(!Number.isNaN(k));
      now.hidden = k !== i; });
  };
  v.onframe = (t) => { 
    assert(typeof t === 'number');
    assert(!Number.isNaN(t));
    controlsFrame?.(t); mark(); };
  v.onchange = (why) => { 
    assert(typeof why === 'string');
    assert(why.length < 1e7);
    controlsChange?.(why); mark(); };
  return mark;
}

// ?t=<seconds> opens the scene paused at that time (for screenshots and QA).
// ?play=1 starts the scene instead.
function openFromQuery(v: Viewer): void {
  assert(typeof v === 'object');
  const query = new URLSearchParams(location.search);
  const at = query.get('t');
  const seekTo = at !== null && at.trim() !== '' ? Number(at) : null;
  v.pause();
  if (seekTo !== null && Number.isFinite(seekTo)) v.seek(seekTo);
  if (query.get('play') === '1') v.play();
}

async function start(): Promise<void> {
  const status = $('status'), error = $('error'), stage = $('stage');
  const canvas = byId('canvas', HTMLCanvasElement), overlay = byId('overlay', HTMLCanvasElement);
  const seekBar = byId('seek', HTMLInputElement);
  const fail = (cause: unknown): void => {
    status.hidden = true;
    stage.setAttribute('aria-busy', 'false');
    stage.closest('.viewer')?.classList.add('viewer-dead');
    error.hidden = false;
    error.textContent = `The demo scene cannot show. ${messageOf(cause)}`;
  };
  try {
    stage.setAttribute('aria-busy', 'true');
    const v = await createViewer({ canvas, overlay, engineUrl: 'engine/toybox.js', assetsUrl: 'assets' });
    globalThis.toybox = v;

    const sceneUrl = new URL(SCENE_URL, location.href);
    const response = await fetch(sceneUrl);
    if (!response.ok) throw new Error(`The scene did not load (HTTP ${response.status} from ${sceneUrl.pathname}). Build it with bun evals/mrt.ts, run bun scripts/build-web.ts, then host dist/web/, assets/ and the engine files together.`);
    const scene = upgradeScene(await response.json());
    if (!Array.isArray(scene.objects)) throw new Error('This is not a Toybox scene file.');

    // The voice files of the narration sit next to the scene file.
    v.voiceUrl = (file: string) => {
      assert(typeof file === 'string');
      assert(file.length < 1e7);
      return new URL(file, sceneUrl).href;
    };
    document.title = `${scene.title || 'How to board an MRT'} · Toybox demo`;
    if (scene.title) $('title').textContent = scene.title;
    seekBar.max = String(scene.duration || 60);

    const fit = (): void => { fitStage(v, stage, canvas); };
    new ResizeObserver(fit).observe(stage);
    fit();

    bindControls(v, { canvas, ui: {
      play: $('play'), seek: seekBar, time: $('time'), story: $('story'), save: $('save'),
      panel: $('panel'), pname: $('pname'), psrc: $('psrc'),
    } });

    const steps = chapterSteps(scene);
    const mark = bindSteps(v, steps);

    renderSources(scene);
    $('steps-section').hidden = steps.length === 0;
    $('sources-section').hidden = false;
    v.load(scene, false);
    status.hidden = true;
    stage.setAttribute('aria-busy', 'false');

    openFromQuery(v);
    mark();
  } catch (cause) { fail(cause); }
}

// The page is a document; the test imports the pure functions above from Node, where there is none.
if (typeof document !== 'undefined') void start();
