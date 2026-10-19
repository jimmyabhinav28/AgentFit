# Weekly Fitness

A personal training and food app that runs as a web page on GitHub Pages and installs on Android and iPhone like a normal app. No server, no build step. Data is kept in the browser and in a private app folder in your own Google Drive.

## What's in the box

```
index.html             the app shell
css/styles.css         all styling
js/app.js              screens and interactions
js/plan.js             YOUR PLAN: exercises, ladders, days, meals, dinners  <- edit this to change the plan
js/store.js            saving, week and level arithmetic, merge
js/drive.js            Google sign-in and Drive sync
js/ai.js               optional AI coach (Claude, ChatGPT, Gemini with your own key)
js/config.js           Google client ID goes here
sw.js                  offline cache (bump VERSION after each change)
manifest.webmanifest   install-as-app settings
icons/                 app icons
```

## 1. Google Cloud setup (once, about 10 minutes, on a laptop)

1. Go to https://console.cloud.google.com and create a project, e.g. "Weekly Fitness".
2. **APIs & Services → Library**: search "Google Drive API" and click **Enable**.
3. **APIs & Services → OAuth consent screen**:
   - User type: **External**. App name: Weekly Fitness. Add your email as support and developer contact.
   - **Scopes**: add `openid`, `email`, `profile` and `https://www.googleapis.com/auth/drive.appdata`.
   - **Test users**: add your Gmail address (and anyone else who will use the app). Leave the app in *Testing*; up to 100 test users can sign in and nothing needs Google's review.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**.
   - Authorized JavaScript origins: `https://<your-github-username>.github.io`
   - Authorized redirect URIs: `https://<your-github-username>.github.io/<repo-name>/`  (keep the trailing slash)
   - Copy the **Client ID**.
5. Open `js/config.js` and paste it in place of `PASTE_YOUR_GOOGLE_CLIENT_ID_HERE`.

To test on your laptop before publishing, also add `http://localhost:8765` as an origin and `http://localhost:8765/` as a redirect URI, then run `python3 -m http.server 8765` inside the folder and open http://localhost:8765/.

## 2. Publish on GitHub Pages

1. Create a new repository on GitHub, e.g. `fitness`.
2. Upload every file and folder from this package (drag and drop works on github.com).
3. **Settings → Pages → Build and deployment**: Source = *Deploy from a branch*, Branch = `main`, folder = `/ (root)`. Save.
4. After a minute the app is live at `https://<your-github-username>.github.io/fitness/`.

## 3. Install on a phone

- **Android (Chrome)**: open the link, accept the "Install app" prompt, or use menu → *Add to Home screen*.
- **iPhone (Safari)**: open the link, tap Share, then *Add to Home Screen*.
- Tap **Continue with Google**, allow Drive access. Week 1 starts on the Monday of the week you first sign in.

## Everyday use

- The app opens on today. Arrows and the day strip move within the current week only.
- Tick exercises and meals on today or earlier days of the week. Future days are view-only.
- **Progress / Regress** move an exercise one level up or down and restart its 4-week ramp. Left alone, every exercise climbs one level each 4 weeks on its own until it reaches its target.
- The **i** button beside an exercise explains the month in plain English.
- **Swap dinner** offers alternatives that respect the egg / no-egg rule for that day.
- Settings (gear icon): your numbers for the calorie target, trail-mix grams, AI coach, sync, export/import.

## Changing the plan

Everything lives in `js/plan.js`: exercise names, ladders, which exercises run on which day, the 4-week schemes and their notes, meals and dinners. After editing, bump `VERSION` in `sw.js` so installed phones refresh.

## AI coach (optional)

Chat subscriptions (Claude Pro/Max, ChatGPT Plus, Google AI Pro) cannot be linked to a third-party web app. Two options:

- Paste an API key in Settings: **Claude** (console.anthropic.com), **ChatGPT** (platform.openai.com) or **Gemini** (aistudio.google.com, which has a free tier). Calls go straight from your browser to the provider; the key is stored in your browser and in your Drive file only. Set a spending limit on the provider's dashboard.
- Or tap **Copy for chat** and paste the text into claude.ai, ChatGPT or Gemini. That uses your subscription.

## Privacy

The app requests only `drive.appdata`, a hidden folder that only this app can read or write. It cannot see any other file in your Drive. Sign out from Settings removes the copy on that device; the Drive copy stays.

## Troubleshooting

- **"Setup needed" on the sign-in button**: `js/config.js` still has the placeholder.
- **Google shows "redirect_uri_mismatch"**: the redirect URI in step 1.4 must match the page URL exactly, trailing slash included.
- **Google shows "access blocked / app not verified"**: add your email under Test users on the consent screen.
- **Changes don't show on the phone**: bump `VERSION` in `sw.js`, then close and reopen the app.
- **Developer mode without Google**: in the browser console run `localStorage.setItem('fit.devBypass','1')` and reload.
