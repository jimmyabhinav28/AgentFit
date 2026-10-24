// The Journey (§3A): guided steps with choices plus free text. Progress is saved after
// every step as a paused journey (J-02, J-07); nothing changes a plan until Accept.
import { html, raw, icon, checkCircle, esc, when } from '../lib/dom.js';
import { S, update, toast, profile, setProfile, savePaused, paused, recordAnswers, acceptDraft, planTargets, contextBundle, aiRequestOptions, today, versions, healthText, settings } from '../store.js';
import { api, stream } from '../api.js';
import { assess, AREAS, RATINGS } from '../core/norms.js';
import { ageOn, addDays, longDate, WEEKDAYS, WEEKDAY_SHORT, weekdayOf } from '../core/dates.js';
import { prescription, mealsForDay, dayTotals, mealMacros, weekdayForCycleDay } from '../core/plans.js';
import { emptyTraining } from '../core/equipment.js';
import { targets as computeTargets } from '../core/nutrition.js';
import * as drive from '../drive.js';
import { go } from '../router.js';
import { errorBanner, stepLabel } from './common.js';

// ---------------------------------------------------------------- definitions
const WQ = [
  { id: 'upper', area: 'Upper body', q: 'How many push-ups can you do without stopping?', sub: 'Full push-ups, chest near the floor. Knee push-ups count as half.', opts: [['None yet', 0], ['1 – 5', 3], ['6 – 15', 10], ['16 – 30', 23], ['More than 30', 35]], ph: 'e.g. about 8, but my shoulder hurts after' },
  { id: 'back', area: 'Back / pull', q: 'How many pull-ups can you do in a row?', sub: 'From a dead hang, chin over the bar.', opts: [['None yet, or no bar', 0], ['1 – 3', 2], ['4 – 8', 6], ['9 – 15', 12], ['More than 15', 16]], ph: 'e.g. I can hang but not pull up' },
  { id: 'lower', area: 'Lower body', q: 'How many bodyweight squats can you do without stopping?', sub: 'Thighs to about parallel, standing tall between reps.', opts: [['0 – 10', 5], ['11 – 25', 18], ['26 – 50', 38], ['More than 50', 55]], ph: 'e.g. 20 but my knee clicks' },
  { id: 'core', area: 'Core', q: 'How long can you hold a plank?', sub: 'Forearms down, body in one straight line.', opts: [['Under 30 seconds', 20], ['30 – 60 seconds', 45], ['1 – 2 minutes', 90], ['2 – 4 minutes', 180], ['More than 4 minutes', 260]], ph: 'e.g. never tried' },
  { id: 'mobility', area: 'Mobility', q: 'Lying flat, can you sit up and touch your feet?', sub: 'Legs straight, without bouncing.', opts: [['Yes, easily', 2], ['Just about', 1], ['No', 0]], ph: 'e.g. tight hamstrings' },
  { id: 'aerobic', area: 'Aerobic', q: 'How long can you jog or cycle at an easy pace before you need to stop?', sub: 'A pace where you could still talk.', opts: [['Under 5 minutes', 3], ['5 – 15 minutes', 10], ['15 – 30 minutes', 22], ['30 – 60 minutes', 45], ['More than an hour', 70]], ph: 'e.g. I walk 5 km daily but don\'t run' },
  { id: 'equipment', special: true },
  { id: 'training', special: true },
];
const WSTEPS = [...WQ.map(q => q.id), 'result', 'goal', 'schedule', 'plan'];
const FSTEPS = ['habits', 'pattern', 'extras', 'likes', 'fixed', 'targets', 'chart'];
const START = ['profile', 'health', 'purpose', 'track'];
const DIETS = [['vegetarian', 'Vegetarian'], ['eggetarian', 'Eggetarian'], ['nonveg', 'Non-vegetarian'], ['vegan', 'Vegan'], ['jain', 'Jain']];
const CONDITIONS = ['Hypertension', 'Prediabetes', 'Diabetes', 'High uric acid', 'Obesity', 'Smoking', 'Alcohol', 'Disability / mobility limits'];

// ---------------------------------------------------------------- helpers
const st = { draft: {}, busy: false, status: '', error: null, likeIdx: 0, chartDay: 1, swapFor: null, swapAlts: null, abort: null };
const back = (href, label = 'Back') => html`<a class="iconbtn" href="${href}" aria-label="${label}">${icon('back')}</a>`;
const exitLink = html`<a class="linkbtn" href="#/journey/exit">Exit</a>`;
const pressed = b => (b ? 'true' : 'false');
function bar(n, total) { return html`<div class="progressline" aria-hidden="true"><div style="width:${Math.round((n / total) * 100)}%"></div></div>`; }
function segs(n, total) { return html`<div class="segments" aria-hidden="true">${Array.from({ length: total }, (_, i) => html`<div class="${i < n ? 'on' : ''}"></div>`)}</div>`; }
function topbar(left, title, right) { return html`<div class="topbar">${left || html`<span class="spacer44"></span>`}<span class="title">${title}</span>${right || html`<span class="spacer44"></span>`}</div>`; }

function journeyState(kind) {
  if (!st.draft[kind]) {
    const p = paused(kind);
    st.draft[kind] = p ? structuredClone(p) : { step: kind === 'workout' ? WSTEPS[0] : FSTEPS[0], answers: kind === 'workout' ? initWorkoutAnswers() : initFoodAnswers(), startedAt: Date.now() };
  }
  return st.draft[kind];
}
function initWorkoutAnswers() {
  const p = profile();
  const last = S.doc.answers && S.doc.answers.workout;
  if (last) return { ...structuredClone(last.answers), assessment: null, goalChoice: null };
  return { training: { ...emptyTraining(), ...(p.training || {}) }, schedule: { frequency: 'few', days: ['TUE', 'THU', 'SAT'], sessionMinutes: 45, ...(p.schedule || {}) } };
}
function initFoodAnswers() {
  const last = S.doc.answers && S.doc.answers.food;
  if (last) { const a = structuredClone(last.answers); delete a.approvals; return a; }
  const f = profile().food || {};
  return { food: { dietType: 'vegetarian', restrictedDays: [], whoCooks: 'self', cookingMinutes: 30, mealsPerDay: 3, eatingWindow: { start: '08:00', end: '20:30' }, fasting: [], likes: [], neutral: [], dislikes: [], allergies: '', supplements: [], fixedMealsText: '', calorieIntent: 'maintain', localItems: [], ...f } };
}
async function persist(kind, step) {
  const j = journeyState(kind);
  if (step) j.step = step;
  await savePaused(kind, j);
}
function stepUrl(kind, step) { return `#/journey/${kind}/${step}`; }
function nextOf(list, step) { return list[Math.min(list.length - 1, list.indexOf(step) + 1)]; }
function prevOf(list, step) { return list[Math.max(0, list.indexOf(step) - 1)]; }
function age() { const b = profile().body || {}; return b.dob ? ageOn(b.dob, today()) : 30; }
function region() {
  const p = profile();
  const city = `${(p.location && p.location.city) || ''}`.toLowerCase();
  const keys = (S.data.foods && S.data.foods.regionKeys) || {};
  for (const [r, words] of Object.entries(keys)) if (city && words.split(' ').some(w => w.length > 3 && city.includes(w))) return r;
  return null;
}
function isIndia() { return /india/i.test((profile().location && profile().location.country) || 'India'); }
function bigCity() { return !!region() || !isIndia(); }

// ---------------------------------------------------------------- render
export function render(params) {
  const [flow, step] = params;
  if (flow === 'start') return renderStart(step || 'profile');
  if (flow === 'workout') return renderWorkout(step || journeyState('workout').step);
  if (flow === 'food') return renderFood(step || journeyState('food').step);
  if (flow === 'done') return renderDone(step || '');
  if (flow === 'exit') return renderExit();
  return renderStart('profile');
}

