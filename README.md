# Kagyu Tibetan — sentence tiles for Classical Tibetan

A static web app (plain HTML/CSS/JS, ES modules, no build step) for learning
Classical Tibetan by assembling sentences from tiles. Content comes from the
Rangjung Yeshe Institute *Classical Tibetan Grammar Handbook* (TLAN 101),
lessons 1–7: 744 words and 768 sentences. Interface and translations in
English, Russian, German, French and Polish (English is the textbook's
language; the other four are machine translations from it).

Live: https://kotstantin108.github.io/Kagyu-tibetan/

## What it does

- **Three exercises** on the same sentence: assemble it from word or syllable
  tiles, pick its meaning among four translations, or type it in Wylie.
- **One new word at a time.** The picker prefers sentences with exactly one
  unknown word; the first lesson starts with every translation open.
- **Spaced repetition.** A word learnt today comes back after 1, 3, 7, 14, 30,
  60 and 120 days; a mistake or a peek at the translation resets it. Reviews
  alternate with new sentences.
- **Hard words** (misplaced more than once) are listed on the progress screen
  and can be practised on their own (`#/play/hard`).
- **Grammar reference**: the textbook's notes by lesson, each with examples.
- **Dictionary** with search, example sentences, review dates and manual
  "known / learning" marks, including "mark the whole lesson".
- **Streak**: three sentences a day keep it alive.
- **Offline and installable** (PWA): everything, including the Tibetan font,
  is cached by a service worker.
- **Dark theme**, keyboard shortcuts (1–9, Backspace, Enter, H), Wylie under
  the tiles as an option, 44px tap targets, no horizontal scroll at 360px.
- **Progress stays on the device**; move it with a file, a text code (settings
  → "Move to another device"), or optional Google Drive sync.
- **Report a problem** links open a prefilled GitHub issue for a sentence or
  a word.

## Run locally

```
npx serve site            # or: python -m http.server -d site 8000
node scripts/validate.mjs # check the course data
npm test                  # engine and i18n tests (node:test)
npm run smoke             # browser smoke test (needs: npm i -D playwright && npx playwright install chromium)
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
  smoke.mjs         Playwright smoke test used in CI
  lib/wylie.mjs     re-exports site/src/engine/wylie.js for the scripts
  tools/pdf-tibetan-text.py  recovers Tibetan text from the textbook PDFs
  tools/make-icon.py         builds icons/icon.svg from the font's glyph outlines
site/
  index.html, styles.css, config.js, manifest.webmanifest, sw.js
  fonts/            Noto Serif Tibetan (OFL)
  icons/            app icons
  data/             words.json, sentences.json, sets.json, sentences.generated.json
  src/app.js        bootstrap, theme, hash router (#/play #/play/hard #/dict #/grammar #/stats #/settings)
  src/engine/       pure logic: next.js, progress.js, streak.js, check.js, merge.js, tib.js, wylie.js, hard.js
  src/screens/      play, onboarding, dict, grammar, stats, settings
  src/i18n/         ru.js en.js de.js fr.js pl.js (+ a test that keys match)
  src/sync.js       optional Google Drive sync
  src/transfer.js   progress <-> text code
  src/report.js     "report a problem" issue links
.github/workflows/deploy.yml  validate + tests + smoke test, then publish site/ to GitHub Pages
```

## Data model notes

- A sentence is a list of word ids; its Tibetan text is the concatenation of
  the words' `tib`. The final shad is the service token `shad`.
- Particles that merge with an open syllable (འི ས ར འོ འམ འང) are words with
  `fused: true`; `renderTib()` in `site/src/engine/tib.js` glues them to the
  previous word (`བླ་མ་` + `འི་` → `བླ་མའི་`).
- `trOrigin` tells whether a translation comes from the textbook or from us
  (`machine`). `CONTENT_REVIEW.md` lists everything a reviewer should check.
- Progress (`tib-progress`, `schemaVersion: 1`): per word `status`
  (`new / learning / known`), `seen`, `errors`, review `level` and `due` day;
  solved sentences; streak; settings (language, theme, tile mode, exercise,
  Wylie under tiles). Older records without the review fields load fine.
- The engine (`next.js`) picks, in order: cold-start phrases, focused practice,
  a review sentence whose words are all known and some due, a sentence with
  exactly one unknown word, the sentence with the fewest unknown words. Two
  reviews never follow each other while new material exists.

## Font

The handbook-style typeface is **Noto Serif Tibetan**, self-hosted in
`site/fonts/` under the SIL Open Font License. (Noto *Sans* Tibetan has been
retired upstream and is no longer served by Google Fonts; the CSS font stack
still lists it, then Kailasa, Microsoft Himalaya and Jomolhari as fallbacks.)

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
   GOOGLE_CLIENT_ID: '1234567890-abc.apps.googleusercontent.com',
   ```
6. Commit and push. The settings screen now shows the sync block.

What it does: `progress.json` is stored in the hidden `appDataFolder` of the
user's Drive (the app cannot see other files). Sync runs on sign-in, when the
tab becomes visible and a few seconds after changes. Records are merged per
word and per sentence by `updatedAt`; the streak keeps the best value and the
latest day. If the token cannot be refreshed silently the status shows "Sync
paused, sign in again" and local work continues.

## Deploy

Pushing to `main` runs the validator, the unit tests and the browser smoke
test, stamps the commit hash into `site/config.js` (shown in settings and
used as the service-worker cache name), then publishes `site/` to GitHub
Pages (Settings → Pages → Source: GitHub Actions). All paths are relative, so
the site also works from a sub-path such as `https://<user>.github.io/<repo>/`.
