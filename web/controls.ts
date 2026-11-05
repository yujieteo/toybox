// Pointer, touch and keyboard control of a viewer, plus the edit panel and the play bar.
import type { Viewer, Vec2 } from './viewer.js';
import { assert } from './assert.ts';

// The elements that the controls drive.
export interface ControlsUi {
  play: HTMLElement; seek: HTMLInputElement; time: HTMLElement; story: HTMLElement; save: HTMLElement;
  panel: HTMLElement; pname: HTMLElement; psrc: HTMLElement;
}
interface Drag { x: number; y: number; hit: string | null; moved: boolean; start: boolean; pan: boolean; snap?: boolean }

export function bindControls(v: Viewer, { canvas, ui }: { canvas: HTMLCanvasElement; ui: ControlsUi }): void {
  assert(typeof v === 'object'); assert(canvas.width >= 0); assert(canvas.height >= 0); assert(typeof ui === 'object');
  assert(typeof ui.play === 'object'); assert(typeof ui.seek === 'object'); assert(typeof ui.panel === 'object');
  assert(typeof ui.time === 'object'); assert(typeof ui.pname === 'object'); assert(typeof ui.psrc === 'object');
  const fmt = () => {
    assert(typeof v === 'object');
    const returned = `${v.t.toFixed(1)} / ${(v.scene ? v.scene.duration || 60 : 0).toFixed(1)} s`;
    assert(typeof returned === 'string');
    assert(returned.length < 1e7);
    return returned;
  };
  const sync = () => {
    assert(typeof v === 'object');
    assert(typeof fmt === 'function');
    ui.seek.value = String(v.t); ui.time.textContent = fmt();
    const play = v.playing; ui.play.textContent = play ? 'Pause' : 'Play'; ui.play.setAttribute('aria-label', play ? 'Pause' : 'Play');
    const o = v.scene && v.scene.objects.find(x => {
      assert(typeof v === 'object');
      assert(typeof x === 'object');
      return x.id === v.selected;
    });
    ui.panel.hidden = !o;
    if (o) {
      ui.pname.textContent = o.label || o.id;
      ui.psrc.textContent = (o.source ? 'Source: ' + o.source : '') + (o.estimated ? (o.source ? '. ' : '') + 'Estimated value.' : '');
    }
  };
  v.onframe = sync; v.onchange = sync;
  bindPointer(v, canvas);
  bindKeys(v, canvas);
  bindPanel(v, ui);
  sync();
}

function bindPointer(v: Viewer, canvas: HTMLCanvasElement): void {
  assert(typeof v === 'object');
  assert(typeof canvas === 'object');
  const px = (e: PointerEvent | MouseEvent): Vec2 => { 
    assert(typeof e === 'object');
    const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) * canvas.width / r.width, (e.clientY - r.top) * canvas.height / r.height]; };
  const pts = new Map<number, Vec2>(); let drag: Drag | null = null, pinch = 0;
  canvas.addEventListener('pointerdown', e => {
    assert(typeof canvas === 'object');
    assert(typeof pts === 'object');
    assert(typeof v === 'object');
    assert(typeof e === 'object');
    canvas.setPointerCapture(e.pointerId); canvas.focus();
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    const [a, b] = [...pts.values()];
    if (pts.size === 2 && a && b) { pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); if (drag && drag.snap) v.endDrag(); drag = null; return; }
    const [x, y] = px(e), hit = v.pick(x, y);
    drag = { x: e.clientX, y: e.clientY, hit, moved: false, start: !!hit && hit === v.selected, pan: e.shiftKey || e.button === 2 };
  });
  canvas.addEventListener('pointermove', e => {
    assert(typeof pts === 'object');
    assert(typeof v === 'object');
    assert(typeof px === 'function');
    assert(typeof e === 'object');
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      if (!a || !b) return;
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinch) v.zoomBy(pinch / d); pinch = d; return;
    }
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    drag.moved = true;
    if (drag.start) { const [x, y] = px(e), g = v.groundPoint(x, y); if (g) { if (!drag.snap) { drag.snap = true; v.beginDrag(); } v.moveSelectedTo(g[0], g[2]); } return; }
    if (drag.pan) v.panBy(dx, dy); else v.orbitBy(dx * 0.008, dy * 0.006);
    drag.x = e.clientX; drag.y = e.clientY;
  });
  const up = (e: PointerEvent): void => {
    assert(typeof pts === 'object');
    assert(typeof v === 'object');
    assert(typeof e === 'object');
    pts.delete(e.pointerId); if (pts.size < 2) pinch = 0;
    if (drag && !drag.moved) v.select(drag.hit);
    if (drag && drag.snap) v.endDrag();
    drag = null;
  };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('contextmenu', e => {
    assert(typeof e === 'object');
    e.preventDefault();
  });
  canvas.addEventListener('wheel', e => { 
    assert(typeof e === 'object');
    e.preventDefault(); v.zoomBy(Math.exp(e.deltaY * 0.001)); }, { passive: false });
}

