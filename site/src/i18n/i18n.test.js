import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STRINGS, keyPaths, detectLang, makeT, pickTr } from './index.js';
import { LANGS } from '../engine/config.js';

test('every language has exactly the same keys as English', () => {
  const ref = keyPaths(STRINGS.en);
  for (const lang of LANGS) {
    assert.deepEqual(keyPaths(STRINGS[lang]), ref, `keys of ${lang} differ from en`);
  }
});

test('no empty strings', () => {
  for (const lang of LANGS) {
    for (const path of keyPaths(STRINGS[lang])) {
      const v = path.split('.').reduce((o, k) => o[k], STRINGS[lang]);
      assert.ok(typeof v === 'string' && v.trim(), `${lang}: ${path} is empty`);
    }
  }
});

test('language detection', () => {
  assert.equal(detectLang('ru-RU'), 'ru');
  assert.equal(detectLang('de'), 'de');
  assert.equal(detectLang('fr-CA'), 'fr');
  assert.equal(detectLang('pl-PL'), 'pl');
  assert.equal(detectLang('uk-UA'), 'en');
  assert.equal(detectLang(undefined), 'en');
});

test('t() formats placeholders and falls back to English', () => {
  const t = makeT('ru');
  assert.equal(t('play.tilesCount', { placed: 1, total: 3 }), '1 из 3');
  assert.equal(makeT('xx')('play.check'), 'Check');
  assert.equal(t('does.not.exist'), 'does.not.exist');
});

test('pickTr falls back to another language and says so', () => {
  assert.deepEqual(pickTr({ ru: 'а', en: 'a' }, 'ru'), { text: 'а', lang: 'ru', fallback: false });
  assert.deepEqual(pickTr({ en: 'a' }, 'ru'), { text: 'a', lang: 'en', fallback: true });
  assert.deepEqual(pickTr({ pl: 'x' }, 'ru'), { text: 'x', lang: 'pl', fallback: true });
  assert.equal(pickTr(null, 'ru').text, '');
});
