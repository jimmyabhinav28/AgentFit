# AgentFit

AgentFit is a progressive web app where people plan their workouts and meals by answering a short guided questionnaire and chatting with an AI coach, then follow and track the plan day by day.

- **Requirements:** project doc `claude/AgentFit-requirements.md` (v0.7)
- **Mockups:** the "AgentFit Journey" design canvas, indexed in `claude/AgentFit-ui-mockups.md`
- **The earlier personal app** is kept in `legacy/` for reference. It is no longer served.

## How it fits together

```
Browser (PWA, public/)                     Cloudflare Worker (worker/)            AI provider
───────────────────────                    ──────────────────────────             ───────────
Journey, Today, Progress, Coach,  ──API──▶ auth · agent loop · tools ──────────▶ Anthropic / OpenAI / Gemini
Settings, Plans, Exercise info             plan validation · usage caps           (AgentFit's key, or the
IndexedDB (offline-first)                  memory · summaries · admin              user's own key per request)
      │                                            │
      ▼                                            ▼
User's Google Drive: "AgentFit" folder    Cloudflare D1 (SQLite)
plans + versions, logs, levels,            accounts, chats, memory notes,
planner answers, health reports            usage and caps, credits ledger
```

- **One Worker** serves both the static app and the API on the same origin, so there is no CORS and only one thing to deploy.
- **Plans, logs, planner answers and health reports live in each user's own Google Drive**, in a visible **AgentFit** folder, plus a copy on the device. The Worker is stateless for them: the app sends the relevant plan and logs with each AI request. The folder holds:
  - `agentfit-data.json`: the synced data (profile, plan versions, logs, levels, answers).
  - `planner-answers.json`: a readable copy of the workout and food planner answers.
  - `About this folder.txt`.
  - `Health reports/`: reports uploaded in the Health step.

  The app finds the folder by a hidden tag, so users can rename or move it.
- **The AI never decides alone.** Every plan the AI produces goes through the validator in `public/js/core/validate.js`. It checks equipment and load steps, the 5-exercises-a-day cap, diet type and restricted days, the eating window, dislikes, calorie and protein targets, and safety floors. If anything fails, the errors go back to the model to fix.
- **Plan versions** are integers starting at 1. An accepted plan starts the next day. Today always renders the version in effect on that date.

## Folder layout

```
public/                  the PWA (served as static assets)
  index.html, sw.js, manifest.webmanifest, _headers (CSP), admin.html
  css/app.css            design tokens from the mockups, light and dark
  data/                  exercise library, strength norms, goal templates, regional foods
  js/core/               shared logic used by both the app and the Worker:
                         dates, plans & ladders, validator, equipment, nutrition, norms, diffs, merge
  js/screens/            journey, today, progress, coach, settings, plans, misc (welcome, exercise, tutorial)
  js/store.js            local-first state, Drive sync, plan acceptance
worker/                  the API: auth, chat, journey, providers, agent loop, tools, memory, usage, admin
migrations/              D1 schema
tools/                   data builders, fake AI for local runs, eval runner
test/                    unit and integration tests (node --test)
legacy/                  the earlier single-user app
```

## Run it locally

You need Node.js 20 or newer.

```bash
npm install
cp .dev.vars.example .dev.vars          # then edit it, see below
npm run db:migrate:local
npm run dev                             # http://localhost:8787
```

In `.dev.vars`:
- `SESSION_SECRET`: any random string of 32 or more characters.
- `PLATFORM_API_KEY`: your Anthropic API key (the "AgentFit credits" mode uses it).
- `DEV_AUTH=1`: shows a **Developer sign-in** button on localhost, so you can try the app without Google.

**Without spending tokens:** run `node tools/fake-ai.js` in a second terminal and add `ANTHROPIC_BASE_URL=http://localhost:8799` to `.dev.vars`. The fake returns one fixed plan, so the validator rejects it for some answers (for example bodyweight-only users). That is expected.

**Google sign-in and Drive locally:** add `http://localhost:8787` to the OAuth client's Authorized JavaScript origins and `http://localhost:8787/` to its redirect URIs (see Google setup below).

## Tests

```bash
npm test
```

There are 19 tests:
- **Core:** dates, versions, the 14-day cycle, ladders, prescriptions, the validators, equipment, targets, diffs and merging.
- **Worker:** the full flow in Node with SQLite standing in for D1 and a scripted fake AI. It covers sign-in, the starter credits, the profile (health is never stored), assessment, plan builds that recover from validator errors, chat with memory and titles, revisions with diffs, accepting a plan, meal swaps, wrong API keys, daily caps, the admin view, export and account deletion.
- **Providers:** streaming and tool-call parsing for OpenAI and Gemini, plus how provider errors map to messages.
- **Drive:** the AgentFit folder against a fake Drive API: creating it, finding it after a rename, the data and answers files, health reports, and deleting everything.

### Model evals (do this before going live)

The requirements say a model joins the allowlist only after it passes the plan evals (§12.3). This needs a real API key:

