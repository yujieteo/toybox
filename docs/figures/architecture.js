// Toybox architecture for README.md. Drawn with the schematic-emil style
// (upstream lgwrightlab/schematic-figure at 09d8b6e98d04b91de6e8b6632b3356b9fc237417).
// To render it, put this file at figure/figure.js and the schematic-emil style.js at figure/emil.js in a project folder.
// Then run: node <schematic-figure>/foundation/tools/render.mjs --root <project> --fig figure/figure.js
import * as E from './emil.js';
import * as D from '../engine/cs.js';

export const figure = { width: 100, height: 53, name: 'architecture', format: 'journal' };

export default function draw(F, L) {
  const { r, line, text } = E.useEmil(F, L, 'web');
  const root = F.root;
  const W = L.mm(100), M = 6, GX = 24, GY = 24, CH = 30;
  const CW = (W - 2 * M - 2 * GX) / 3;
  const X = (c) => M + c * (CW + GX), Y = (rw) => M + rw * (CH + GY);
  const cx = (c) => X(c) + CW / 2, cy = (rw) => Y(rw) + CH / 2;

  const conn = L.group(root, { part: 'connectors' });
  const cards = L.group(root, { part: 'cards' });
  const card = (name, c, rw, title, sub, tint) => {
    const s = tint ? { fill: E.hue[tint][3], stroke: E.hue[tint][7] } : E.card(r.card);
    D.box(cards, X(c), Y(rw), CW, CH, { fill: s.fill, stroke: s.stroke, width: line.thin, r: r.card, F, name });
    L.text(cards, cx(c), cy(rw) - 1, title, { anchor: 'middle', valign: 'bottom', size: text.label, weight: E.weight.name, color: E.gray[1200] });
    L.text(cards, cx(c), cy(rw) + 1.5, sub, { anchor: 'middle', valign: 'top', size: text.small, color: E.gray[1100] });
  };
  card('chat', 0, 0, 'Chat page', 'web/app.html');
  card('daemon', 1, 0, 'Daemon', 'app/serve.mjs');
  card('agent', 2, 0, 'Claude Code', 'claude');
  card('chrome', 0, 1, 'Headless Chrome', 'engine .wasm');
  card('scene', 1, 1, 'Scene file', '.toybox.json', 'blue');
  card('mcp', 2, 1, 'MCP server', 'core/mcp.mjs');
  card('mp4', 0, 2, 'MP4 video', 'ffmpeg');
  card('static', 2, 2, 'Static viewer', 'web/viewer.html');

  const ink = E.gray[900], o = { F, stroke: ink, width: line.normal, outline: line.thin, outline0: line.thin, relate: true };
  const lab = (x, y, s, anchor = 'middle') => L.text(conn, x, y, s, { anchor, valign: 'middle', size: text.small, color: E.gray[1100] });
  // row 1: the chat loop
  D.route(conn, ['chat.right', 'daemon.left'], { ...o, tail: 'fill', kind: 'http' });
  D.route(conn, ['daemon.right', 'agent.left'], { ...o, kind: 'starts' });
  lab(X(2) - GX / 2, cy(0) - 5, 'starts');
  D.route(conn, ['agent.bottom', 'mcp.top'], { ...o, kind: 'tool calls' });
  lab(cx(2) - 3, Y(1) - GY / 2, 'tool calls', 'end');
  // row 2: the scene file is the hub
  D.route(conn, ['mcp.left', 'scene.right'], { ...o, kind: 'writes' });
  lab(X(2) - GX / 2, cy(1) - 5, 'writes');
  D.route(conn, ['scene.top', 'daemon.bottom'], { ...o, kind: 'reads' });
  lab(cx(1) + 3, Y(1) - GY / 2, 'reads', 'start');
  D.route(conn, ['scene.left', 'chrome.right'], { ...o, kind: 'renders' });
  lab(X(1) - GX / 2, cy(1) - 5, 'renders');
  // row 3: the two exports
  D.route(conn, ['chrome.bottom', 'mp4.top'], { ...o, kind: 'frames' });
  lab(cx(0) + 3, Y(2) - GY / 2, 'frames', 'start');
  const fy = cy(2);
  D.route(conn, ['scene.bottom', [cx(1), fy], 'mp4.right'], { ...o, kind: 'voice' });
  lab((X(0) + CW + cx(1)) / 2, fy - 5, 'voice');
  D.route(conn, ['scene.bottom', [cx(1), fy], 'static.left'], { ...o, kind: 'opens' });
  lab((cx(1) + X(2)) / 2, fy - 5, 'opens');

  E.emilTheme(F);
}
