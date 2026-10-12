## Sources and scope

- **Used:** *Classical Tibetan Grammar Handbook* (TLAN 101, Rangjung Yeshe Institute, Benjamin Collet-Cassart 2011, revised edition 2022/2023), lessons 1–7. Page numbers in `source` are the printed ones (PDF page = printed page + 5).
- **Not used (yet):** Joanna Bialek, *A Textbook in Classical Tibetan* (exercise sentences are excerpts from classical texts, GLR/MB; harder, and the exercise key uses a non-Wylie transliteration) and Joe B. Wilson, *Translating Buddhism from Tibetan* (scanned PDF without a text layer; would need OCR or manual transcription). Both can be added as further sets later.

## How the Tibetan text was obtained

The PDFs embed Monlam Uni OuChan, Microsoft Himalaya and Tibetan Machine Uni fonts whose ToUnicode maps lose subjoined letters (e.g. སློབ་མ་ came out as སོབ་མ་). The text was reconstructed from glyph ids through the GSUB ligature tables of the original fonts (`scripts/tools/pdf-tibetan-text.py`; it needs PyMuPDF, fontTools and the original fonts: Monlam Uni OuChan 1/2 from the Debian package `fonts-monlam`, Tibetan Machine Uni from `fonts-tibetan-machine`, Microsoft Himalaya from Windows). Every sentence was then compared to the rendering of its word ids, so stacks are correct unless listed below.

## Dropped sentences

Six handbook sentences contain apparent typos (p. 45 ex. 21 གསུང་པའོ, p. 50 ཆུ་ཀྱིས, p. 54 ཐེ་ཙོམ, p. 60 ex. 5 སྐད་གཅིག, p. 100 རགས་ལས, p. 103 ཐོབ་བའི). Rather than publish corrected text, they are left out of the data; the words ཐེ་ཚོམ་ and རག་ལས་ went with them.

## Doubtful places (please check against the printed page)

| where | issue |
|---|---|
| lesson 5, p. 73, ex. 27 | `ཁོང་གིས་ ... མི་འཇིགས་སམ།` marks the subject of a verb of emotion with an agentive particle, contrary to the rule on p. 52. Kept as printed. |
| lesson 6, p. 85 and lesson 7, p. 105 | The PDF has both `སྐལ་པ་` and `བསྐལ་པ་` for "eon"; we use `བསྐལ་པ་` everywhere. |
| lesson 7, p. 98 | Both `གདུལ་བྱ་` and `འདུལ་བྱ་` appear in the handbook; both are kept as separate words. |
| lesson 7, p. 95 | `དཀོན་མཆོག་གསུམ་ལ་སྐྱབས་སོང་བ། འཇིགས་པ་མེད་པ་ཐོབ་པར་འགྱུར།` is the only sentence with a shad in the middle; it is kept as two clauses in one sentence. |

## Editorial decisions

- **Punctuation.** Complete sentences end with the service token `shad` (`།`) even where the handbook omits it; the renderer drops the tsheg before the shad except after a final ང, and after a final ག the shad is omitted (`འཇུག་གོ`). Noun phrases keep their final tsheg.
- **Fused particles.** The particles that merge with an open syllable (འི ས ར འོ འམ འང) are separate word tokens flagged `fused: true` (e.g. `བླ་མའི་` = `bla-ma` + `'i`). This mirrors the way the handbook presents them and keeps the dictionary free of inflected forms.
- **Homographs** are single entries with both meanings: `མི་` (man / not), `མ་` (not / mother), `ལས་` (karma / from), `ས་` (earth) vs the fused agentive `ས` (`sa-2`), `ལམ་` (path / or), `ལོ་` (year / terminating particle), `གོ་` (to understand / terminating particle), `མོ་` (she / terminating particle), `ཤིང་` (tree / and), `ཞིང་` (and / field), `སྟོང་` (thousand / to be empty), `གང་` (what / to be full), `དེ་` (that / continuative), `ན་` (if / in), `སུ་` (who / la-dön), `ནམ་` (when / question particle), `བར་` (nominalizer + la-dön / until).
- **Verb + nominalizer.** Where the handbook lists a nominal form as a dictionary word (བསྟན་པ་, རྟོགས་པ་, སྒོམ་པ་ …) the segmenter prefers it, so `བསྟན་པའི་` is `bstan-pa` + `'i`, while `བྱོན་པའི་` is `byon` + `pa'i`. Both renderings are correct Tibetan; it only affects which tiles the learner sees.
- **"One" as subject.** The handbook writes "one" when the subject is omitted; the Russian uses `[он]` in brackets for the same cases.
- **Exercise sentences** (sections "Translate into English") have no key in the handbook, so their English is ours and is marked `trOrigin.en = "machine"`. All Russian is ours. Both lists are below.
- Lesson 2's honorific table (ཕ་/ཡབ་ etc.) and lesson 3's tense table are in the dictionary but have no sentences, which is why the validator lists them as unused words.