// ---------- Step 2–4: profile, health, purpose, track ----------
function renderStart(step) {
  const p = profile();
  const pf = st.pf || (st.pf = { name: p.name || '', dob: (p.body || {}).dob || '', heightCm: (p.body || {}).heightCm || '', weightKg: (p.body || {}).weightKg || '', country: (p.location || {}).country || 'India', city: (p.location || {}).city || '', genderText: (p.body || {}).genderText || '' });
  const b = { ...(p.body || {}), ...pf }, loc = { country: pf.country, city: pf.city };
  if (step === 'profile') return html`<div class="screen no-tabs">
    ${topbar(back('#/welcome'), 'Step 2 of 7')}
    ${bar(2, 7)}
    <div><h1 class="h1">About you</h1><p class="lead">Your age, size and where you live shape your plan and your food options.</p></div>
    <form class="stack loose" data-form="profile" novalidate>
      <div class="field"><label class="label" for="name">First name</label><input class="input" id="name" name="name" data-model="pf.name" autocomplete="given-name" value="${pf.name}"></div>
      <div class="field"><label class="label" for="dob">Date of birth</label><input class="input" id="dob" name="dob" data-model="pf.dob" type="date" max="${today()}" value="${pf.dob}" required></div>
      <div class="field"><span class="label" id="glabel">Gender</span>
        <div class="seg" role="group" aria-labelledby="glabel">${[['female', 'Female'], ['male', 'Male'], ['other', 'Self-describe']].map(([v, l]) => html`<button type="button" class="chip" data-action="set-gender" data-v="${v}" aria-pressed="${pressed(b.gender === v)}">${l}</button>`)}</div>
        ${when(b.gender === 'other', () => html`<input class="input" name="genderText" data-model="pf.genderText" aria-label="How you describe your gender" placeholder="In your own words (optional)" value="${pf.genderText}">`)}
      </div>
      <div class="grid2">
        <div class="field"><label class="label" for="height">Height</label><div class="inputunit"><input id="height" name="heightCm" data-model="pf.heightCm" inputmode="decimal" value="${pf.heightCm}"><span>cm</span></div></div>
        <div class="field"><label class="label" for="weight">Weight</label><div class="inputunit"><input id="weight" name="weightKg" data-model="pf.weightKg" inputmode="decimal" value="${pf.weightKg}"><span>kg</span></div></div>
      </div>
      <div class="field"><label class="label" for="country">Country</label><input class="input" id="country" name="country" data-model="pf.country" list="countries" value="${pf.country}"></div>
      <datalist id="countries">${['India', 'United States', 'United Kingdom', 'Canada', 'Australia', 'Germany', 'France', 'Ireland', 'Netherlands', 'Singapore', 'United Arab Emirates'].map(c => html`<option value="${c}">`)}</datalist>
      <div class="field"><label class="label" for="city">City, town or pincode</label><input class="input" id="city" name="city" data-model="pf.city" value="${pf.city}">
        <div class="hint">${icon('info', 16)}<span>Used for climate and seasonal, locally available foods. Never shared.</span></div></div>
      ${when(st.error, () => html`<div class="banner danger" role="alert">${st.error}</div>`)}
    </form>
    <div class="bottom"><button class="btn primary block" data-action="save-profile">Continue</button></div>
  </div>`;

  if (step === 'health') {
    const h = p.health || {};
    return html`<div class="screen no-tabs">
      ${topbar(back('#/journey/start/profile'), 'Step 2 of 7 · optional', html`<button class="linkbtn" data-action="skip-health">Skip</button>`)}
      ${bar(2.5, 7)}
      <div><h1 class="h1">Anything we should know?</h1><p class="lead">Helps the coach keep your plan safe. Stays in the AgentFit folder in your Google Drive, never on our servers.</p></div>
      ${when(!h.consented, () => html`<div class="card pad">
          <p class="strong">Before we ask</p>
          <p class="small">Health answers are sensitive. We store them only in your Google Drive and on this device, use them only to keep plans conservative, and you can delete them any time. The app works fully if you skip this.</p>
          <div class="btnrow"><button class="btn secondary sm grow" data-action="skip-health">Skip health questions</button><button class="btn primary sm grow" data-action="consent-health">I agree, continue</button></div>
        </div>`, html`
      <div class="chips" role="group" aria-label="Conditions">${CONDITIONS.map(c => html`<button type="button" class="chip" data-action="toggle-condition" data-v="${c}" aria-pressed="${pressed((h.conditions || []).includes(c))}">${c}</button>`)}</div>
      <div class="field"><label class="label" for="hnotes">In your own words (optional)</label><textarea class="textarea" id="hnotes" data-model="health.notes" rows="2" placeholder="e.g. left knee clicks on deep squats">${h.notes || ''}</textarea></div>
      ${healthFiles()}
      <div class="note">Before anything from a report is sent to the coach, you'll see exactly what will be shared. The coach never diagnoses.</div>`)}
      <div class="bottom">${when(h.consented, () => html`<button class="btn primary block" data-action="go" data-href="#/journey/start/purpose">Continue</button>`)}</div>
    </div>`;
  }

  if (step === 'purpose') {
    const pu = p.purpose || {};
    const opt = (k, t1, t2, ic, tone) => html`<button type="button" class="card-choice" data-action="set-purpose" data-v="${k}" aria-pressed="${pressed(pu.kind === k)}">
      <span class="ic ${tone}">${icon(ic, 22)}</span><span class="tx"><span class="t1">${t1}</span><span class="t2">${t2}</span></span>${when(pu.kind === k, checkCircle())}</button>`;
    return html`<div class="screen no-tabs">
      ${topbar(back('#/journey/start/health'), 'Step 3 of 7')}
      ${bar(3, 7)}
      <div><h1 class="h1">What are you here for?</h1><p class="lead">This shapes the questions we ask next. You can change it later.</p></div>
      <div class="stack">
        ${opt('general', 'General fitness', 'Feel better, move more, stay consistent', 'heart', 'sage')}
        ${opt('strength', 'Strength', 'Lift more, do more push-ups and pull-ups', 'dumbbell', 'indigo')}
        ${opt('endurance', 'Endurance', 'Run, cycle or swim longer and faster', 'trend', 'amber')}
        <div class="field"><label class="label" for="pother">Something else?</label><input class="input" id="pother" data-model="purpose.note" placeholder="e.g. draw a 120 lb bow, or get back in shape after a baby" value="${pu.note || ''}"></div>
      </div>
      <div class="bottom"><button class="btn primary block" data-action="purpose-next" ${pu.kind || pu.note ? '' : 'disabled'}>Continue</button></div>
    </div>`;
  }

  // track
  const t = st.track || 'both';
  const opt = (k, t1, t2, ic, tone) => html`<button type="button" class="card-choice" data-action="set-track" data-v="${k}" aria-pressed="${pressed(t === k)}">
    <span class="ic ${tone}">${icon(ic, 24)}</span><span class="tx"><span class="t1">${t1}</span><span class="t2">${t2}</span></span>${when(t === k, checkCircle())}</button>`;
  return html`<div class="screen no-tabs">
    ${topbar(back('#/journey/start/purpose'), 'Step 4 of 7', exitLink)}
    ${bar(4, 7)}
    <div><h1 class="h1">What would you like to track?</h1><p class="lead">Pick one or both. You can add the other any time.</p></div>
    <div class="stack">
      ${opt('workout', 'Workout', 'A weekly plan with levels you progress through', 'dumbbell', 'sage')}
      ${opt('food', 'Food', 'A 14-day food chart built around what you like', 'bowl', 'amber')}
      ${opt('both', 'Both', 'Workout first, then food', 'grid', 'indigo')}
    </div>
    <a class="card pad" href="#/tutorial" style="flex-direction:row;align-items:center;gap:12px;background:var(--sunk);border:0;text-decoration:none;color:inherit">
      ${icon('play')}<span class="tx" style="flex:1"><span class="strong">How planning works</span><br><span class="small">A 1-minute tutorial, 4 screens</span></span>${icon('fwd', 18)}</a>
    <div class="bottom"><button class="btn primary block" data-action="track-next">${t === 'food' ? 'Start with food' : 'Start with workout'}</button></div>
  </div>`;
}

function healthFiles() {
  const files = st.healthFiles || [];
  const h = profile().health || {};
  return html`<div class="stack tight">
    <span class="label">Health reports (up to 5)</span>
    ${files.map(f => html`<div class="row card flat" style="padding:12px 14px">${icon('file', 22)}<div style="flex:1;min-width:0"><div class="strong" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${f.displayName}</div><div class="small">${Math.round((f.size || 0) / 1024)} KB · in Drive › AgentFit › Health reports</div></div>
      <button class="iconbtn sm" data-action="delete-health-file" data-id="${f.id}" aria-label="Remove ${f.displayName}">${icon('x', 16)}</button></div>`)}
    ${when(files.length < 5, () => html`<label class="chip dashed" style="height:48px;border-radius:12px;display:flex;align-items:center;justify-content:center;gap:8px">${icon('plus', 18)} Add a report<input type="file" accept="application/pdf,image/*" data-change="upload-health" class="sr-only"></label>`)}
    ${when(st.healthBusy, () => html`<div class="status">${st.healthBusy}</div>`)}
    ${when(h.excerpt !== undefined && h.excerpt !== null, () => html`<div class="field"><label class="label" for="hex">What the coach may see from your reports</label>
      <textarea class="textarea" id="hex" data-model="health.excerpt" rows="4">${h.excerpt || ''}</textarea>
      <label class="row small"><input type="checkbox" data-change="share-health" ${h.shareWithCoach ? 'checked' : ''}> Share this text and the notes above with the coach</label></div>`)}
  </div>`;
}

// ---------- Step 5: workout planner ----------
function renderWorkout(step) {
  const j = journeyState('workout');
  const a = j.answers;
  const qi = WQ.findIndex(q => q.id === step);
  if (qi >= 0) {
    const q = WQ[qi];
    const prev = qi === 0 ? '#/journey/start/track' : stepUrl('workout', WQ[qi - 1].id);
    const head = html`${topbar(back(prev), `Workout · question ${qi + 1} of ${WQ.length}`, exitLink)}${segs(qi + 1, WQ.length)}`;
    if (q.id === 'equipment') return renderEquipment(head, a, prev);
    if (q.id === 'training') return html`<div class="screen no-tabs">${head}
      <div><h1 class="h1">Do you train now?</h1><p class="lead">And anything that hurts or that we should avoid.</p></div>
      <div class="stack">${['Not at the moment', '1–2 times a week', '3–4 times a week', '5 or more times a week'].map(o => html`<button type="button" class="choice" data-action="set-answer" data-q="current" data-v="${o}" aria-pressed="${pressed((a.current || {}).choice === o)}"><span>${o}</span>${when((a.current || {}).choice === o, checkCircle())}</button>`)}</div>
      <div class="field"><label class="label" for="tlen">For how long have you been at it?</label><input class="input" id="tlen" data-model="w.current.howLong" placeholder="e.g. 3 months, on and off" value="${(a.current || {}).howLong || ''}"></div>
      <div class="field"><label class="label" for="inj">Injuries or pain (optional)</label><textarea class="textarea" id="inj" data-model="w.injuries" rows="2" placeholder="e.g. lower back gets sore after deadlifts">${a.injuries || ''}</textarea></div>
      <div class="bottom btnrow"><a class="btn secondary" href="${prev}" style="width:110px">Back</a><button class="btn primary grow" data-action="w-next" data-step="${step}">Next</button></div>
    </div>`;
    const ans = a[q.id] || {};
    return html`<div class="screen no-tabs">${head}
      <span class="pill sage">${q.area}</span>
      <div><h1 class="h1">${q.q}</h1><p class="lead">${q.sub}</p></div>
      <div class="stack">
        ${q.opts.map(([label, value], i) => html`<button type="button" class="choice" data-action="set-answer" data-q="${q.id}" data-i="${i}" aria-pressed="${pressed(ans.choice === i)}"><span>${label}</span>${when(ans.choice === i, checkCircle())}</button>`)}
        <div class="field"><label class="label" for="own-${q.id}">Or tell us in your own words</label><input class="input" id="own-${q.id}" data-model="w.${q.id}.text" placeholder="${q.ph}" value="${ans.text || ''}"></div>
      </div>
      <div class="bottom btnrow"><a class="btn secondary" href="${prev}" style="width:110px">Back</a><button class="btn primary grow" data-action="w-next" data-step="${step}" ${ans.choice != null || ans.text ? '' : 'disabled'}>Next</button></div>
    </div>`;
  }
  if (step === 'result') return renderResult(j);
  if (step === 'goal') return renderGoal(j);
  if (step === 'schedule') return renderSchedule(j);
  if (step === 'plan') return renderWorkoutDraft(j);
  return renderWorkout(WSTEPS[0]);
}

function renderEquipment(head, a, prev) {
  const t = a.training;
  const eq = t.equipment || {};
  const where = t.where || [];
  const whereBtn = (k, l) => html`<button type="button" class="choice" style="justify-content:center;min-height:48px" data-action="toggle-where" data-v="${k}" aria-pressed="${pressed(k === 'both' ? where.includes('home') && where.includes('gym') : where.includes(k) && !(k !== 'outdoors' && where.includes('home') && where.includes('gym')))}">${l}</button>`;
  const item = (k, l) => html`<button type="button" class="chip sm" data-action="toggle-eq" data-v="${k}" aria-pressed="${pressed(!!eq[k])}">${l}</button>`;
  const fac = t.facilities || {};
  const facBtn = (k, l) => html`<button type="button" class="chip sm" data-action="toggle-fac" data-v="${k}" aria-pressed="${pressed(!!fac[k])}">${l}</button>`;
  const home = where.includes('home');
  const gym = where.includes('gym');
  return html`<div class="screen no-tabs">${head}
    <div><h1 class="h1">Where will you train?</h1><p class="lead">Your plan only uses what you actually have.</p></div>
    <div class="grid2">${whereBtn('home', 'Home')}${whereBtn('gym', 'Gym')}${whereBtn('both', 'Both')}${whereBtn('outdoors', 'Outdoors / park')}</div>
    ${when(gym, () => html`<div class="card pad">
      <span class="label">Which gym?</span>
      <div class="chips">${[['commercial', 'Full gym'], ['society', 'Apartment / society gym'], ['box', 'CrossFit-style box']].map(([k, l]) => html`<button type="button" class="chip sm" data-action="set-gymtype" data-v="${k}" aria-pressed="${pressed(t.gymType === k)}">${l}</button>`)}</div>
      ${when(home, () => html`<span class="label">Which days are gym days?</span><div class="days">${WEEKDAYS.map(d => html`<button type="button" class="chip" data-action="toggle-gymday" data-v="${d}" aria-pressed="${pressed((t.gymWeekdays || []).includes(d))}" aria-label="${d}">${d[0]}</button>`)}</div>`)}
    </div>`)}
    ${when(home || !where.length, () => html`<div class="card pad">
      <span class="strong" style="font-size:13px">At home I have</span>
      <div class="chips">${item('dumbbells_adjustable', 'Adjustable dumbbells')}${item('dumbbells_fixed', 'Fixed dumbbells')}${item('kettlebell', 'Kettlebell')}${item('barbell', 'Barbell + plates')}${item('bands', 'Resistance bands')}${item('pullup_bar', 'Pull-up bar')}${item('bench', 'Bench')}${item('mat', 'Yoga mat')}${item('rope', 'Skipping rope')}${item('cardio', 'Treadmill / cycle / rower')}${item('bodyweight_only', 'Just my bodyweight')}</div>
      ${when(eq.dumbbells_adjustable, () => html`<div class="stack tight" style="border-top:1px solid var(--hair);padding-top:10px"><span class="small">Adjustable dumbbells</span><div class="grid3">
        ${[['min', 'From'], ['max', 'To'], ['step', 'Steps of']].map(([k, l]) => html`<div class="field"><label class="small" for="d${k}">${l}</label><div class="inputunit sm"><input id="d${k}" inputmode="decimal" data-model="eq.dumbbells_adjustable.${k}" value="${eq.dumbbells_adjustable[k]}"><span>kg</span></div></div>`)}</div></div>`)}
      ${when(eq.dumbbells_fixed, () => html`<div class="field"><label class="small" for="dfix">Fixed dumbbell weights (kg, comma separated)</label><input class="input" id="dfix" data-model="eq.dumbbells_fixed.weights" value="${(eq.dumbbells_fixed.weights || []).join(', ')}" placeholder="e.g. 5, 7.5, 10"></div>`)}
      ${when(eq.kettlebell, () => html`<div class="field"><label class="small" for="kb">Kettlebell weights (kg)</label><input class="input" id="kb" data-model="eq.kettlebell.weights" value="${(eq.kettlebell.weights || []).join(', ')}" placeholder="e.g. 12, 16"></div>`)}
      ${when(eq.barbell, () => html`<div class="field"><label class="small" for="bb">Total barbell load you have (kg)</label><div class="inputunit sm"><input id="bb" inputmode="decimal" data-model="eq.barbell.maxKg" value="${eq.barbell.maxKg || ''}"><span>kg</span></div></div>`)}
      ${when(eq.bands, () => html`<span class="small">Resistance bands</span><div class="seg">${['light', 'medium', 'heavy'].map(l => html`<button type="button" class="chip sm" data-action="toggle-band" data-v="${l}" aria-pressed="${pressed((eq.bands.levels || []).includes(l))}">${l[0].toUpperCase() + l.slice(1)}</button>`)}</div>`)}
      ${when(eq.cardio, () => html`<span class="small">Which machines?</span><div class="chips">${['treadmill', 'cycle', 'rower'].map(c => html`<button type="button" class="chip sm" data-action="toggle-cardio" data-v="${c}" aria-pressed="${pressed((eq.cardio || []).includes(c))}">${c[0].toUpperCase() + c.slice(1)}</button>`)}</div>`)}
      ${when(eq.bench, () => html`<span class="small">Bench type</span><div class="seg">${['flat', 'adjustable'].map(c => html`<button type="button" class="chip sm" data-action="set-bench" data-v="${c}" aria-pressed="${pressed(eq.bench === c)}">${c[0].toUpperCase() + c.slice(1)}</button>`)}</div>`)}
    </div>`)}
    <div class="stack tight"><span class="label">Nearby</span><div class="chips">${facBtn('park_track', 'Park or track')}${facBtn('stairs', 'Stairs')}${facBtn('pool', 'Pool')}${facBtn('cycle_route', 'Safe cycling route')}</div></div>
    <div class="field"><label class="label" for="eqo">Anything else?</label><input class="input" id="eqo" data-model="w.training.otherEquipment" placeholder="e.g. a 16 kg kettlebell, a recurve bow" value="${t.otherEquipment || ''}"></div>
    <div class="bottom btnrow"><a class="btn secondary" href="${prev}" style="width:110px">Back</a><button class="btn primary grow" data-action="w-next" data-step="equipment" ${where.length ? '' : 'disabled'}>Next</button></div>
  </div>`;
}

function renderResult(j) {
  const r = j.answers.assessment;
  const head = topbar(back(stepUrl('workout', 'training')), 'Workout · where you are', exitLink);
  if (!r || st.busy) return html`<div class="screen no-tabs">${head}<div class="stack loose" style="align-items:center;padding-top:80px"><div class="spinner" role="status" aria-label="Loading"></div><p class="lead">Reading your answers…</p></div>${when(st.error, () => errorBanner(st.error, 'retry-assess'))}</div>`;
  const tone = v => (v <= 0 ? 'var(--amber)' : 'var(--sage)');
  return html`<div class="screen no-tabs">${head}
    <div><h1 class="h1">Here's what we see</h1><p class="lead">Compared with people your age. Tap any rating to correct it.</p></div>
    <div class="overall"><div class="circle">${["Weak", "Avg", "Good", "Elite"][r.overall]}</div><div class="stack tight"><div class="strong" style="font-size:16px">Overall: ${RATINGS[r.overall]}</div><div class="small" style="font-size:13px">${r.explanation}</div></div></div>
    ${when(r.notice, () => html`<div class="note">${r.notice}</div>`)}
    <div class="stack tight">${AREAS.filter(x => r.areas[x.id] != null).map(x => {
      const v = r.areas[x.id];
      return html`<button type="button" class="rating" data-action="cycle-rating" data-v="${x.id}" aria-label="${x.label}: ${RATINGS[v]}. Tap to change.">
        <span class="strong" style="font-weight:500">${x.label}</span><span class="segs">${[0, 1, 2, 3].map(i => html`<i style="${i <= v ? `background:${tone(v)}` : ''}"></i>`)}</span><span class="small strong" style="text-align:right;color:${v <= 0 ? 'var(--amber-mid)' : 'var(--sage-mid)'}">${RATINGS[v]}</span></button>`;
    })}</div>
    <p class="small">Scale: Weak · Average · Good · Elite. Based on your answers and published norms for your age and gender, not a medical assessment.</p>
    <div class="bottom"><button class="btn primary block" data-action="go-step" data-kind="workout" data-step="goal">Looks right, continue</button></div>
  </div>`;
}

function renderGoal(j) {
  const r = j.answers.assessment || {};
  const g = r.goal || {};
  const chosen = j.answers.goalChoice;
  const purpose = (profile().purpose || {}).kind || 'general';
  const templates = ((S.data.goals && S.data.goals.templates[purpose]) || []).slice(0, 4);
  return html`<div class="screen no-tabs">
    ${topbar(back(stepUrl('workout', 'result')), 'Workout · your first goal', exitLink)}
    <div><h1 class="h1">We'd start here</h1><p class="lead">One goal at a time keeps a plan honest. Yours can be different.</p></div>
    <div class="card pad" style="${!chosen || chosen.recommended ? 'border:1.5px solid var(--primary)' : ''}">
      <span class="pill indigo">Recommended · ${g.weeks || 8} weeks</span>
      <div class="h2">${g.title || 'Build a base'}</div>
      <ul style="margin:0;padding-left:18px" class="stack tight">${(g.items || []).map(i => html`<li>${i}</li>`)}</ul>
      ${when(g.why, () => html`<p class="small"><span class="strong">Why:</span> ${g.why}</p>`)}
    </div>
    <div class="stack tight"><span class="label">Or pick your own</span>
      <div class="chips">${templates.map(t => html`<button type="button" class="chip sm" data-action="pick-goal" data-v="${t.id}" aria-pressed="${pressed(chosen && chosen.templateId === t.id)}">${t.title}</button>`)}<button type="button" class="chip sm dashed" data-action="own-goal" aria-pressed="${pressed(chosen && chosen.custom)}">Write my own</button></div>
      ${when(chosen && chosen.custom, () => html`<textarea class="textarea" data-model="w.goalChoice.title" rows="2" placeholder="e.g. 10 pull-ups and a 25 kg curl by March">${chosen.title || ''}</textarea>`)}
    </div>
    <div class="bottom btnrow"><button class="btn secondary grow" data-action="use-own-goal" ${chosen && !chosen.recommended && (chosen.title) ? '' : 'disabled'}>Use my own goal</button><button class="btn primary grow" data-action="accept-goal">Go with this</button></div>
  </div>`;
}

function renderSchedule(j) {
  const s = j.answers.schedule;
  const freq = [['daily', 'Daily'], ['alternate', 'Alternate days'], ['few', 'A few days a week'], ['weekends', 'Weekends only']];
  return html`<div class="screen no-tabs">
    ${topbar(back(stepUrl('workout', 'goal')), 'Workout · your week', exitLink)}
    <div><h1 class="h1">What can you stick to?</h1><p class="lead">Be realistic. A plan you keep beats a plan you admire.</p></div>
    <div class="stack tight"><span class="label">How often</span><div class="chips">${freq.map(([k, l]) => html`<button type="button" class="chip" data-action="set-freq" data-v="${k}" aria-pressed="${pressed(s.frequency === k)}">${l}</button>`)}</div></div>
    <div class="stack tight"><span class="label">Which days?</span><div class="days">${WEEKDAYS.map(d => html`<button type="button" class="chip" data-action="toggle-day" data-v="${d}" aria-pressed="${pressed(s.days.includes(d))}" aria-label="${d}">${d[0]}</button>`)}</div>
      <span class="small">${s.days.length} day${s.days.length === 1 ? '' : 's'} · ${s.days.map(d => WEEKDAY_SHORT[d]).join(', ') || 'none yet'}</span></div>
    <div class="stack tight"><span class="label">Time per session</span><div class="seg">${[20, 30, 45, 60, 90].map(m => html`<button type="button" class="chip" data-action="set-minutes" data-v="${m}" aria-pressed="${pressed(s.sessionMinutes === m)}">${m}</button>`)}</div><span class="small">minutes, including warm-up</span></div>
    <div class="field"><label class="label" for="snotes">Anything else about your week?</label><textarea class="textarea" id="snotes" data-model="w.schedule.notes" rows="2" placeholder="e.g. Mondays are long work days">${s.notes || ''}</textarea></div>
    <div class="bottom"><button class="btn primary block" data-action="build-workout" ${s.days.length ? '' : 'disabled'}>Build my plan</button></div>
  </div>`;
}

function renderWorkoutDraft(j) {
  const d = j.draft;
  const head = topbar(back(stepUrl('workout', 'schedule')), 'Workout · your plan', exitLink);
  if (!d) return html`<div class="screen no-tabs">${head}
    <div class="stack loose" style="align-items:center;padding-top:80px">${when(!st.error, () => html`<div class="spinner" role="status" aria-label="Building"></div>`)}<p class="lead">${st.status || 'Reading your answers…'}</p></div>
    ${when(st.error, () => errorBanner(st.error, 'build-workout'))}</div>`;
  const plan = d.plan;
  const lib = S.data.library;
  const open = st.openDay || Object.keys(plan.dayTypes)[0];
  const tomorrow = addDays(today(), 1);
  return html`<div class="screen no-tabs">${head}
    <div><h1 class="h1">${plan.goal && plan.goal.weeks ? `Your first ${plan.goal.weeks} weeks` : plan.name || 'Your plan'}</h1>
      <p class="lead">${Object.keys(plan.dayTypes).length} days a week${plan.sessionMinutes ? `, about ${plan.sessionMinutes} minutes` : ''}. Each exercise starts at your level and steps up as you progress.</p></div>
    <div class="stack tight">${WEEKDAYS.filter(w => plan.dayTypes[w]).map(w => {
      const exs = plan.exercises.filter(e => e.days.includes(w));
      if (w !== open) return html`<button type="button" class="card pad" style="flex-direction:row;align-items:center;justify-content:space-between;text-align:left" data-action="open-day" data-v="${w}">
        <span class="stack tight"><span class="strong">${WEEKDAY_SHORT[w]} · ${plan.dayTypes[w].label}</span><span class="small">${exs.map(e => (lib[e.exerciseId] || e).name).join(', ')}</span></span>${icon('down', 18)}</button>`;
      return html`<div class="section"><div class="head" style="background:var(--sage-tint);color:var(--sage-ink)"><span class="l">${WEEKDAY_SHORT[w]} · ${plan.dayTypes[w].label}</span><span class="r">${exs.length} exercises</span></div>
        ${exs.map(e => html`<div class="listrow"><span class="t"><span class="t1">${(lib[e.exerciseId] || e).name}</span><span class="t2">Level 1 of ${e.levels.length} · ${prescription(plan, e, { level: 1, sublevel: 1 }).main}</span></span><span class="small">→ ${e.target.text}</span></div>`)}</div>`;
    })}</div>
    <div class="sunk stack tight"><span class="strong" style="font-size:13px">How levels work</span><span class="small">Each level has four steps: 4×10 → 3×12 → 4×12 → 4×15 by default. Tap Progress when it feels easy, Regress when it doesn't.</span></div>
    ${when(d.warnings && d.warnings.length, () => html`<div class="note">${d.warnings.map(w => w.message).join(' · ')}</div>`)}
    <div class="bottom"><div class="small" style="text-align:center">Version ${versions('workout').length + 1} · starts tomorrow, ${longDate(tomorrow)}</div>
      <div class="btnrow"><button class="btn secondary" style="width:120px" data-action="adjust-draft" data-kind="workout">Adjust</button><button class="btn primary grow" data-action="accept-workout">Accept plan</button></div></div>
  </div>`;
}

// ---------- Step 6: food planner ----------
function renderFood(step) {
  const j = journeyState('food');
  const f = j.answers.food;
  const qn = { habits: 1, pattern: 2, extras: 3, likes: 4, fixed: 5, targets: 6 }[step];
  const prev = step === 'habits' ? (versions('workout').length ? '#/today' : '#/journey/start/track') : stepUrl('food', prevOf(FSTEPS, step));
  const head = html`${topbar(back(prev), qn ? `Food · question ${qn} of 6` : 'Food · your chart', exitLink)}`;
  const nextBtn = (label = 'Next', dis = false) => html`<div class="bottom btnrow"><a class="btn secondary" href="${prev}" style="width:110px">Back</a><button class="btn primary grow" data-action="f-next" data-step="${step}" ${dis ? 'disabled' : ''}>${label}</button></div>`;
  const city = (profile().location || {}).city;
  if (step === 'habits') {
    const restricted = f.dietType === 'nonveg' || f.dietType === 'eggetarian';
    return html`<div class="screen no-tabs">${head}
      <div><h1 class="h1">How do you eat?</h1><p class="lead">${city ? `${city}: we'll lean on what's in season and easy to get.` : "We'll lean on what's in season near you."}</p></div>
      <div class="stack tight"><span class="label">Diet</span><div class="chips">${DIETS.map(([k, l]) => html`<button type="button" class="chip" data-action="set-diet" data-v="${k}" aria-pressed="${pressed(f.dietType === k)}">${l}</button>`)}</div></div>
      ${when(restricted, () => html`<div class="stack tight"><span class="label">Days you avoid ${f.dietType === 'nonveg' ? 'non-veg or eggs' : 'eggs'}</span>
        <div class="days">${WEEKDAYS.map(d => html`<button type="button" class="chip" data-action="toggle-rday" data-v="${d}" aria-pressed="${pressed(f.restrictedDays.includes(d))}" aria-label="${d}">${d[0]}</button>`)}</div>
        <span class="small">${f.restrictedDays.length ? `${f.restrictedDays.map(d => WEEKDAY_SHORT[d]).join(', ')} · ${f.dietType === 'nonveg' ? 'vegetarian' : 'egg-free'} meals on these days` : 'None'}</span></div>`)}
      <div class="stack tight"><span class="label">Who cooks?</span><div class="chips">${[['self', 'I cook'], ['family', 'Family cooks'], ['cook', 'We have a cook'], ['order', 'Mostly order']].map(([k, l]) => html`<button type="button" class="chip" data-action="set-food" data-k="whoCooks" data-v="${k}" aria-pressed="${pressed(f.whoCooks === k)}">${l}</button>`)}</div></div>
      ${when(f.whoCooks === 'self', () => html`<div class="stack tight"><span class="label">Time to cook each day</span><div class="seg">${[[15, '15 min'], [30, '30 min'], [60, '1 hour'], [90, 'More']].map(([k, l]) => html`<button type="button" class="chip" data-action="set-food" data-k="cookingMinutes" data-v="${k}" data-num="1" aria-pressed="${pressed(f.cookingMinutes === k)}">${l}</button>`)}</div></div>`)}
      <div class="bottom"><button class="btn primary block" data-action="f-next" data-step="habits">Next</button><a class="linkbtn" style="justify-content:center" href="${stepUrl('food', 'describe')}">I'd rather describe my constraints</a></div>
    </div>`;
  }
  if (step === 'describe') return html`<div class="screen no-tabs">${topbar(back(stepUrl('food', 'habits')), 'Food · in your words', exitLink)}
    <div><h1 class="h1">Describe how you eat</h1><p class="lead">Diet, days you avoid things, meal times, what you like and dislike, who cooks, any meal you always eat the same way, and your protein or calorie goal.</p></div>
    <textarea class="textarea" data-model="f.constraintsText" rows="10" placeholder="e.g. Eggetarian, no eggs Tue/Thu/Sat. I eat between 11 am and 8 pm. Breakfast is always Greek yogurt with whey and fruit. Lunch is 6 chapatis. I want 100 g protein and a small deficit. Dinners should be enjoyable.">${j.answers.constraintsText || ''}</textarea>
    <div class="bottom"><button class="btn primary block" data-action="build-food" ${j.answers.constraintsText ? '' : 'disabled'}>Build my food chart</button></div></div>`;
  if (step === 'pattern') return html`<div class="screen no-tabs">${head}
    <div><h1 class="h1">When do you eat?</h1><p class="lead">Your meals will stay inside this window.</p></div>
    <div class="stack tight"><span class="label">Meals a day</span><div class="seg">${[2, 3, 4, 5].map(n => html`<button type="button" class="chip" data-action="set-food" data-k="mealsPerDay" data-v="${n}" data-num="1" aria-pressed="${pressed(f.mealsPerDay === n)}">${n}</button>`)}</div></div>
    <div class="grid2"><div class="field"><label class="label" for="ws">First meal</label><input class="input" id="ws" type="time" data-model="f.eatingWindow.start" value="${f.eatingWindow.start}"></div><div class="field"><label class="label" for="we">Last meal</label><input class="input" id="we" type="time" data-model="f.eatingWindow.end" value="${f.eatingWindow.end}"></div></div>
    <div class="stack tight"><span class="label">Fasting practices</span><div class="chips">${['None', 'Weekly fast', 'Ekadashi', 'Navratri', 'Ramadan', 'Intermittent fasting'].map(k => html`<button type="button" class="chip sm" data-action="toggle-fast" data-v="${k}" aria-pressed="${pressed(f.fasting.includes(k))}">${k}</button>`)}</div></div>
    ${nextBtn()}</div>`;
  if (step === 'extras') return html`<div class="screen no-tabs">${head}
    <div><h1 class="h1">Allergies and supplements</h1><p class="lead">So we never suggest something you can't have.</p></div>
    <div class="field"><label class="label" for="alg">Allergies or intolerances (optional)</label><input class="input" id="alg" data-model="f.allergies" placeholder="e.g. lactose, peanuts" value="${f.allergies || ''}"></div>
    <div class="stack tight"><span class="label">Supplements you take</span><div class="chips">${['Whey protein', 'Plant protein', 'Creatine', 'Multivitamin', 'Fish oil', 'None'].map(k => html`<button type="button" class="chip sm" data-action="toggle-supp" data-v="${k}" aria-pressed="${pressed(f.supplements.includes(k))}">${k}</button>`)}</div></div>
    ${when(!bigCity(), () => html`<div class="stack tight"><span class="label">What's easy to get locally?</span><div class="chips">${['Millets', 'Paneer', 'Curd', 'Eggs', 'Chicken', 'Fish', 'Soya', 'Sprouts', 'Seasonal greens', 'Fruit', 'Tofu', 'Oats'].map(k => html`<button type="button" class="chip sm" data-action="toggle-local" data-v="${k}" aria-pressed="${pressed(f.localItems.includes(k))}">${k}</button>`)}</div></div>`)}
    ${nextBtn()}</div>`;
  if (step === 'likes') {
    const items = likeItems(f);
    const done = st.likeIdx >= items.length;
    const it = items[st.likeIdx];
    const bucket = (arr, cls) => arr.map(n => html`<span class="${cls}">${n}</span>`);
    return html`<div class="screen no-tabs">${head}
      <div><h1 class="h1">What do you like?</h1><p class="lead">Quick taps. ${Math.min(st.likeIdx + 1, items.length)} of ${items.length} common ${region() ? regionName() + ' ' : ''}items. Skip any you're unsure about.</p></div>
      ${done ? html`<div class="likecard"><div class="n">All done</div><div class="small">Add anything we missed below.</div></div>` : html`<div class="likecard" aria-live="polite"><div class="n">${it.name}</div><div class="small">${it.note}</div></div>
        <div class="btnrow"><button class="btn secondary grow" data-action="like" data-v="dislike">Dislike</button><button class="btn secondary grow" data-action="like" data-v="neutral">Neutral</button><button class="btn sage grow" data-action="like" data-v="like">Like</button></div>`}
      <div class="stack tight"><span class="label">So far</span><div class="bucket">${bucket(f.likes, 'like')}${bucket(f.neutral, 'neutral')}${bucket(f.dislikes, 'dislike')}</div></div>
      <div class="field"><label class="label" for="miss">Anything we missed?</label><input class="input" id="miss" data-model="f.likesText" placeholder="e.g. love dosa, hate brinjal" value="${f.likesText || ''}"></div>
      ${nextBtn('Next')}</div>`;
  }
  if (step === 'fixed') return html`<div class="screen no-tabs">${head}
    <div><h1 class="h1">Any meal you always eat the same way?</h1><p class="lead">We'll keep it as it is and plan around it.</p></div>
    <textarea class="textarea" data-model="f.fixedMealsText" rows="6" placeholder="e.g. Breakfast at 11:00: 200 g Greek yogurt, 1 scoop whey, a banana. Lunch: 6 chapatis.">${f.fixedMealsText || ''}</textarea>
    <p class="small">Leave empty if every meal can change.</p>
    ${nextBtn()}</div>`;
  if (step === 'targets') {
    const t = planTargetsFor(f);
    return html`<div class="screen no-tabs">${head}
      <div><h1 class="h1">Your daily targets</h1><p class="lead">Suggested from your profile. Change them if your doctor or coach gave you numbers.</p></div>
      <div class="stack tight"><span class="label">Calories</span><div class="seg">${[['lose', 'Lose weight'], ['maintain', 'Maintain'], ['gain', 'Gain']].map(([k, l]) => html`<button type="button" class="chip" data-action="set-food" data-k="calorieIntent" data-v="${k}" aria-pressed="${pressed(f.calorieIntent === k)}">${l}</button>`)}</div>
        ${when(t, () => html`<span class="small">About ${t && t.kcal} kcal a day (maintenance ≈ ${t && t.maintenanceKcal}).</span>`)}</div>
      <div class="field"><label class="label" for="prot">Protein each day (at least)</label><div class="inputunit"><input id="prot" inputmode="numeric" data-model="f.proteinGMin" value="${f.proteinGMin || (t ? t.proteinGMin : '')}"><span>g</span></div></div>
      <div class="field"><label class="label" for="cdel">Calorie change from maintenance (optional)</label><div class="inputunit"><input id="cdel" inputmode="numeric" data-model="f.calorieDeltaKcal" placeholder="${t ? t.calorieDeltaKcal : ''}" value="${Number.isFinite(f.calorieDeltaKcal) ? f.calorieDeltaKcal : ''}"><span>kcal</span></div></div>
      <div class="bottom"><button class="btn primary block" data-action="build-food">Build my food chart</button></div></div>`;
  }
  if (step === 'chart') return renderChart(j);
  return renderFood('habits');
}
function regionName() { return { south: 'South Indian', north: 'North Indian', east: 'East Indian', west: 'West Indian', northeast: 'Northeast Indian' }[region()] || ''; }
function likeItems(f) {
  const foods = S.data.foods;
  if (!foods) return [];
  let list = isIndia() ? [...((region() && foods.india.regions[region()]) || []), ...foods.india.common] : foods.global;
  const forbidden = { vegetarian: /egg|chicken|fish|mutton|meat|pork/, eggetarian: /chicken|fish|mutton|meat|pork/, vegan: /egg|chicken|fish|mutton|meat|pork|dairy/, jain: /egg|chicken|fish|mutton|meat|pork|root_veg/ }[f.dietType];
  if (forbidden) list = list.filter(i => !forbidden.test(i.tags.join(',')));
  const seen = new Set();
  return list.filter(i => (seen.has(i.name) ? false : seen.add(i.name))).slice(0, 40);
}
function planTargetsFor(food) {
  const base = profile();
  if (!base.body || !base.body.dob) return null;
  const p = { ...base, food: { ...(base.food || {}), ...food, proteinGMin: Number(food.proteinGMin) || undefined, calorieDeltaKcal: food.calorieDeltaKcal === '' || food.calorieDeltaKcal == null ? undefined : Number(food.calorieDeltaKcal) } };
  const days = ((base.schedule && base.schedule.days) || []).length || 3;
  return computeTargets(p, { today: today(), trainingDaysPerWeek: days });
}

function renderChart(j) {
  const d = j.draft;
  const head = topbar(back(stepUrl('food', j.answers.constraintsText && !j.answers.food.likes.length ? 'describe' : 'targets')), 'Food · your chart', exitLink);
  if (!d) return html`<div class="screen no-tabs">${head}<div class="stack loose" style="align-items:center;padding-top:80px">${when(!st.error, () => html`<div class="spinner" role="status" aria-label="Building"></div>`)}<p class="lead">${st.status || 'Reading your answers…'}</p><p class="small">A 14-day chart takes about a minute.</p></div>${when(st.error, () => errorBanner(st.error, 'build-food'))}</div>`;
  const plan = d.plan;
  const cd = st.chartDay;
  const day = plan.days.find(x => x.cycleDay === cd);
  const meals = mealsForDay(plan, day);
  const tot = dayTotals(meals);
  const approvals = j.approvals || {};
  const wd = weekdayForCycleDay(plan.cycleStartWeekday, cd);
  const restricted = (j.answers.food.restrictedDays || []).includes(wd);
  return html`<div class="screen no-tabs">${head}
    <div><h1 class="h1">Your 14-day chart</h1><p class="lead">Approve, swap or dislike each meal. Dislikes won't come back.</p></div>
    <div class="row" style="overflow-x:auto;gap:6px;padding-bottom:2px">${plan.days.map(x => {
      const all = mealsForDay(plan, x).filter(m => !m.fixed);
      const ok = all.every(m => approvals[`${x.cycleDay}:${m.slot}`]);
      return html`<button type="button" class="chip" style="flex:none;width:46px;height:56px;border-radius:12px;padding:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;${x.cycleDay === cd ? 'background:var(--primary);border-color:var(--primary);color:var(--on-accent)' : ''}" data-action="chart-day" data-v="${x.cycleDay}" aria-label="Day ${x.cycleDay}${ok ? ', all approved' : ''}"><span style="font-size:11px;opacity:.85">${ok ? '✓' : 'Day'}</span><span style="font-size:16px;font-weight:600">${x.cycleDay}</span></button>`;
    })}</div>
    <div class="row between sunk" style="padding:10px 14px"><span class="strong" style="font-size:13px">${WEEKDAY_SHORT[wd]}${restricted ? ` · ${j.answers.food.dietType === 'nonveg' ? 'veg day' : 'egg-free day'}` : ''}</span><span class="small" style="font-size:13px">${tot.kcal.toLocaleString()} kcal · ${tot.proteinG} g protein (est.)</span></div>
    <div class="stack">${meals.map(m => {
      const k = `${cd}:${m.slot}`;
      const state = approvals[k];
      const x = mealMacros(m);
      return html`<div class="card pad">
        <div class="row between" style="align-items:flex-start"><div class="stack tight"><span class="small">${cap(m.slot)} · ${m.time}${m.fixed ? ' · fixed' : ''}</span><span class="strong" style="font-size:15px">${m.dish}</span>
          ${when(m.items && m.items.length, () => html`<span class="small">${m.items.map(i => (typeof i === 'string' ? i : `${i.name}${i.qty ? ` (${i.qty})` : ''}`)).join(', ')}</span>`)}</div><span class="small" style="white-space:nowrap">${x.kcal} kcal · ${x.proteinG} g</span></div>
        ${m.fixed ? '' : state ? html`<span class="pill sage">${icon('check', 14, 2.5)} ${state === 'swapped' ? 'Swapped' : 'Approved'}</span>` : html`<div class="btnrow">
          <button class="btn secondary sm grow" style="color:var(--sage-ink)" data-action="approve-meal" data-k="${k}">Approve</button>
          <button class="btn secondary sm grow" data-action="swap-meal" data-cd="${cd}" data-slot="${m.slot}">Swap</button>
          <button class="btn secondary sm grow" style="color:var(--amber-mid)" data-action="dislike-meal" data-cd="${cd}" data-slot="${m.slot}">Dislike</button></div>`}
        ${when(st.swapFor === k, () => swapList(m, k))}
      </div>`;
    })}</div>
    <div class="bottom btnrow"><button class="btn secondary" style="width:120px" data-action="chart-day" data-v="${cd < 14 ? cd + 1 : 1}">Next day</button><button class="btn primary grow" data-action="approve-all">Approve all 14 days</button></div>
  </div>`;
}
function swapList(m, k) {
  const alts = [...(m.alternatives || []), ...((st.swapAlts && st.swapAlts.key === k && st.swapAlts.list) || [])];
  return html`<div class="stack tight" style="border-top:1px solid var(--hair);padding-top:10px">
    ${alts.map((a, i) => html`<button type="button" class="listrow card flat" style="border:1px solid var(--border)" data-action="choose-alt" data-k="${k}" data-i="${i}"><span class="t"><span class="t1">${a.dish}</span><span class="t2">${mealMacros(a).kcal} kcal · ${mealMacros(a).proteinG} g protein</span></span>${icon('swap', 18)}</button>`)}
    ${st.swapAlts && st.swapAlts.loading ? html`<div class="status">Finding more ideas…</div>` : html`<button class="btn secondary sm" data-action="more-alts" data-k="${k}">More ideas</button>`}
  </div>`;
}
const cap = s => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);

// ---------- Step 7: done ----------
function renderDone(which) {
  const kinds = which.split('+').filter(Boolean);
  const w = versions('workout').slice(-1)[0], m = versions('meal').slice(-1)[0];
  const name = profile().name;
  const start = (w || m) ? (w || m).effectiveFrom : addDays(today(), 1);
  const single = kinds.length === 1;
  const other = kinds[0] === 'workout' ? 'food' : 'workout';
  const otherMissing = single && !versions(other === 'food' ? 'meal' : 'workout').length;
  return html`<div class="screen no-tabs">
    ${topbar(null, 'Step 7 of 7')}
    <div class="stack loose" style="padding-top:24px">
      <div class="ic sage" style="width:56px;height:56px;border-radius:16px;display:flex;align-items:center;justify-content:center">${icon('check', 28)}</div>
      <div><h1 class="h1">You're set${name ? ', ' + name : ''}</h1><p class="lead">${kinds.length > 1 ? 'Both plans start' : 'Your plan starts'} tomorrow. Today, rest and have a look around.</p></div>
      ${when(kinds.includes('workout') && w, () => html`<div class="card pad" style="flex-direction:row;align-items:center;gap:12px"><span class="ic sage" style="width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center">${icon('dumbbell')}</span><span class="stack tight"><span class="strong">Workout plan · v${w && w.version}</span><span class="small">${w && Object.keys(w.plan.dayTypes).map(d => WEEKDAY_SHORT[d]).join(', ')}${w && w.plan.sessionMinutes ? ` · ${w.plan.sessionMinutes} min` : ''}${w && w.plan.goal ? ` · ${w.plan.goal.title}` : ''}</span></span></div>`)}
      ${when(kinds.includes('food') && m, () => html`<div class="card pad" style="flex-direction:row;align-items:center;gap:12px"><span class="ic amber" style="width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center">${icon('bowl')}</span><span class="stack tight"><span class="strong">Food chart · v${m && m.version}</span><span class="small">14 days${m && m.plan.dailyTargets ? ` · ${m.plan.dailyTargets.proteinGMin} g protein` : ''}</span></span></div>`)}
      <div class="row small">${icon('cal', 18)} Starts ${longDate(start)}</div>
      <p class="small">Change anything any time with Coach. Your plans, answers and profile are saved on this device and in the AgentFit folder in your Google Drive.</p>
    </div>
    <div class="bottom">
      ${when(otherMissing, () => html`<button class="btn secondary block" data-action="go" data-href="${other === 'food' ? '#/journey/food/habits' : '#/journey/workout/upper'}">${other === 'food' ? 'Plan food now' : 'Plan workout now'}</button>`)}
      <button class="btn primary block" data-action="go" data-href="#/today">${otherMissing ? 'Later' : 'Go to Today'}</button>
      ${when(!otherMissing, () => html`<button class="linkbtn" style="justify-content:center" data-action="go" data-href="#/coach/new">Ask Coach something first</button>`)}
    </div>
  </div>`;
}

function renderExit() {
  return html`<div class="screen no-tabs">${topbar(back('javascript:history.back()'), 'Leave planning?')}
    <div class="stack loose" style="padding-top:24px"><h1 class="h1">Take a break?</h1><p class="lead">Your answers are saved. Nothing about your current plans changes. You can pick up exactly where you left off from Today.</p></div>
    <div class="bottom"><button class="btn primary block" data-action="go" data-href="#/today">Go to Today</button><button class="btn secondary block" data-action="history-back">Keep going</button></div></div>`;
}

// ---------------------------------------------------------------- actions
function kindOf(params) { return params[0] === 'food' ? 'food' : 'workout'; }
function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]] = o[keys[i]] ?? {};
  o[keys[keys.length - 1]] = value;
}
const numOrNull = v => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v));

export async function onInput(el, params) {
  const m = el.dataset.model;
  if (!m) return;
  const v = el.value;
  if (m.startsWith('pf.')) { st.pf[m.slice(3)] = v; return; }
  if (m.startsWith('health.')) {
    const h = { ...(profile().health || {}) };
    setPath(h, m.slice(7), v);
    await setProfile({ health: h });
    return;
  }
  if (m.startsWith('purpose.')) { await setProfile({ purpose: { ...(profile().purpose || {}), note: v } }); update(); return; }
  if (m.startsWith('w.')) {
    const j = journeyState('workout');
    const path = m.slice(2);
    if (/^(upper|back|lower|core|mobility|aerobic)\.text$/.test(path)) { const q = path.split('.')[0]; j.answers[q] = { ...(j.answers[q] || {}), text: v }; }
    else setPath(j.answers, path, v);
    persist('workout');
    if (/\.text$|goalChoice/.test(path)) update();
    return;
  }
  if (m.startsWith('eq.')) {
    const j = journeyState('workout');
    const [, item, field] = m.split('.');
    const eq = j.answers.training.equipment;
    if (field === 'weights') eq[item] = { ...(eq[item] || {}), weights: v.split(/[,\s]+/).map(Number).filter(x => x > 0) };
    else eq[item] = { ...(eq[item] || {}), [field]: numOrNull(v) };
    persist('workout');
    return;
  }
  if (m.startsWith('f.')) {
    const j = journeyState('food');
    const path = m.slice(2);
    if (path === 'constraintsText') { j.answers.constraintsText = v; persist('food'); update(); return; }
    const num = ['proteinGMin', 'calorieDeltaKcal'].includes(path);
    setPath(j.answers.food, path, num ? numOrNull(v) : v);
    persist('food');
    if (num) update();
  }
}

export const actions = {
  go: el => go(el.dataset.href),
  'history-back': () => history.back(),
  'set-gender': async el => { const b = { ...(profile().body || {}), gender: el.dataset.v }; await setProfile({ body: b }); },
  'save-profile': async () => {
    const pf = st.pf;
    const body = { ...(profile().body || {}), dob: pf.dob, heightCm: Number(pf.heightCm) || null, weightKg: Number(pf.weightKg) || null, genderText: pf.genderText || undefined };
    st.error = null;
    if (!body.dob) st.error = 'Please add your date of birth.';
    else if (ageOn(body.dob, today()) < 16) st.error = 'AgentFit is for people aged 16 and over.';
    else if (!body.gender) st.error = 'Please choose a gender option.';
    else if (!(body.heightCm > 100 && body.heightCm < 250)) st.error = 'Please enter your height in centimetres.';
    else if (!(body.weightKg > 25 && body.weightKg < 350)) st.error = 'Please enter your weight in kilograms.';
    if (st.error) { update(); return; }
    await setProfile({ name: pf.name.trim(), body, location: { country: pf.country.trim() || 'India', city: pf.city.trim(), region: null } });
    await setProfile({ location: { ...profile().location, region: region() } });
    st.pf = null;
    go('#/journey/start/health');
  },
  'consent-health': async () => { await setProfile({ health: { ...(profile().health || {}), consented: true, consentedAt: Date.now() } }); loadHealthFiles(); },
  'skip-health': () => go('#/journey/start/purpose'),
  'toggle-condition': async el => {
    const h = { ...(profile().health || {}) };
    const set = new Set(h.conditions || []);
    set.has(el.dataset.v) ? set.delete(el.dataset.v) : set.add(el.dataset.v);
    h.conditions = [...set];
    await setProfile({ health: h });
  },
  'delete-health-file': async el => {
    try { await drive.deleteFile(el.dataset.id); } catch { toast('Could not reach Google Drive. Try again.'); return; }
    await loadHealthFiles();
  },
  'set-purpose': async el => { await setProfile({ purpose: { ...(profile().purpose || {}), kind: el.dataset.v } }); },
  'purpose-next': async () => {
    const pu = profile().purpose || {};
    if (!pu.kind) await setProfile({ purpose: { ...pu, kind: 'general' } });
    go('#/journey/start/track');
  },
  'set-track': el => { st.track = el.dataset.v; update(); },
  'track-next': async () => {
    const t = st.track || 'both';
    const j = journeyState(t === 'food' ? 'food' : 'workout');
    if (t === 'both') j.then = 'food';
    await persist(t === 'food' ? 'food' : 'workout', j.step);
    go(t === 'food' ? stepUrl('food', j.step === 'chart' && !j.draft ? 'habits' : j.step) : stepUrl('workout', j.step === 'plan' && !j.draft ? 'schedule' : j.step));
  },
  'set-answer': async el => {
    const j = journeyState('workout');
    const q = el.dataset.q;
    if (q === 'current') j.answers.current = { ...(j.answers.current || {}), choice: el.dataset.v };
    else {
      const def = WQ.find(x => x.id === q);
      const i = Number(el.dataset.i);
      j.answers[q] = { ...(j.answers[q] || {}), choice: i, label: def.opts[i][0], value: def.opts[i][1] };
    }
    await persist('workout'); update();
  },
  'w-next': async el => {
    const step = el.dataset.step;
    const next = nextOf(WSTEPS, step);
    if (next === 'result') { journeyState('workout').answers.assessment = null; }
    await persist('workout', next);
    go(stepUrl('workout', next));
    if (next === 'result') runAssess();
  },
  'go-step': async el => { await persist(el.dataset.kind, el.dataset.step); go(stepUrl(el.dataset.kind, el.dataset.step)); },
  'toggle-where': async el => {
    const t = journeyState('workout').answers.training;
    let w = new Set(t.where || []);
    const v = el.dataset.v;
    if (v === 'both') { const both = w.has('home') && w.has('gym'); if (both) { w.delete('gym'); } else { w.add('home'); w.add('gym'); } }
    else if (v === 'outdoors') w.has('outdoors') ? w.delete('outdoors') : w.add('outdoors');
    else { const others = ['home', 'gym'].filter(x => x !== v); w.delete(others[0]); w.has(v) && !w.has(others[0]) ? w.delete(v) : w.add(v); }
    t.where = [...w];
    await persist('workout'); update();
  },
  'set-gymtype': async el => { journeyState('workout').answers.training.gymType = el.dataset.v; await persist('workout'); update(); },
  'toggle-gymday': async el => { const t = journeyState('workout').answers.training; t.gymWeekdays = toggle(t.gymWeekdays || [], el.dataset.v); await persist('workout'); update(); },
  'toggle-eq': async el => {
    const eq = journeyState('workout').answers.training.equipment;
    const k = el.dataset.v;
    const defaults = { dumbbells_adjustable: { min: 2, max: 24, step: 2 }, dumbbells_fixed: { weights: [] }, kettlebell: { weights: [] }, barbell: { maxKg: 60 }, bands: { levels: ['light', 'medium'] }, cardio: ['treadmill'], bench: 'flat' };
    if (eq[k]) delete eq[k];
    else { eq[k] = defaults[k] ?? true; if (k === 'bodyweight_only') for (const x of Object.keys(eq)) if (x !== k) delete eq[x]; else delete eq.bodyweight_only; }
    await persist('workout'); update();
  },
  'toggle-band': async el => { const eq = journeyState('workout').answers.training.equipment; eq.bands = { levels: toggle(eq.bands.levels || [], el.dataset.v) }; await persist('workout'); update(); },
  'toggle-cardio': async el => { const eq = journeyState('workout').answers.training.equipment; eq.cardio = toggle(eq.cardio || [], el.dataset.v); await persist('workout'); update(); },
  'set-bench': async el => { journeyState('workout').answers.training.equipment.bench = el.dataset.v; await persist('workout'); update(); },
  'toggle-fac': async el => { const t = journeyState('workout').answers.training; t.facilities = { ...(t.facilities || {}), [el.dataset.v]: !(t.facilities || {})[el.dataset.v] }; await persist('workout'); update(); },
  'retry-assess': () => runAssess(),
  'cycle-rating': async el => {
    const r = journeyState('workout').answers.assessment;
    r.areas[el.dataset.v] = (r.areas[el.dataset.v] + 1) % 4;
    const vals = Object.values(r.areas);
    r.overall = Math.round(vals.reduce((x, y) => x + y, 0) / vals.length);
    r.corrected = true;
    await persist('workout'); update();
  },
  'pick-goal': async el => {
    const purpose = (profile().purpose || {}).kind || 'general';
    const t = S.data.goals.templates[purpose].find(g => g.id === el.dataset.v);
    journeyState('workout').answers.goalChoice = { templateId: t.id, title: t.title, items: [t.detail], weeks: t.weeks };
    await persist('workout'); update();
  },
  'own-goal': async () => { journeyState('workout').answers.goalChoice = { custom: true, title: '' }; await persist('workout'); update(); },
  'use-own-goal': async () => { await persist('workout', 'schedule'); go(stepUrl('workout', 'schedule')); },
  'accept-goal': async () => {
    const j = journeyState('workout');
    j.answers.goalChoice = { ...(j.answers.assessment && j.answers.assessment.goal), recommended: true };
    await persist('workout', 'schedule'); go(stepUrl('workout', 'schedule'));
  },
  'set-freq': async el => {
    const s = journeyState('workout').answers.schedule;
    s.frequency = el.dataset.v;
    s.days = { daily: [...WEEKDAYS], alternate: ['MON', 'WED', 'FRI', 'SUN'], few: s.days.length && s.days.length < 6 ? s.days : ['TUE', 'THU', 'SAT'], weekends: ['SAT', 'SUN'] }[s.frequency];
    await persist('workout'); update();
  },
  'toggle-day': async el => { const s = journeyState('workout').answers.schedule; s.days = WEEKDAYS.filter(d => toggle(s.days, el.dataset.v).includes(d)); await persist('workout'); update(); },
  'set-minutes': async el => { journeyState('workout').answers.schedule.sessionMinutes = Number(el.dataset.v); await persist('workout'); update(); },
  'build-workout': () => buildPlan('workout'),
  'open-day': el => { st.openDay = el.dataset.v; update(); },
  'adjust-draft': async el => {
    const kind = el.dataset.kind;
    const j = journeyState(kind);
    S.coach.pendingDraft = { type: kind === 'food' ? 'meal' : 'workout', plan: j.draft.plan, summary: j.draft.summary };
    S.coach.prefill = kind === 'food' ? 'Can you change my draft food chart: ' : 'Can you adjust my draft workout plan: ';
    go('#/coach/new');
  },
  'accept-workout': async () => {
    const j = journeyState('workout');
    await commitWorkoutProfile(j);
    const v = await acceptDraft(j.draft, { summary: versions('workout').length ? 'Plan from the workout planner' : 'Initial plan' });
    await recordAnswers('workout', j.answers, v.version);
    st.draft.workout = null;
    toast(`Version ${v.version} starts tomorrow`);
    if (j.then === 'food' && !versions('meal').length) { const f = journeyState('food'); f.then = 'done-both'; await persist('food'); go(stepUrl('food', 'habits')); }
    else go('#/journey/done/workout');
  },
  // food
  'set-diet': async el => { const f = journeyState('food').answers.food; f.dietType = el.dataset.v; if (!['nonveg', 'eggetarian'].includes(f.dietType)) f.restrictedDays = []; await persist('food'); update(); },
  'toggle-rday': async el => { const f = journeyState('food').answers.food; f.restrictedDays = WEEKDAYS.filter(d => toggle(f.restrictedDays, el.dataset.v).includes(d)); await persist('food'); update(); },
  'set-food': async el => { const f = journeyState('food').answers.food; f[el.dataset.k] = el.dataset.num ? Number(el.dataset.v) : el.dataset.v; await persist('food'); update(); },
  'toggle-fast': async el => { const f = journeyState('food').answers.food; f.fasting = el.dataset.v === 'None' ? [] : toggle(f.fasting.filter(x => x !== 'None'), el.dataset.v); await persist('food'); update(); },
  'toggle-supp': async el => { const f = journeyState('food').answers.food; f.supplements = el.dataset.v === 'None' ? [] : toggle(f.supplements, el.dataset.v); await persist('food'); update(); },
  'toggle-local': async el => { const f = journeyState('food').answers.food; f.localItems = toggle(f.localItems, el.dataset.v); await persist('food'); update(); },
  'f-next': async el => { const next = nextOf(FSTEPS, el.dataset.step); if (next === 'likes') st.likeIdx = 0; await persist('food', next); go(stepUrl('food', next)); },
  like: async el => {
    const j = journeyState('food');
    const f = j.answers.food;
    const items = likeItems(f);
    const it = items[st.likeIdx];
    if (!it) return;
    for (const b of ['likes', 'neutral', 'dislikes']) f[b] = (f[b] || []).filter(x => x !== it.name);
    f[{ like: 'likes', neutral: 'neutral', dislike: 'dislikes' }[el.dataset.v]].push(it.name);
    st.likeIdx++;
    await persist('food'); update();
  },
  'build-food': () => buildPlan('food'),
  'chart-day': el => { st.chartDay = Number(el.dataset.v); st.swapFor = null; update(); window.scrollTo(0, 0); },
  'approve-meal': async el => { const j = journeyState('food'); j.approvals = { ...(j.approvals || {}), [el.dataset.k]: 'approved' }; await persist('food'); update(); },
  'swap-meal': el => { const k = `${el.dataset.cd}:${el.dataset.slot}`; st.swapFor = st.swapFor === k ? null : k; update(); },
  'choose-alt': async el => {
    const j = journeyState('food');
    const [cd, slot] = el.dataset.k.split(':');
    const day = j.draft.plan.days.find(d => d.cycleDay === Number(cd));
    const idx = day.meals.findIndex(m => m.slot === slot);
    const m = day.meals[idx];
    const alts = [...(m.alternatives || []), ...((st.swapAlts && st.swapAlts.key === el.dataset.k && st.swapAlts.list) || [])];
    const a = alts[Number(el.dataset.i)];
    day.meals[idx] = { ...a, slot: m.slot, time: m.time, alternatives: [{ ...m, alternatives: undefined }, ...(m.alternatives || []).filter(x => x !== a)].slice(0, 3) };
    j.approvals = { ...(j.approvals || {}), [el.dataset.k]: 'swapped' };
    st.swapFor = null; st.swapAlts = null;
    await persist('food'); update();
  },
  'more-alts': el => fetchAlternatives(el.dataset.k),
  'dislike-meal': async el => {
    const j = journeyState('food');
    const k = `${el.dataset.cd}:${el.dataset.slot}`;
    const day = j.draft.plan.days.find(d => d.cycleDay === Number(el.dataset.cd));
    const m = day.meals.find(x => x.slot === el.dataset.slot);
    j.answers.food.dislikes = [...new Set([...(j.answers.food.dislikes || []), m.dish])];
    api('POST', '/api/memory', { text: `dislikes ${m.dish}` }).catch(() => {});
    if ((m.alternatives || []).length) {
      const idx = day.meals.indexOf(m);
      day.meals[idx] = { ...m.alternatives[0], slot: m.slot, time: m.time, alternatives: m.alternatives.slice(1) };
      toast(`Replaced. "${m.dish}" won't be suggested again.`);
    } else { st.swapFor = k; fetchAlternatives(k); }
    await persist('food'); update();
  },
  'approve-all': async () => {
    const j = journeyState('food');
    await commitFoodProfile(j);
    const v = await acceptDraft(j.draft, { summary: versions('meal').length ? 'Chart from the food planner' : 'Initial food chart' });
    await recordAnswers('food', { ...j.answers, approvals: j.approvals || {} }, v.version);
    const both = j.then === 'done-both';
    st.draft.food = null;
    toast(`Version ${v.version} starts tomorrow`);
    go(both ? '#/journey/done/workout+food' : '#/journey/done/food');
  },
  'retry': () => update(),
};
export const changes = {
  'upload-health': async el => {
    const file = el.files && el.files[0];
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) { toast('That file is over 15 MB.'); return; }
    st.healthBusy = 'Saving to your Drive…'; update();
    try { await drive.uploadHealthFile(file); }
    catch { st.healthBusy = null; toast('Could not save to Google Drive. Check you are signed in.'); update(); return; }
    st.healthBusy = 'Reading the report on this device…'; update();
    const text = await extractText(file);
    const h = { ...(profile().health || {}) };
    h.excerpt = [h.excerpt, text].filter(Boolean).join('\n\n').slice(0, 4000);
    await setProfile({ health: h });
    st.healthBusy = null;
    await loadHealthFiles();
  },
  'share-health': async el => { await setProfile({ health: { ...(profile().health || {}), shareWithCoach: el.checked } }); },
};
const toggle = (arr, v) => (arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);

