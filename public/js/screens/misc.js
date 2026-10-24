// Welcome (Journey step 1), Exercise info (§4.5) and the 4-screen tutorial.
import { html, icon, when } from '../lib/dom.js';
import { S, update, activeVersion, upcoming, exState, profile } from '../store.js';
import { prescription } from '../core/plans.js';
import * as drive from '../drive.js';
import { tabbar, units } from './common.js';
import { go } from '../router.js';

// ---------- Welcome ----------
export const welcome = {
  render() {
    const signedIn = !!S.session;
    const local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
    return html`<div class="welcome">
      <div class="stack loose" style="align-items:center;margin-top:120px"><div class="logo">AgentFit</div><div class="tag">Your plan. Your pace.<br>A coach that remembers you.</div></div>
      <div class="stack" style="width:100%;align-items:center">
        ${signedIn ? html`<div class="fine">Signed in as ${S.session.email}</div>
            <button class="btn light" data-action="begin">${profile().body ? 'Continue' : 'Begin my journey'}</button>
            <div class="fine">About 6 minutes. You can pause any time.</div>`
          : html`${when(S.ui.authError, () => html`<div class="fine" role="alert" style="color:#F2C1BB">${S.ui.authError}</div>`)}
            <button class="btn light" data-action="google" ${drive.configured() ? '' : 'disabled'}>Continue with Google</button>
            <div class="fine">We use Google sign-in, and keep your plans in an AgentFit folder in your own Google Drive.</div>
            ${when(local, () => html`<button class="btn outline" data-action="dev-signin">Developer sign-in (local only)</button>`)}`}
      </div>
    </div>`;
  },
  actions: {
    google: () => drive.signIn(),
    begin: () => go(profile().body ? '#/today' : '#/journey/start/profile'),
    'dev-signin': async () => {
      const { api, session } = await import('../api.js');
      try {
        const r = await api('POST', '/api/auth/dev', { email: 'dev@agentfit.local', name: 'Dev' });
        session.set({ token: r.token, email: 'dev@agentfit.local', dev: true });
        S.session = session.get();
        window.dispatchEvent(new CustomEvent('af:signed-in'));
      } catch (e) { S.ui.authError = e.code === 'not_found' ? 'Set DEV_AUTH=1 in .dev.vars to use developer sign-in.' : e.message; update(); }
    },
  },
};

