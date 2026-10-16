# Kagyu Tibetan — sentence tiles for Classical Tibetan

A static web app (plain HTML/CSS/JS, ES modules, no build step) for learning
Classical Tibetan by assembling sentences from tiles. Content comes from the
Rangjung Yeshe Institute *Classical Tibetan Grammar Handbook* (TLAN 101,
lessons 1–7) and from the exercises of lessons 1–11 of Joanna Bialek's
*A Textbook in Classical Tibetan* (Routledge 2022): 1005 words and 939
sentences in 18 sets. Interface and translations in
English, Russian, German, French and Polish (English is the default and the
textbook's language; the other four are machine translations from it).

Live: https://tibetan.itjoy.space/

(The old address https://kotstantin108.github.io/Kagyu-tibetan/ shows the app
with a "we moved" banner until **2026-10-27**, then becomes a redirect; progress
does not travel between the two addresses by itself, use Settings → "Move to
another device".)

## What it does

- **Four exercises** on the same sentence: assemble it from word or syllable
  tiles, pick its meaning among four translations, pick the Tibetan sentence
  for a translation (recall), or type it in Wylie.
- **Reading course** (`#/read`) for learners who do not read the script yet:
  the thirty letters, the vowel signs, subjoined and superscribed letters,
  prefixes and suffixes, then real syllables from the course. Each card shows
  a syllable and four Wylie spellings; twelve cards make a round, ten correct
  pass the stage. Tables of every stage are on the same page.
- **One new word at a time.** The picker prefers sentences with exactly one
  unknown word; the first lesson starts with every translation open.
- **Spaced repetition.** A word learnt today comes back after 1, 3, 7, 14, 30,
  60 and 120 days; a mistake or a peek at the translation resets it. Reviews
  alternate with new sentences.
- **Hard words** (misplaced more than once) are listed on the progress screen
  and can be practised on their own (`#/play/hard`).
- **Grammar reference**: the textbook's notes by lesson, each with examples.
- **Pronunciation** (off by default, Settings → "Pronunciation buttons"): a
  listen button on every word (dictionary, word card) and sentence (meaning
  exercise, solved sentence). The clips are synthesised with the OpenPecha
  Tibetan voice (`openpecha/op-mms-ft-v3`, Meta MMS fine-tuned, non-commercial
  licence of the base model); a Tibetan reader found it fast but acceptable on
  one- and two-syllable words and wrong on longer ones, hence the opt-in. See
  "Audio" below.
- **Dictionary** with search, example sentences, review dates and manual
  "known / learning" marks, including "mark the whole lesson".
- **Streak**: three sentences a day keep it alive.
- **Offline and installable** (PWA): everything, including the Tibetan font,
  is cached by a service worker.
- **Design** in the Karma Kagyu palette (burgundy, gold, deep blue on rice
  paper, a faint cloud ornament, serif headings) with a matching **dark theme**,
  keyboard shortcuts (1–9, Backspace, Enter, H), Wylie under
  the tiles as an option, 44px tap targets, no horizontal scroll at 360px.
- **Progress stays on the device**; move it with a file, a text code (settings
  → "Move to another device"), or optional Google Drive sync.
- **Report a problem** on every screen (footer and menu) and on each sentence
  or word: a short form with a category (translation error → label `content`,
  bug → `bug`, idea → `enhancement`) sent to the report service, which files
  the issue in this repository; without the service it opens a prefilled issue.
- **Support the project** (`#/support`): the app is a free gift to the
  Buddhist centre in Batumi and is not funded by donations; the page invites a
  thank-you donation to the centre. Payment details come from `SUPPORT` in
  `site/config.js` (PayPal link, cards, IBAN; empty entries are hidden).

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
  sets.tsv          set list: id | en | ru | book label (optional)
  words*.tsv        dictionary: tib | en | ru | pos | page | flags (words-bialek.tsv: the Bialek sets)
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
  tools/brand-assets.py      builds the PNG icons and img/bg-clouds.webp from the logo and background artwork (Pillow)
  tools/tts-texts.mjs        lists the texts to voice (words and rendered sentences) as JSON
  tools/tts-build.py         synthesises audio/<id>.mp3 on the server (OpenPecha MMS-VITS voice)
  tools/tts-trial.py         compares voices/speakers of the OpenPecha models on a few samples
redirect/           one-page redirect published to GitHub Pages after the move (index.html + self-removing sw.js)
server/
  nginx/tibetan.itjoy.space.conf  vhost (caching headers, gzip, /api/ proxy)
  setup.sh          one-time root setup of the server (deploy user, certificate, vhost, report-api)
site/
  index.html, styles.css, config.js, manifest.webmanifest, sw.js, privacy.html (privacy policy, linked from the Google consent screen)
  fonts/            Noto Serif Tibetan (OFL)
  icons/            app icons (PNG, from the logo artwork)
  img/              background artwork (bg-clouds.webp)
  data/             words.json, sentences.json, sets.json, sentences.generated.json
  src/app.js        bootstrap, theme, section menu, hash router (#/play #/play/hard #/read #/dict #/grammar #/stats #/settings #/support)
  src/engine/       pure logic: next.js, progress.js, streak.js, check.js, merge.js, tib.js, wylie.js, hard.js, letters.js
  src/engine/tests/fixtures/  progress records of every released version; compat.test.js and the smoke test load them
  src/screens/      play, read, onboarding, dict, grammar, stats, settings, support
  src/i18n/         ru.js en.js de.js fr.js pl.js (+ a test that keys match)
  src/sync.js       optional Google Drive sync
  src/transfer.js   progress <-> text code
  src/report.js     "report a problem" issue links
.github/workflows/deploy.yml  validate + tests + smoke test, then rsync site/ to the server and publish to GitHub Pages
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

The app works fully without signing in. Sync is enabled: the Google Cloud
project is `tibetan-tiles` (OAuth client "Tibetan Tiles web", origins
https://tibetan.itjoy.space and http://localhost:3000, scope `drive.appdata`,
privacy policy at `site/privacy.html`). To set it up again from scratch:

1. Open https://console.cloud.google.com/ and create a project (or pick one).
2. **APIs & Services → Library**: enable **Google Drive API**.
3. **APIs & Services → OAuth consent screen**: choose *External*, fill in the
   app name and your e-mail, add the scope
   `https://www.googleapis.com/auth/drive.appdata`, and add yourself as a test
   user (or publish the app later).
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**,
   type **Web application**. Under *Authorized JavaScript origins* add:
   - `http://localhost:3000` (and any other local port you use, e.g. `http://localhost:8000`)
   - `https://tibetan.itjoy.space`
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
test (job `check`), then two deploy jobs (server set up and first deployed on
2026-10-13):

- `deploy-server` stamps the commit hash into `site/config.js` (shown in
  settings and used as the service-worker cache name) and `rsync`s `site/` to
  `deploy@itjoy.space:/var/www/tibetan.itjoy.space/`. It needs the repository
  secrets `DEPLOY_SSH_KEY` (private key of the `deploy` user) and
  `DEPLOY_KNOWN_HOSTS` (`ssh-keyscan itjoy.space`), and runs only while the
  repository variable `DEPLOY_SERVER` is `true`.
- `deploy` publishes `${PAGES_SOURCE}` (set at the top of the workflow) to
  GitHub Pages: `site` during the transition (the app with a banner about the
  move), `redirect` afterwards (a page that sends the visitor to
  https://tibetan.itjoy.space/ keeping the `#` route, and a `sw.js` that
  removes the old caches and unregisters itself). Planned switch:
  **2026-10-27**, two weeks after the banner went live on 2026-10-13.

All paths in the app are relative, so it also works from a sub-path.

## Audio

Pronunciation clips live only on the server in
`/var/www/tibetan.itjoy.space/audio/` (`w-<word id>.mp3`, `<sentence id>.mp3`,
16 kHz mono, about 15 MB in all); the deploy job syncs `site/` with
`--exclude=audio/`, so they survive deploys. The app reads `AUDIO_BASE` from
`site/config.js` and fetches clips on demand (the service worker caches the
ones played). To (re)generate after a content change, on the server:

```
node scripts/tools/tts-texts.mjs > tts-texts.json        # locally, then copy to the server
/opt/tts-trial/venv/bin/python tts-build.py tts-texts.json /var/www/tibetan.itjoy.space/audio
```

(`/opt/tts-trial/venv` has CPU torch, transformers and soundfile; the script
skips ids that already exist and runs at about real time.) Voice:
`openpecha/op-mms-ft-v3` (single speaker). The v5 and v8 checkpoints produce
silence for most speakers; `tts-trial.py` compares them.

## Server

- **Host:** `itjoy.space` (Ubuntu 24.04, nginx). Site files:
  `/var/www/tibetan.itjoy.space`, owner `deploy:www-data`. Vhost:
  `/etc/nginx/sites-enabled/tibetan.itjoy.space.conf`, a copy of
  `server/nginx/tibetan.itjoy.space.conf` (80 → 301 https, gzip, `fonts/` and
  `icons/` immutable for a year, `sw.js` / `config.js` / `index.html` /
  `data/*.json` `no-cache`, everything else 10 minutes, `/api/` proxied to
  the report service on `127.0.0.1:8091`).
- **First setup / re-apply:** `scp -r server root@itjoy.space:/tmp/tibetan-server`
  and `ssh root@itjoy.space 'bash /tmp/tibetan-server/setup.sh'` (the deploy public key is `server/deploy_key.pub`).
  The script is idempotent and does not touch other vhosts.
- **Deploy user:** `deploy`, no password, one ssh key (restricted: no pty, no
  forwarding) whose private half is the `DEPLOY_SSH_KEY` secret. To rotate:
  `ssh-keygen -t ed25519 -f deploy_key`, re-run `setup.sh` with the new public
  key, `gh secret set DEPLOY_SSH_KEY < deploy_key`, remove the old line from
  `/home/deploy/.ssh/authorized_keys`.
- **Certificate:** Let's Encrypt, `certbot certonly --webroot -w /var/www/html
  -d tibetan.itjoy.space`; renewal is certbot's timer (`systemctl list-timers
  certbot*`), check with `certbot renew --dry-run`.
- **Checks after a deploy:** `curl -I https://tibetan.itjoy.space/` (200),
  `curl -I https://tibetan.itjoy.space/sw.js` (`Cache-Control: no-cache`),
  `curl -I https://tibetan.itjoy.space/fonts/NotoSerifTibetan-Regular.woff2`
  (`font/woff2`, `immutable`), and the browser smoke test against the live site:
  `SMOKE_URL=https://tibetan.itjoy.space node scripts/smoke.mjs`.
- **report-api** (issues filed from the app, `server/report-api/`): service
  `report-api.service` run as its own user, listening on `127.0.0.1:8091`;
  its GitHub token lives in `/etc/report-api.env` (`GITHUB_TOKEN=…`, mode 600,
  never in the repository).