```bash
npm run dev                              # with a real PLATFORM_API_KEY and DEV_AUTH=1
node tools/eval.js                       # platform model
node tools/eval.js --provider openai --model gpt-5-mini --key sk-...   # a BYOK model
```

It runs six personas through workout and food planning and reports pass/fail, retries, time and output tokens. The personas include bodyweight-only, the gym/home split, vegan with a peanut allergy, Jain with a knee injury, archery plus sprint, and your own eggetarian profile. Remove any model that fails from `MODEL_ALLOWLIST_JSON` (or `worker/config.js`).

## Deploy to Cloudflare (about 20 minutes)

1. **Cloudflare account:** create one (the free plan is fine), then run `npx wrangler login`.
2. **Database:**
   ```bash
   npx wrangler d1 create agentfit
   ```
   Paste the `database_id` it prints into `wrangler.toml`, then run:
   ```bash
   npm run db:migrate
   ```
3. **Secrets:**
   ```bash
   npx wrangler secret put SESSION_SECRET      # 40+ random characters
   npx wrangler secret put PLATFORM_API_KEY    # Anthropic API key for credits mode
   npx wrangler secret put ALERT_WEBHOOK_URL   # optional: Slack or Discord webhook for spend alerts
   ```
4. **Settings:** check the `[vars]` block in `wrangler.toml`: `ADMIN_EMAILS`, the platform model, and the caps. `GLOBAL_DAILY_USD_CAP` is your hard ceiling on AI spend per day.
5. **Deploy:** run `npm run deploy`. You get `https://agentfit.<your-subdomain>.workers.dev`.
6. **Custom domain (optional):** Workers & Pages → agentfit → Settings → Domains & Routes.
7. **Google:** add the new origin to Google Cloud (below), then sign in.

Setting `DEV_AUTH` to `"0"` (the default in `wrangler.toml`) keeps developer sign-in off in production.

### Google Cloud setup

Use the same project and OAuth client as the old app (`public/js/config.js` already has its client ID):
- **APIs & Services → Credentials → your Web client:**
  - Add your production origin, for example `https://agentfit.example.com`, to Authorized JavaScript origins.
  - Add the same address with a trailing `/` to Authorized redirect URIs.
- **OAuth consent screen:** scopes `openid`, `email`, `profile`, `.../auth/drive.file` (the AgentFit folder: the app can only see files it created) and `.../auth/drive.appdata` (only to import the earlier app's backup). Make sure the Google Drive API is enabled. In *Testing* mode, up to 100 test users can sign in. To open it to everyone, publish the app and complete Google's verification, which needs a privacy policy URL and a home page.
- The Worker checks that each Google token was issued to the client ID in `GOOGLE_CLIENT_ID` (`wrangler.toml`).

### Cheaper and safer AI traffic (optional)

Set `ANTHROPIC_BASE_URL` (and `OPENAI_BASE_URL`, `GEMINI_BASE_URL`) to a **Cloudflare AI Gateway** URL. This gives you request logs, caching and rate limits in front of the providers, with no code change.

## What it costs to run

- **Hosting:** Workers, static assets and D1 fit the free tier for the first thousand or so users. The paid Workers plan is $5 a month if you outgrow it.
- **AI in v1 is paid by you** in credits mode, because nothing is deducted from the 100 starter credits.
- **Cost controls:** the per-user daily caps and the global daily cap (`GLOBAL_DAILY_USD_CAP`, default $3 a day) bound that spend. The admin page shows spend by day, model and user. BYOK users cost you only the small background calls (memory notes, chat titles and summaries).
- **Prompt caching:** the coach's instructions and the user's profile are cached on Anthropic, so long chats cost less.

## Admin

Open `/admin.html` while signed in with an email listed in `ADMIN_EMAILS`. It shows:
- AI spend, users, top users today and users hitting caps.
- Spend alerts.
- Custom exercises waiting for review.
- Broken video alerts, with a "check now" button. A weekly cron also checks.
- The model allowlist.

To add exercises or videos, edit `tools/build-library.py`, run `npm run build:data`, then deploy.

## Release checklist

1. Bump `VERSION` in `public/sw.js` so installed phones pick up the new files.
2. Run `npm test`, and `node tools/eval.js` if prompts or models changed.
3. Run `npm run db:migrate` if there is a new migration.
4. Run `npm run deploy`.

## Not in this release

- **Deferred billing items:** purchases, the monthly fee, and deducting credits.
- **Email magic-link sign-in:** it needs an email provider. Google sign-in only for now.
- **OCR for photographed health reports:** PDFs are read on the device; for images, the user types the key values.
- **Exercise videos:** the library has 91 exercises with instructions and an empty `videos` list ready for curation.
- **Separate questionnaires for endurance and general fitness:** everyone answers the same 8 questions. The AI weights the plan by the stated purpose.
- **Importing from the old app:** this gives Coach a summary of past levels and ticks. It does not convert the old hard-coded plan.
