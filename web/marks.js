// Small raised and lowered text in a label, a callout, a caption or a chapter title:
// ^{...} and _{...}, or ^x and _x for 1 character. For example "m^{2}", "CO_2", "31^{st}".

// The parts of a text: [{ text, shift }], shift 1 is raised, -1 is lowered, 0 is normal.
export function marks(text) {
  return String(text).split(/([\^_](?:\{[^}]*\}|[^\s{]))/).filter(Boolean).map((part) => /^[\^_](\{[^}]*\}|[^\s{])$/.test(part)
    ? { text: part.slice(1).replace(/^\{|\}$/g, ''), shift: part[0] === '^' ? 1 : -1 } : { text: part, shift: 0 });
}

const UP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', n: 'ⁿ', i: 'ⁱ' };
const DOWN = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉', '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎' };
// The text for a place that has no raised text (an .srt file, a length count): Unicode characters
// when they exist for all of the part, the letters alone for a word ("31st"), else ^(...) or _(...).
export function plain(text) {
  return marks(text).map(({ text: s, shift }) => {
    if (!shift) return s;
    const map = shift > 0 ? UP : DOWN;
    if ([...s].every((c) => map[c])) return [...s].map((c) => map[c]).join('');
    return /^[a-z]+$/i.test(s) ? s : `${shift > 0 ? '^' : '_'}(${s})`;
  }).join('');
}