export async function onEnter(params) {
  st.error = null;
  if (params[0] === 'start' && params[1] === 'health' && (profile().health || {}).consented) loadHealthFiles();
  if (params[0] === 'workout' && params[1] === 'result' && !journeyState('workout').answers.assessment && !st.busy) runAssess();
  if (params[0] === 'workout' && params[1] === 'plan' && !journeyState('workout').draft && !st.busy) buildPlan('workout');
  if (params[0] === 'food' && params[1] === 'chart' && !journeyState('food').draft && !st.busy) buildPlan('food');
}
export function onLeave() { if (st.abort) { st.abort.abort(); st.abort = null; st.busy = false; } }

async function loadHealthFiles() {
  try { st.healthFiles = await drive.listHealthFiles(); } catch { st.healthFiles = []; }
  update();
}

// Client-side text extraction (HD-02). PDFs use pdf.js from cdnjs; images need typing for now.
async function extractText(file) {
  if (file.type !== 'application/pdf') return `[${file.name}: image saved. Type the key values above if you want the coach to use them.]`;
  try {
    if (!window.pdfjsLib) {
      await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
    const pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    let out = '';
    for (let i = 1; i <= Math.min(pdf.numPages, 6); i++) {
      const tc = await (await pdf.getPage(i)).getTextContent();
      out += tc.items.map(x => x.str).join(' ') + '\n';
    }
    return `[${file.name}] ` + out.replace(/\s+/g, ' ').trim().slice(0, 3000);
  } catch { return `[${file.name}: could not read the text. Type the key values above.]`; }
}

// ---------- AI calls ----------
async function runAssess() {
  const j = journeyState('workout');
  const b = profile().body || {};
  const answers = Object.fromEntries(['upper', 'back', 'lower', 'core', 'mobility', 'aerobic'].map(k => [k, j.answers[k] || null]));
  const computed = assess(S.data.norms, answers, { age: age(), gender: b.gender });
  st.busy = true; st.error = null; update();
  try {
    const r = await api('POST', '/api/journey/assess', { profile: mergedProfile(j), answers: { ...answers, current: j.answers.current, injuries: j.answers.injuries }, computed, ...aiRequestOptions() }, aiRequestOptions());
    j.answers.assessment = r;
    if (r.purposeNote) await setProfile({ purpose: { ...(profile().purpose || {}), interpreted: r.purposeNote } });
  } catch (e) {
    j.answers.assessment = { ...computed, explanation: `Overall you are ${RATINGS[computed.overall]} for your age.`, goal: null, notice: e.message, source: 'rules' };
    if (!j.answers.assessment.goal) {
      const purpose = (profile().purpose || {}).kind || 'general';
      const g = S.data.goals.templates[purpose][0];
      j.answers.assessment.goal = { title: g.title, items: [g.detail], weeks: g.weeks, why: '' };
    }
  }
  st.busy = false;
  await persist('workout');
  update();
}

function mergedProfile(j) {
  const p = structuredClone(profile());
  delete p.health;
  if (j && j.answers.training) p.training = j.answers.training;
  if (j && j.answers.schedule) p.schedule = j.answers.schedule;
  if (j && j.answers.food) p.food = { ...j.answers.food };
  if (j && j.answers.goalChoice) p.purpose = { ...(p.purpose || {}), goal: j.answers.goalChoice };
  if (j && j.answers.injuries) p.injuries = j.answers.injuries;
  return p;
}

async function buildPlan(kind) {
  const j = journeyState(kind);
  j.draft = null; st.error = null; st.busy = true; st.status = 'Reading your answers…';
  await persist(kind, kind === 'workout' ? 'plan' : 'chart');
  if (!location.hash.endsWith(kind === 'workout' ? '/plan' : '/chart')) go(stepUrl(kind, kind === 'workout' ? 'plan' : 'chart'));
  update();
  const ai = aiRequestOptions();
  const p = mergedProfile(j);
  const ctx = contextBundle('journey');
  const tomorrowWd = weekdayOf(addDays(today(), 1));
  const body = kind === 'workout'
    ? { type: 'workout', profile: p, assessment: j.answers.assessment, goal: j.answers.goalChoice, notes: [j.answers.schedule.notes, j.answers.injuries && `Injuries: ${j.answers.injuries}`].filter(Boolean).join('\n'), context: ctx, healthExcerpt: ctx.healthExcerpt, ...ai }
    : { type: 'meal', profile: p, constraintsText: j.answers.constraintsText || [j.answers.food.likesText, j.answers.food.fixedMealsText && `Fixed meals: ${j.answers.food.fixedMealsText}`].filter(Boolean).join('\n'), cycleStartWeekday: tomorrowWd, context: ctx, healthExcerpt: ctx.healthExcerpt, ...ai };
  st.abort = new AbortController();
  try {
    await stream('/api/journey/plan', body, {
      key: ai.key, signal: st.abort.signal,
      onEvent: (ev, data) => {
        if (ev === 'status') { st.status = data.text; update(); }
        if (ev === 'draft') { j.draft = data; st.chartDay = 1; persist(kind); update(); }
        if (ev === 'error') { st.error = data; update(); }
      },
    });
  } catch (e) { st.error = { code: e.code, message: e.message, actions: e.actions }; }
  st.busy = false; st.abort = null;
  if (!j.draft && !st.error) st.error = { code: 'no_plan', message: 'The connection ended before the plan was ready. Try again.', actions: ['retry'] };
  update();
}

async function fetchAlternatives(k) {
  const j = journeyState('food');
  const [cd, slot] = k.split(':');
  const day = j.draft.plan.days.find(d => d.cycleDay === Number(cd));
  const m = day.meals.find(x => x.slot === slot);
  st.swapAlts = { key: k, loading: true, list: [] }; update();
  const ai = aiRequestOptions();
  try {
    const r = await api('POST', '/api/journey/swap', { profile: mergedProfile(j), meal: m, weekday: weekdayForCycleDay(j.draft.plan.cycleStartWeekday, Number(cd)), exclude: [m.dish, ...(m.alternatives || []).map(a => a.dish), ...(j.answers.food.dislikes || [])], ...ai }, ai);
    st.swapAlts = { key: k, loading: false, list: r.alternatives };
    if (!r.alternatives.length) toast('No new ideas passed your diet rules. Try again.');
  } catch (e) { st.swapAlts = null; toast(e.message); }
  update();
}

async function commitWorkoutProfile(j) {
  const a = j.answers;
  const baselines = Object.fromEntries(['upper', 'back', 'lower', 'core', 'mobility', 'aerobic'].filter(k => a[k]).map(k => [k, { label: a[k].label || null, value: a[k].value ?? null, text: a[k].text || '' }]));
  const pu = profile().purpose || {};
  await setProfile({ training: a.training, schedule: a.schedule, baselines, injuries: a.injuries || '', currentTraining: a.current || null,
    assessment: a.assessment ? { areas: a.assessment.areas, overall: a.assessment.overall, assessedOn: today() } : null,
    purpose: { ...pu, goal: a.goalChoice || null } });
}
async function commitFoodProfile(j) {
  const f = { ...j.answers.food };
  if (j.answers.constraintsText) f.constraintsText = j.answers.constraintsText;
  await setProfile({ food: f });
}

export function resumeHref(kind) {
  const p = paused(kind);
  if (!p) return kind === 'food' ? '#/journey/food/habits' : '#/journey/workout/upper';
  return stepUrl(kind, p.step);
}
export function answersCount(kind) {
  const p = paused(kind);
  if (!p) return 0;
  const a = p.answers || {};
  if (kind === 'workout') return ['upper', 'back', 'lower', 'core', 'mobility', 'aerobic'].filter(k => a[k]).length + (a.training && (a.training.where || []).length ? 1 : 0) + (a.current ? 1 : 0);
  return FSTEPS.indexOf(p.step) + 1;
}
export function resetDraft(kind) { st.draft[kind] = null; }
export { WSTEPS, FSTEPS };
