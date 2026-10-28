// Pointer, touch and keyboard control of a viewer, plus the edit panel and the play bar.
export function bindControls(v, { canvas, ui }) {
  const px = e => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) * canvas.width / r.width, (e.clientY - r.top) * canvas.height / r.height]; };
  const pts = new Map(); let drag = null, pinch = 0;
  const fmt = () => `${v.t.toFixed(1)} / ${(v.scene ? v.scene.duration || 60 : 0).toFixed(1)} s`;
  const sync = () => {
    ui.seek.value = v.t; ui.time.textContent = fmt();
    const play = v.playing; ui.play.textContent = play ? 'Pause' : 'Play'; ui.play.setAttribute('aria-label', play ? 'Pause' : 'Play');
    const o = v.scene && v.scene.objects.find(x => x.id === v.selected);
    ui.panel.hidden = !o;
    if (o) {
      ui.pname.textContent = o.label || o.id;
      ui.psrc.textContent = (o.source ? 'Source: ' + o.source : '') + (o.estimated ? (o.source ? '. ' : '') + 'Estimated value.' : '');
    }
  };
  v.onframe = sync; v.onchange = sync;
  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId); canvas.focus();
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); if (drag && drag.snap) v.endDrag(); drag = null; return; }
    const [x, y] = px(e), hit = v.pick(x, y);
    drag = { x: e.clientX, y: e.clientY, hit, moved: false, start: hit && hit === v.selected, pan: e.shiftKey || e.button === 2 };
  });
  canvas.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2) {
      const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
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
  const up = e => {
    pts.delete(e.pointerId); if (pts.size < 2) pinch = 0;
    if (drag && !drag.moved) v.select(drag.hit);
    if (drag && drag.snap) v.endDrag();
    drag = null;
  };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('wheel', e => { e.preventDefault(); v.zoomBy(Math.exp(e.deltaY * 0.001)); }, { passive: false });
  canvas.addEventListener('keydown', e => {
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
  ui.play.onclick = () => (v.playing ? v.pause() : v.play());
  ui.seek.oninput = () => { v.pause(); v.seek(+ui.seek.value); };
  ui.story.onclick = () => v.storyCamera();
  ui.save.onclick = () => v.download();
  const step = 0.5;
  const ops = {
    left: () => v.edit('move', [-step, 0]), right: () => v.edit('move', [step, 0]),
    fwd: () => v.edit('move', [0, -step]), back: () => v.edit('move', [0, step]),
    bigger: () => v.edit('scale', 1.1), smaller: () => v.edit('scale', 1 / 1.1),
    rotl: () => v.edit('rotate', 15), rotr: () => v.edit('rotate', -15),
    flip: () => v.edit('flip'), duplicate: () => v.edit('duplicate'), delete: () => v.edit('delete'), undo: () => v.undoEdit(),
  };
  ui.panel.querySelectorAll('button').forEach(b => { b.onclick = () => ops[b.dataset.op](); });
  sync();
}
