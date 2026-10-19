# Prompt: the theory text of a lesson

This is the brief used to write (or regenerate) the introductory grammar
text that opens every lesson of the course, in every language of the app.
The texts live in `content/intro/<lang>.md`, one `## <set id>` section per
lesson; `node scripts/build-content.mjs` turns them into
`site/data/intro.json`, segmenting every Tibetan phrase into the course's
words so that the learner can tap a word and see its meaning.

The material for one lesson comes from `node scripts/intro-brief.mjs <set id>`
(add `--book <text file>` to append the textbook lesson as a reference).
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
