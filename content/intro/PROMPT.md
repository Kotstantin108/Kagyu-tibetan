# Prompt: the theory text of a lesson

This is the brief used to write (or regenerate) the introductory grammar
text that opens every lesson of the course, in every language of the app.
The texts live in `content/intro/<lang>.md`, one `## <set id>` section per
lesson; `node scripts/build-content.mjs` turns them into
`site/data/intro.json`, segmenting every Tibetan phrase into the course's
words so that the learner can tap a word and see its meaning.

The material for one lesson comes from `node scripts/intro-brief.mjs <set id>`
(add `--book <text file>` to append the textbook lesson as a reference;
the recovered texts live outside git, in `textbooks/txt/ryi-fixed.txt` and
`textbooks/txt/bialek-fixed.txt`, next to the PDFs).
Copy the prompt below, fill in the language, attach the brief.

---

You are writing the theory page of one lesson of a course of Classical
Tibetan for a learner whose language is **{LANGUAGE}**. The page is read once
before the lesson's exercises, on a phone or a laptop, and can be reopened
from the course map and from the grammar reference. The brief attached below
gives: the lesson's title, the textbook's one-line remarks with their example
sentences, every sentence of the lesson with its translation, the new words,
and the textbook's own lesson as a reference.

Write the text in {LANGUAGE}, following these rules.

**What to cover.** Every topic that the remarks name, in a logical order,
grouped by theme, so that the learner meets nothing in the exercises that the
text did not explain. The textbook lesson shows the scope and a sensible
order; use it for that only. Do not add topics the exercises do not touch.
When a particle has several written forms, give the complete rule (which
form after which final letter) once, in one place.

**Explain for a speaker of {LANGUAGE}.** Compare with the grammar of
{LANGUAGE} wherever it helps: its cases, articles, word order, participles,
prepositions, the way it says "to have" or "there is". Say where Tibetan does
the same and where it does the opposite. Do not compare with English unless
{LANGUAGE} is English. Use the grammatical terms of {LANGUAGE} and the terms
the app already uses in {LANGUAGE} for the lesson titles (see
`content/sets.tsv` and the `@sets` section of `content/lang-<xx>.tsv`): the
same particle must have the same name in the text and in the lesson title.

**Examples.** Every Tibetan example phrase or sentence must be one of the
lesson's sentences, copied verbatim from the "Sentences" list of the brief
(the exact rendered spelling, with the fused particles as given and the final
shad where the brief has one). The app recognises these and makes every word
tappable; a phrase that is not in the list cannot be. Put the translation of
the phrase right after it, in the quotation marks of {LANGUAGE}. Two to four
examples per paragraph are enough. A single Tibetan word mentioned in the
prose (a particle, a word used as an illustration) is followed at once by its
gloss in quotation marks, like ཆོས་ "Dharma" in English. Letters named in a
spelling rule stand alone (after ག and ང write གི) and need no gloss. Never
invent or alter Tibetan.

**Tone and form.** Calm, plain, the voice of a patient teacher, without
addressing the reader, without exclamations, humour or emoji. No lists, no
headings, no bold: five to seven paragraphs of prose, separated by blank
lines. 250 to 350 words of {LANGUAGE}, not counting the Tibetan. Sentences
short enough for a phone screen. Do not quote or paraphrase the textbook's
sentences; write your own explanation, and do not mention the textbook, its
author or page numbers.

**Output.** Exactly this, nothing before or after:

```
## {SET ID}

<paragraph>

<paragraph>

...
```

---

# Prompt: the theory text of a part of the alphabet

The alphabet module has fifteen parts (eight rows of letters, the vowel
signs, the subjoined and the superscribed letters, prefixes and suffixes,
syllables, words, the first sentences), and each part opens with a theory
page too. The sections are `## alphabet/<n>` in the same files; the brief of
a part comes from `node scripts/intro-brief.mjs alphabet/<n>` and gives the
signs of the part with their names, tones, look-alikes, the sound
descriptions in every language and example words, plus the short
introduction the cards of the part already show.

---

You are writing the theory page of one part of the alphabet module of a
course of Classical Tibetan for a learner whose language is **{LANGUAGE}**.
The page is read once before the part's cards and drills, on a phone, and
can be reopened later. The brief attached below gives the signs of the part
with everything the app knows about them, and a short introduction that the
cards already show: do not repeat that introduction, go deeper.

Write the text in {LANGUAGE}, following these rules.

**What to cover.** The place of the part in the module (what the learner
knows already, what this part adds), every sign of the part with its name,
its Wylie, its tone where it has one, how it sounds, and the course words
that show it; the look-alike signs the brief names and how to tell them
apart; the writing conventions the part needs (the tsheg, the shad, the
Wylie transliteration, stacks, where a vowel sign goes). The first part also
introduces the script itself: its age and Indian origin, the headed print
style, that every letter carries the vowel a, no spaces between words, no
capitals, what Wylie is and that it shows spelling rather than sound. The
pronunciation is that of Lhasa, as the brief's sound descriptions give it:
a prefix or a superscribed letter is silent, makes a low letter lose its
puff of air and gives a nasal a high tone; the suffixes ད ན ལ ས turn a, o,
u into ä, ö, ü; ད and ས are then silent, ན and ལ are heard.

**Explain for a speaker of {LANGUAGE}.** Compare every sound with the
nearest sound of {LANGUAGE} and say where it differs (aspiration, tone,
voicing, a sound {LANGUAGE} lacks). Compare the writing with the writing of
{LANGUAGE}: vowels as letters in the line versus signs above and below,
spaces versus the tsheg, silent letters {LANGUAGE} has or lacks. Do not
compare with a language other than {LANGUAGE} unless it says something
{LANGUAGE} cannot (an umlaut, a w). Use the names the app uses in {LANGUAGE}
for the parts and for the signs (gi-gu, zhabs-kyu, ya-tak, ra-go, a-chung,
a-chen; the brief's names).

**Shapes.** Do not invent descriptions of strokes. Say which signs look
alike and name only what the brief or the model text states (ba is closed at
the bottom; tsa, tsha and dza are ca, cha and ja with a small added stroke at
the top right; the subjoined wa is a small triangle; the three upper vowel
signs are a curl, a straight short stroke and a wavy stroke); otherwise send
the learner to compare the two signs side by side on the cards.

**Examples.** Every Tibetan word mentioned is a word of the course from the
brief (an example word of a sign, a syllable or word of the drill lists, a
sentence of the last part), copied verbatim with its final tsheg, and
followed at once by its gloss in the quotation marks of {LANGUAGE}: ཁང་པ་
"house". Single letters, letters with a vowel sign and stacks stand alone
without a gloss (ཀི, ཀྱ, རྐ). A syllable of a word may be written alone,
without tsheg, when the part is about syllables (ཁང). Never alter or invent
Tibetan; a word not in the brief is not available.

**Tone and form.** The same as for the lessons: calm, plain, the voice of a
patient teacher, no exclamations, no humour, no lists, no headings, no bold.
Four to six paragraphs, 150 to 320 words of {LANGUAGE} (the first part and
the part on prefixes and suffixes may reach 420), not counting the Tibetan.

**Output.** Exactly this, nothing before or after:

```
## alphabet/{N}

<paragraph>

...
```