// ---------- Exercise info ----------
export const exercise = {
  render(params) {
    const id = params[0];
    const e = S.data.library[id];
    if (!e) return html`<div class="screen"><a class="iconbtn" href="javascript:history.back()" aria-label="Back">${icon('back')}</a><p>Exercise not found.</p></div>${tabbar('today')}`;
    const v = activeVersion('workout') || upcoming('workout');
    const ex = v && v.plan.exercises.find(x => x.exerciseId === id);
    const st = ex && exState(ex);
    const videos = (e.videos || []).filter(x => !S.broken.has(`${id}:${x.videoId}`)).sort((a, b) => (a.qualityRank || 9) - (b.qualityRank || 9));
    const vid = videos[0];
    return html`<div class="screen">
      <div class="topbar"><button class="iconbtn" data-action="history-back" aria-label="Back">${icon('back')}</button><span class="title">Exercise info</span><span class="spacer44"></span></div>
      <div><h1 class="h1">${e.name}</h1><p class="lead">${e.category} · ${e.muscles.join(', ')}</p><p class="small">Equipment: ${e.equipment.filter(x => x !== 'none').join(', ') || 'none'}</p></div>
      ${vid ? (S.ui.playVideo === id
        ? html`<div style="position:relative;padding-top:56.25%;border-radius:14px;overflow:hidden;background:#000"><iframe style="position:absolute;inset:0;width:100%;height:100%;border:0" src="https://www.youtube-nocookie.com/embed/${vid.videoId}?start=${vid.start || 0}${vid.end ? '&end=' + vid.end : ''}&rel=0" title="${e.name} video" allow="accelerometer; encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`
        : html`<button class="card pad" style="flex-direction:row;align-items:center;gap:12px" data-action="play-video" data-v="${id}">${icon('video', 24)}<span class="stack tight" style="flex:1;text-align:left"><span class="strong">Watch the form video</span><span class="small">${vid.curatorNote || 'Curated video'} · loads from YouTube when tapped</span></span></button>`)
        : html`<div class="note">No video yet. Follow the steps below.</div>`}
      <div class="card pad"><span class="strong">How to do it</span><ol style="margin:0;padding-left:20px" class="stack tight">${e.instructions.map(s => html`<li>${s}</li>`)}</ol></div>
      <div class="card pad"><span class="strong">Form cues</span><ul style="margin:0;padding-left:20px">${e.cues.map(s => html`<li>${s}</li>`)}</ul><span class="strong">Common mistakes</span><ul style="margin:0;padding-left:20px">${e.mistakes.map(s => html`<li>${s}</li>`)}</ul></div>
      ${ex ? html`<div class="card pad"><span class="strong">Your ladder</span><span class="small">Now: level ${st.level} of ${ex.levels.length}, sub-level ${st.sublevel} · target ${units(ex.target.text)}</span>
        <div class="sublist">${ex.levels.map((l, i) => html`<div class="${i + 1 === st.level ? 'now' : ''}"><span class="strong">L${i + 1}</span><span>${units(prescription(v.plan, ex, { level: i + 1, sublevel: 1 }).main)}</span><span class="small">${i + 1 < st.level ? 'cleared' : i + 1 === st.level ? 'now' : ''}</span></div>`)}</div></div>` : ''}
    </div>${tabbar('today')}`;
  },
  actions: { 'play-video': el => { S.ui.playVideo = el.dataset.v; update(); } },
};

// ---------- Tutorial ----------
const SLIDES = [
  ['chat', 'Plan by answering a few questions', 'A short questionnaire and an AI planner build a workout plan and a 14-day food chart around your body, equipment, schedule and tastes.'],
  ['dumbbell', 'Climb one step at a time', 'Every exercise has levels, and every level has four sub-levels. Tap Progress when it feels easy and Regress when it does not. You decide.'],
  ['today', 'Tick things off on Today', 'Today shows this week only. Tick exercises and meals as you go. It works offline and syncs to your own Google Drive.'],
  ['sparkle', 'Change anything with Coach', 'Ask Coach to swap a meal or change your week. Changes arrive as cards you accept, and new versions start the next day.'],
];
export const tutorial = {
  render() {
    const i = S.ui.slide || 0;
    const [ic, t, d] = SLIDES[i];
    return html`<div class="screen no-tabs">
      <div class="topbar"><button class="iconbtn" data-action="history-back" aria-label="Close tutorial">${icon('x')}</button><span class="title">How planning works · ${i + 1} of 4</span><span class="spacer44"></span></div>
      <div class="segments">${SLIDES.map((_, k) => html`<div class="${k <= i ? 'on' : ''}" style="${k <= i ? 'background:var(--primary)' : ''}"></div>`)}</div>
      <div class="stack loose" style="padding-top:60px;align-items:flex-start"><span class="ic indigo" style="width:64px;height:64px;border-radius:18px;display:flex;align-items:center;justify-content:center">${icon(ic, 30)}</span><h1 class="h1">${t}</h1><p class="lead" style="font-size:16px">${d}</p></div>
      <div class="bottom btnrow">${when(i > 0, () => html`<button class="btn secondary" style="width:110px" data-action="slide" data-v="${i - 1}">Back</button>`)}<button class="btn primary grow" data-action="${i < 3 ? 'slide' : 'history-back'}" data-v="${i + 1}">${i < 3 ? 'Next' : 'Got it'}</button></div>
    </div>`;
  },
  actions: { slide: el => { S.ui.slide = Number(el.dataset.v); update(); } },
};
