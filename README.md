# Kagyu Tibetan — sentence tiles for Classical Tibetan

A static web app (plain HTML/CSS/JS, ES modules, no build step) for learning
Classical Tibetan by assembling sentences from tiles. Content comes from the
Rangjung Yeshe Institute *Classical Tibetan Grammar Handbook* (TLAN 101),
lessons 1–7: 744 words and 768 sentences. Interface and translations in
English, Russian, German, French and Polish (English is the textbook's
language; the other four are machine translations from it).

Live: https://kotstantin108.github.io/Kagyu-tibetan/

## Run locally

```
npx serve site            # or: python -m http.server -d site 8000
node scripts/validate.mjs # check the course data
npm test                  # engine and i18n tests (node:test)
```

Open http://localhost:3000 (or :8000). Progress is stored in `localStorage`
under the key `tib-progress`.

## Layout

```
content/            authoring files (pipe-separated text, UTF-8)
  sets.tsv          lesson list
  words*.tsv        dictionary: tib | en | ru | pos | page | flags
  sentences*.tsv    sentences: page | tib | enOrigin | en | ru | noteEn | noteRu
  lang-<xx>.tsv     de/fr/pl translations keyed by the English text
  review-notes.md   hand-written notes that go into CONTENT_REVIEW.md
scripts/
  build-content.mjs builds site/data/*.json and CONTENT_REVIEW.md from content/
  validate.mjs      checks site/data/*.json (exit code 1 on errors)
  lang-template.mjs writes/refreshes content/lang-<xx>.tsv with missing strings
  lib/wylie.mjs     Unicode Tibetan -> Wylie
  tools/pdf-tibetan-text.py  recovers Tibetan text from the textbook PDFs
site/
  index.html, styles.css, config.js
  data/             words.json, sentences.json, sets.json, sentences.generated.json
  src/app.js        bootstrap, hash router (#/play #/dict #/stats #/settings)
  src/engine/       pure logic: next.js, progress.js, streak.js, check.js, merge.js, tib.js
  src/screens/      play, dict, stats, settings
  src/i18n/         ru.js en.js de.js fr.js pl.js (+ a test that keys match)
  src/sync.js       optional Google Drive sync
.github/workflows/deploy.yml  validate + test, then publish site/ to GitHub Pages
```

## Data model notes

- A sentence is a list of word ids; its Tibetan text is the concatenation of
  the words' `tib`. The final shad is the service token `shad`.
- Particles that merge with an open syllable (འི ས ར འོ འམ འང) are words with
  `fused: true`; `renderTib()` in `site/src/engine/tib.js` glues them to the
  previous word (`བླ་མ་` + `འི་` → `བླ་མའི་`).
- `trOrigin` tells whether a translation comes from the textbook or from us
  (`machine`). `CONTENT_REVIEW.md` lists everything a reviewer should check.
- Progress (`tib-progress`, `schemaVersion: 1`): word statuses
  `new / learning / known`, solved sentences, streak and settings. The engine
  picks sentences with exactly one unknown word, falls back to the fewest
  unknown words, and starts with the first lesson's phrases with all
  translations open. A day counts towards the streak after 3 solved sentences.

## Optional Google Drive sync

The app works fully without signing in. To enable sync between devices:

1. Open https://console.cloud.google.com/ and create a project (or pick one).
2. **APIs & Services → Library**: enable **Google Drive API**.
3. **APIs & Services → OAuth consent screen**: choose *External*, fill in the
   app name and your e-mail, add the scope
   `https://www.googleapis.com/auth/drive.appdata`, and add yourself as a test
   user (or publish the app later).
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**,
   type **Web application**. Under *Authorized JavaScript origins* add:
   - `http://localhost:3000` (and any other local port you use, e.g. `http://localhost:8000`)
   - `https://<your-github-user>.github.io`
   No redirect URI is needed (the token client uses a popup).
5. Copy the client ID into `site/config.js`:
   ```js
   window.TIB_CONFIG = { GOOGLE_CLIENT_ID: '1234567890-abc.apps.googleusercontent.com' };
   ```
6. Commit and push. The settings screen now shows the sync block.

What it does: `progress.json` is stored in the hidden `appDataFolder` of the
user's Drive (the app cannot see other files). Sync runs on sign-in, when the
tab becomes visible and a few seconds after changes. Records are merged per
word and per sentence by `updatedAt`; the streak keeps the best value and the
latest day. If the token cannot be refreshed silently the status shows "Sync
paused, sign in again" and local work continues.

## Deploy

Pushing to `main` runs the validator and the tests, then publishes `site/` to
GitHub Pages (Settings → Pages → Source: GitHub Actions). All paths are
relative, so the site also works from a sub-path such as
`https://<user>.github.io/<repo>/`.