function bindKeys(v: Viewer, canvas: HTMLCanvasElement): void {
  assert(typeof v === 'object');
  assert(typeof canvas === 'object');
  canvas.addEventListener('keydown', e => {
    assert(typeof v === 'object'); assert(typeof e === 'object');
    assert(e.key.length > 0); assert(canvas.width >= 0);
    const k = e.key;
    if (k === 'ArrowLeft') v.orbitBy(-0.1, 0); else if (k === 'ArrowRight') v.orbitBy(0.1, 0);
    else if (k === 'ArrowUp') v.orbitBy(0, 0.08); else if (k === 'ArrowDown') v.orbitBy(0, -0.08);
    else if (k === '+' || k === '=') v.zoomBy(0.85); else if (k === '-') v.zoomBy(1.18);
    else if (k === ' ') { v.playing ? v.pause() : v.play(); }
    else if (k === 'Escape') v.select(null);
    else if (k === 'Delete' || k === 'Backspace') v.edit('delete');
    else return;
    e.preventDefault();
  });
}

function bindPanel(v: Viewer, ui: ControlsUi): void {
  assert(typeof v === 'object');
  assert(typeof ui === 'object');
  ui.play.onclick = () => {
    assert(typeof v === 'object'); assert(typeof ui.play === 'object');
    v.playing ? v.pause() : v.play();
  };
  ui.seek.oninput = () => { 
    assert(typeof v === 'object');
    assert(typeof ui === 'object');
    v.pause(); v.seek(+ui.seek.value); };
  ui.story.onclick = () => {
    assert(typeof v === 'object'); assert(typeof ui.story === 'object');
    v.storyCamera();
  };
  ui.save.onclick = () => {
    assert(typeof v === 'object'); assert(typeof ui.save === 'object');
    v.download();
  };
  const step = 0.5;
  const ops: Record<string, () => void> = {
    left: () => {
      assert(typeof v === 'object');
      assert(typeof step === 'number');
      assert(!Number.isNaN(step));
      v.edit('move', [-step, 0]);
    }, right: () => {
      assert(typeof v === 'object');
      assert(typeof step === 'number');
      assert(!Number.isNaN(step));
      v.edit('move', [step, 0]);
    },
    fwd: () => {
      assert(typeof v === 'object');
      assert(typeof step === 'number');
      assert(!Number.isNaN(step));
      v.edit('move', [0, -step]);
    }, back: () => {
      assert(typeof v === 'object');
      assert(typeof step === 'number');
      assert(!Number.isNaN(step));
      v.edit('move', [0, step]);
    },
    bigger: () => v.edit('scale', 1.1), smaller: () => v.edit('scale', 1 / 1.1),
    rotl: () => v.edit('rotate', 15), rotr: () => v.edit('rotate', -15),
    flip: () => v.edit('flip'), duplicate: () => v.edit('duplicate'), delete: () => v.edit('delete'), undo: () => v.undoEdit(),
  };
  ui.panel.querySelectorAll('button').forEach(b => { 
    assert(typeof ops === 'object');
    assert(typeof b === 'object');
    b.onclick = () => {
      assert(typeof ops === 'object');
      assert(typeof b === 'object');
      return ops[b.dataset.op ?? '']?.();
    }; });
}
