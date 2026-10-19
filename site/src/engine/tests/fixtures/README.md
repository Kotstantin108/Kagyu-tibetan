# Progress records of released versions

One file per shape of the progress record that the site has ever written to
`localStorage` (key `tib-progress`) or exported as a file. `compat.test.js`
loads every fixture and checks that the current code keeps all of it; the
browser smoke test boots the site with the oldest and the newest fixture.

Rules:

- never edit an existing fixture: it documents what real learners may still
  have in their browsers;
- when the record gets a new field, add a new fixture named by the date of the
  release that introduced it (an exported file from the Settings screen is the
  right source) and fill the field in it; the test for "the newest fixture
  covers every field of `createProgress()`" fails until you do;
- the word and sentence ids are real ids from `site/data` so the fixtures also
  work in the browser (dictionary status, progress screen).

| File | Release | What was new |
| --- | --- | --- |
| progress-2026-10-12.json | a7aef55 | words without `level`/`due`; settings only `tileMode`, `lang` |
| progress-2026-10-13.json | 3cc6b72, c4fdec7 | spaced repetition (`level`, `due`); settings `exercise`, `showWylie`, `voice`, `theme`, `onboarded` |
| progress-2026-10-15.json | 9c7cf80 | `reading` (the reading course); exercise `recall` |
| progress-2026-10-19.json | the course | `course` (units, current, canRead); setting `home` |
| progress-2026-10-19b.json | the alphabet | `course.alphabetExam`; `reading` keyed by alphabet parts (older stage ids are migrated on load) |
| progress-2026-10-19c.json | Yak Tashi | settings `tashi` (the mascot is shown), `tashiMet` (he introduced himself) |
