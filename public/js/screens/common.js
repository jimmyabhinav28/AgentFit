// Shared pieces: tab bar, error banners with recovery actions, the resume banner,
// unit display, exercise colours.
import { html, icon, when } from '../lib/dom.js';
import { S, settings, paused } from '../store.js';
import { relativeDays } from '../core/dates.js';

export function tabbar(active) {
  const tab = (name, label, ic) => html`<a href="#/${name}" ${active === name ? 'aria-current="page"' : ''}>${icon(ic, 22)}${label}</a>`;
  return html`<div class="tabbar"><nav aria-label="Main">${tab('today', 'Today', 'today')}${tab('progress', 'Progress', 'chart')}${tab('coach', 'Coach', 'chat')}${tab('settings', 'Settings', 'gear')}</nav></div>`;
}

const ACTION_LABELS = { retry: 'Try again', use_own_key: 'Use my own key', use_credits: 'Use credits', fix_key: 'Fix key', sign_in: 'Sign in again' };
// err: { code, message, actions }
export function errorBanner(err, retryAction = 'retry') {
  const actions = (err && err.actions && err.actions.length ? err.actions : ['retry']);
  return html`<div class="banner ${err.code === 'daily_limit' ? 'warn' : 'danger'}" role="alert">
    <span>${err.message || 'Something went wrong.'}</span>
    <div class="acts">${actions.map(a => html`<button class="btn sm ${a === actions[0] ? 'primary' : 'secondary'}" data-action="${a === 'retry' ? retryAction : 'err-' + a}">${ACTION_LABELS[a] || a}</button>`)}</div>
  </div>`;
}

// J-08: shown on main screens while a journey is paused (inside the section on Today).
export function resumeBanner(kind, { inline = false } = {}) {
  const p = paused(kind);
  if (!p) return '';
  if (!inline && S.ui.bannerHidden[kind]) return '';
  const age = relativeDays(p.updatedAt || p.startedAt);
  const what = kind === 'food' ? 'your food' : 'your workout';
  return html`<div class="banner" role="status">
    <div class="row between" style="align-items:flex-start"><span class="strong">You were midway through planning ${what}</span>
      ${when(!inline, () => html`<button class="iconbtn sm ghost" data-action="hide-banner" data-kind="${kind}" aria-label="Dismiss">${icon('x', 16)}</button>`)}</div>
    <span class="small">Stopped at "${stepLabel(kind, p.step)}" · ${age === '30+ days ago' ? 'started 30+ days ago' : age}. Nothing else has changed.</span>
    <div class="acts"><button class="btn sm primary" data-action="resume-journey" data-kind="${kind}">Resume</button><button class="btn sm secondary" data-action="abandon-journey" data-kind="${kind}">Abandon</button></div>
  </div>`;
}

// Units (Settings → Units): plans are stored in kg and km; display converts.
export function units(text) {
  const u = settings().units || {};
  let t = String(text || '');
  if (u.weight === 'lb') t = t.replace(/(\d+(?:\.\d+)?) kg/g, (_, n) => `${Math.round(Number(n) * 2.2046)} lb`);
  if (u.distance === 'mi') t = t.replace(/(\d+(?:\.\d+)?) km(?!\/)/g, (_, n) => `${(Number(n) * 0.6214).toFixed(2).replace(/\.?0+$/, '')} mi`).replace(/(\d+(?:\.\d+)?) km\/h/g, (_, n) => `${(Number(n) * 0.6214).toFixed(1)} mph`);
  return t;
}

const EX_COLORS = [['var(--sage)', 'var(--sage-line)'], ['var(--primary)', 'var(--primary-line)'], ['var(--amber)', 'var(--amber-tint)'], ['var(--violet-bar)', 'var(--violet-tint)'], ['var(--teal)', 'var(--teal-tint)'], ['var(--rose)', 'var(--rose-tint)'], ['var(--slate)', 'var(--slate-tint)']];
export function exColor(plan, exerciseId) {
  const i = Math.max(0, (plan.exercises || []).findIndex(e => e.exerciseId === exerciseId));
  return EX_COLORS[i % EX_COLORS.length];
}
export const DAY_COLORS = { violet: 'var(--violet-bar)', blue: 'var(--primary)', indigo: 'var(--primary)', green: 'var(--sage)', amber: 'var(--amber)', rose: 'var(--rose)', teal: 'var(--teal)', slate: 'var(--slate)' };
export const NOTE_TONES = { rose: 'rose', amber: 'amber', indigo: 'indigo', violet: 'violet' };
export const NOTE_ICONS = { lightning: 'bolt', sprout: 'sprout', waves: 'waves', trophy: 'trophy' };
export const exName = (ex) => (S.data.library[ex.exerciseId] && S.data.library[ex.exerciseId].name) || ex.name || ex.exerciseId;

export function stepLabel(kind, step) {
  const L = { upper: 'Push-ups', back: 'Pull-ups', lower: 'Squats', core: 'Plank', mobility: 'Mobility', aerobic: 'Aerobic base', equipment: 'Where you train', training: 'Current training', result: 'Assessment result', goal: 'Your goal', schedule: 'Your week', plan: 'Proposed plan',
    habits: 'How you eat', pattern: 'When you eat', extras: 'Allergies', likes: 'Likes and dislikes', fixed: 'Fixed meals', targets: 'Targets', chart: '14-day chart', describe: 'Your constraints' };
  return L[step] || step;
}
