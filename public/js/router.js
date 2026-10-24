// Hash routes: #/today, #/progress, #/coach[/id|new], #/settings[/section], #/plans[/type],
// #/journey/<flow>/<step>, #/exercise/<id>, #/tutorial, #/welcome
export function parse(hash = location.hash) {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  return { name: parts[0] || 'today', params: parts.slice(1) };
}
export function go(href, { replace = false } = {}) {
  if (!href.startsWith('#')) href = '#' + href;
  if (location.hash === href) { window.dispatchEvent(new HashChangeEvent('hashchange')); return; }
  if (replace) history.replaceState(null, '', href); else location.hash = href;
  if (replace) window.dispatchEvent(new HashChangeEvent('hashchange'));
}
