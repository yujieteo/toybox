// The MRT demo page: a static showcase of one narrated Toybox scene, "How to board an MRT".
// The page uses the same viewer and controls as web/viewer.html and adds a "How to board" step
// list from the scene chapters, a sources list and a loading state. It needs no server, no
// account and no daemon: host web/, assets/ and the engine files together. Build the scene with
// `node evals/mrt.mjs`.
import { createViewer } from './viewer.js';
import { bindControls } from './controls.js';
import { upgradeScene } from './format.js';
import { plain } from './vid.js';

// The demo scene, relative to this page.
export const SCENE_URL = 'scenes/mrt/mrt.toybox.json';

// ---------------------------------------------------------------- page logic (pure, so the test
// can check it): the "How to board" steps and the active step.

// One step for each chapter, in the order of the scene. A step holds the narration sentences that
// start inside the chapter's time range. The page shows the number (index + 1), the title and the
// sentences; a click plays the scene from `start`.
export function chapterSteps(scene) {
  const captions = scene.captions || [];
  const chapters = scene.chapters || [];
  const duration = scene.duration || 0;
  return chapters.map((chapter, index) => {
    const start = chapter.start ?? 0;
    const end = chapter.end ?? chapters[index + 1]?.start ?? duration;
    const sentences = captions
      .filter((caption) => caption.start >= start - 1e-6 && caption.start < end - 1e-6)
      .map((caption) => plain(caption.text));
    return { index, title: chapter.title ? plain(chapter.title) : `Step ${index + 1}`, start, end, sentences };
  });
}

// The step that is active at time t, or -1 before the first chapter starts. A time after a
// chapter's end keeps that chapter active until the next one starts.
export function activeStep(steps, t) {
  let active = -1;
  for (let i = 0; i < steps.length; i++) if (t >= steps[i].start - 1e-6) active = i;
  return active;
}

// "1:05" for a step label.
export function clock(seconds) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ---------------------------------------------------------------- the page

const $ = (id) => document.getElementById(id);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// The step list: a button for each step, so a click plays from the chapter start, the tab key
// moves between steps, and the current step carries aria-current.
function renderSteps(steps, playFrom) {
  const list = $('steps');
  const buttons = [], nows = [];
  list.replaceChildren(...steps.map((step, index) => {
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
    button.addEventListener('click', () => playFrom(step.start));
    const item = document.createElement('li');
    item.append(button);
    buttons.push(button); nows.push(now);
    return item;
  }));
  return { buttons, nows };
}

// The sources: one link for each URL that the facts and the chapters name, with the URL shown
// once (facts first). Links to other sites open a new tab with rel="noopener".
function renderSources(scene) {
  const list = $('sources');
  const seen = new Set(), items = [];
  const link = (source) => {
    if (!source) return null;
    let url;
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
  for (const fact of scene.facts || []) {
    const item = el('li', null, fact.text ? `${plain(fact.text)} ` : '');
    const a = link(fact.source);
    if (a) item.append(a);
    items.push(item);
  }
  for (const chapter of scene.chapters || []) {
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
  for (const line of scene.credits || []) {
    const urls = (String(line).match(/https?:\/\/\S+/g) || []).map((url) => {
      try { return new URL(url).href; } catch { return url; }
    });
    if (urls.length > 1 && urls.every((url) => seen.has(url))) continue;
    credits.insertBefore(el('li', null, line), build);
  }
}

async function start() {
  const status = $('status'), error = $('error'), stage = $('stage');
  const canvas = $('canvas'), overlay = $('overlay');
  const fail = (cause) => {
    status.hidden = true;
    stage.setAttribute('aria-busy', 'false');
    stage.closest('.viewer')?.classList.add('viewer-dead');
    error.hidden = false;
    error.textContent = `The demo scene cannot show. ${cause instanceof Error ? cause.message : String(cause)}`;
  };
  try {
    stage.setAttribute('aria-busy', 'true');
    const v = await createViewer({ canvas, overlay, engineUrl: 'engine/toybox.js', assetsUrl: 'assets' });
    globalThis.toybox = v;   // a handle for screenshots and QA

    const sceneUrl = new URL(SCENE_URL, location.href);
    const response = await fetch(sceneUrl);
    if (!response.ok) throw new Error(`The scene did not load (HTTP ${response.status} from ${sceneUrl.pathname}). Build it with node evals/mrt.mjs, then host web/, assets/ and the engine files together.`);
    const scene = upgradeScene(await response.json());
    if (!Array.isArray(scene.objects)) throw new Error('This is not a Toybox scene file.');

    // The voice files of the narration sit next to the scene file.
    v.voiceUrl = (file) => new URL(file, sceneUrl).href;
    document.title = `${scene.title || 'How to board an MRT'} · Toybox demo`;
    if (scene.title) $('title').textContent = scene.title;
    $('seek').max = scene.duration || 60;

    const fit = () => {
      const r = stage.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2);
      const w = Math.round(r.width * d), h = Math.round(r.height * d);
      canvas.width = w; canvas.height = h; v.resize(w, h);
      if (v.scene) v.draw(v.t);
    };
    new ResizeObserver(fit).observe(stage);
    fit();

    bindControls(v, { canvas, ui: {
      play: $('play'), seek: $('seek'), time: $('time'), story: $('story'), save: $('save'),
      panel: $('panel'), pname: $('pname'), psrc: $('psrc'),
    } });

    // controls.js owns v.onframe and v.onchange. Keep them and add the active step.
    const controlsFrame = v.onframe, controlsChange = v.onchange;
    const steps = chapterSteps(scene);
    const { buttons, nows } = renderSteps(steps, (time) => { v.seek(time); v.play(); });
    let active = -2;
    const mark = () => {
      const i = activeStep(steps, v.t);
      if (i === active) return;
      active = i;
      buttons.forEach((button, k) => {
        if (k === i) button.setAttribute('aria-current', 'true');
        else button.removeAttribute('aria-current');
      });
      nows.forEach((now, k) => { now.hidden = k !== i; });
    };
    v.onframe = (t) => { controlsFrame(t); mark(); };
    v.onchange = (why) => { controlsChange(why); mark(); };

    renderSources(scene);
    $('steps-section').hidden = steps.length === 0;
    $('sources-section').hidden = false;
    v.load(scene, false);
    status.hidden = true;
    stage.setAttribute('aria-busy', 'false');

    // ?t=<seconds> opens the scene paused at that time (for screenshots and QA).
    // ?play=1 starts the scene instead.
    const query = new URLSearchParams(location.search);
    const at = query.get('t');
    const seekTo = at !== null && at.trim() !== '' ? Number(at) : null;
    v.pause();
    if (seekTo !== null && Number.isFinite(seekTo)) v.seek(seekTo);
    if (query.get('play') === '1') v.play();
    mark();
  } catch (cause) { fail(cause); }
}

// The page is a document; the test imports the pure functions above from Node, where there is none.
if (typeof document !== 'undefined') start();
