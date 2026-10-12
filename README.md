# Kagyu Tibetan — sentence tiles for Classical Tibetan

A static web app (plain HTML/CSS/JS, ES modules, no build step) for learning
Classical Tibetan by assembling sentences from tiles. Content comes from the
Rangjung Yeshe Institute *Classical Tibetan Grammar Handbook* (TLAN 101),
lessons 1–7.

## Layout

```
content/            authoring files (pipe-separated text, UTF-8)
  sets.tsv          lesson list
  words*.tsv        dictionary: tib | en | ru | pos | page | flags
  sentences*.tsv    sentences: page | tib | enOrigin | en | ru | noteEn | noteRu
  review-notes.md   hand-written notes that go into CONTENT_REVIEW.md
scripts/
  build-content.mjs builds site/data/*.json and CONTENT_REVIEW.md from content/
  validate.mjs      checks site/data/*.json (node scripts/validate.mjs)
  lib/wylie.mjs     Unicode Tibetan -> Wylie
  tools/pdf-tibetan-text.py  recovers Tibetan text from the textbook PDFs
site/
  data/             words.json, sentences.json, sets.json, sentences.generated.json
  src/engine/tib.js Tibetan text helpers shared by the site and the build
```

## Commands

```
node scripts/build-content.mjs   # regenerate site/data and CONTENT_REVIEW.md
node scripts/validate.mjs        # validate the data, exit code 1 on errors
```

## Data model notes

- A sentence is a list of word ids; its Tibetan text is the concatenation of the
  words' `tib`. The final shad is the service token `shad`.
- Particles that merge with an open syllable (འི ས ར འོ འམ འང) are words with
  `fused: true`; `renderTib()` in `site/src/engine/tib.js` glues them to the
  previous word (`བླ་མ་` + `འི་` → `བླ་མའི་`).
- `trOrigin` tells whether a translation comes from the textbook or from us
  (`machine`). The handbook is in English, so every Russian translation is
  `machine`; exercise sentences have no key, so their English is `machine` too.
  `CONTENT_REVIEW.md` lists them for a reviewer.
