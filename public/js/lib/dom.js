// Tiny HTML templating with escaping. Screens return strings; events are delegated
// through data-action attributes, so there are no inline scripts (NFR-04).

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ESC[c]);

class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = s => new Raw(String(s ?? ''));

function part(v) {
  if (v == null) return '';
  if (v === true || v === false) return String(v); // for aria-pressed and friends
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(part).join('');
  return esc(v);
}
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += part(values[i]) + strings[i + 1];
  return new Raw(out);
}
// Branches may be functions so they are only evaluated when chosen.
export const when = (cond, a, b = '') => { const v = cond ? a : b; return typeof v === 'function' ? v() : v; };
export const attrs = obj => raw(Object.entries(obj).filter(([, v]) => v != null && v !== false).map(([k, v]) => (v === true ? k : `${k}="${esc(v)}"`)).join(' '));

// Stroke icons (aria-hidden; buttons carry their own labels).
const P = {
  back: '<path d="M15 18l-6-6 6-6"/>',
  fwd: '<path d="M9 6l6 6-6 6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  up: '<path d="M18 15l-6-6-6 6"/>',
  check: '<path d="M5 12l5 5 9-9"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/>',
  dumbbell: '<path d="M6 4v16M18 4v16M3 8v8M21 8v8M6 12h12"/>',
  bowl: '<path d="M3 11h18l-2 9H5z"/><path d="M12 3c-2 2-2 4 0 6M8 4c-1.5 1.5-1.5 3 0 5M16 4c-1.5 1.5-1.5 3 0 5"/>',
  grid: '<rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/>',
  trend: '<path d="M4 17l5-7 4 5 3-3 4 5"/><path d="M14 7h6v6"/>',
  today: '<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M3 9h18M8 2v4M16 2v4"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 15.4a1.6 1.6 0 0 0-1-.4H2a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 3.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 9 4.6V4a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>',
  send: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="2"/>',
  play: '<circle cx="12" cy="12" r="9"/><path d="M10 9l5 3-5 3z"/>',
  file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  dots: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  sprout: '<path d="M12 21v-9"/><path d="M12 12c0-4 3-6 7-6 0 4-3 6-7 6zM12 14c0-3-2-5-6-5 0 3 2 5 6 5z"/>',
  waves: '<path d="M2 9c3 0 3-2 5-2s2 2 5 2 3-2 5-2 2 2 5 2M2 15c3 0 3-2 5-2s2 2 5 2 3-2 5-2 2 2 5 2"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3a3 3 0 0 1-3 4M7 5H4a3 3 0 0 0 3 4"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  brain: '<path d="M9 4a3 3 0 0 0-3 3v1a3 3 0 0 0-2 5 3 3 0 0 0 2 5v1a2 2 0 0 0 3 1V4zM15 4a3 3 0 0 1 3 3v1a3 3 0 0 1 2 5 3 3 0 0 1-2 5v1a2 2 0 0 1-3 1V4z"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M9 9.5c0-1 1.3-2 3-2s3 1 3 2-1.3 2-3 2-3 1-3 2 1.3 2 3 2 3-1 3-2"/>',
  cal: '<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M3 9h18"/>',
  ruler: '<path d="M3 17L17 3l4 4L7 21z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/>',
  db: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  swap: '<path d="M7 7h12l-4-4M17 17H5l4 4"/>',
  cloud: '<path d="M7 18a5 5 0 1 1 .7-9.9A6 6 0 0 1 19 10a4 4 0 0 1 0 8z"/>',
  logout: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11"/>',
  book: '<path d="M4 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4zM20 4h-5a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h6z"/>',
};
export function icon(name, size = 20, sw = 2) {
  return raw(`<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${P[name] || ''}</svg>`);
}
export function checkCircle(size = 22) {
  return raw(`<svg aria-hidden="true" class="check" width="${size}" height="${size}" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="var(--primary)"/><path d="M7 12.5l3 3 7-7" stroke="#FFFFFF" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`);
}

// Very small markdown: paragraphs, bullet and numbered lists, **bold**, *italic*.
export function md(text) {
  const lines = esc(text || '').split('\n');
  let out = '', list = null;
  const inline = s => s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<em>$2</em>');
  const closeList = () => { if (list) { out += `</${list}>`; list = null; } };
  let para = [];
  const flush = () => { if (para.length) { out += `<p>${inline(para.join('<br>'))}</p>`; para = []; } };
  for (const l of lines) {
    const ul = /^\s*[-•*]\s+(.*)/.exec(l), ol = /^\s*\d+[.)]\s+(.*)/.exec(l);
    if (ul || ol) {
      flush();
      const kind = ul ? 'ul' : 'ol';
      if (list !== kind) { closeList(); out += `<${kind}>`; list = kind; }
      out += `<li>${inline((ul || ol)[1])}</li>`;
    } else if (!l.trim()) { flush(); closeList(); }
    else { closeList(); para.push(l); }
  }
  flush(); closeList();
  return raw(out);
}
