import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { toPhonetics, phoneticSyllables, foldPhonetics } from '../phonetics.js';

// Words with a known THL spelling or an example of the RYI textbook (its ad hoc "ngä", "nö pa", "dhü" rendered in THL).
const KNOWN = [
  ['བཀྲ་ཤིས་བདེ་ལེགས།', 'trashidelek'], // no space in the Tibetan, so one word for the engine
  ['དགོན་པ་', 'gönpa'],
  ['བླ་མ་', 'lama'],
  ['ཆོས་', 'chö'],
  ['བོད་', 'pö'],
  ['བོད་པ་', 'pöpa'],
  ['ཇ་', 'cha'],
  ['འཇུག་', 'juk'],
  ['མགོ་', 'go'],
  ['གོ་', 'ko'],
  ['ངས་', 'ngé'],
  ['གནོད་པ་', 'nöpa'],
  ['དུས་', 'tü'], // the textbook's "dhü": low tone, written t in THL,
  ['ཁྱེད་རང་', 'khyerang'],
  ['ནམ་གཤིས་', 'namshi'],
  ['རྡོ་རྗེ་', 'dorjé'],
  ['དགེ་བ་', 'gewa'],
  ['སེམས་ཅན་', 'semchen'],
  ['ཐམས་ཅད་', 'tamché'],
  ['སངས་རྒྱས་', 'sanggyé'],
  ['རིན་པོ་ཆེ་', 'rinpoché'],
  ['བཟང་པོ་', 'zangpo'],
  ['གཡག་', 'yak'],
  ['དབང་', 'wang'],
  ['དབུ་', 'u'],
  ['དབུས་', 'ü'],
  ['དབྱངས་', 'yang'],
  ['ཟླ་བ་', 'dawa'],
  ['སྒྲོལ་མ་', 'drölma'],
  ['འབྲུག་པ་', 'drukpa'],
  ['ཕྱག་', 'chak'],
  ['བྱང་', 'chang'],
  ['སྤྱན་', 'chen'],
  ['སྦྱིན་པ་', 'jinpa'],
  ['དཔལ་ལྡན་', 'pelden'],
  ['ཡུལ་', 'yül'],
  ['དངུལ་', 'ngül'],
  ['ཞབས་', 'shap'],
  ['གཟུགས་', 'zuk'],
  ['ཟས་', 'sé'],
  ['ལྷ་', 'lha'],
  ['ལྷ་མོ་', 'lhamo'],
  ['ཁྲིམས་', 'trim'],
  ['འཕྲུལ་', 'trül'],
  ['སྐྱིད་པོ་', 'kyipo'],
  ['རྒྱ་གར་', 'gyagar'],
  ['བཀའ་', 'ka'],
  ['དགའ་', 'ga'],
  ['བླ་མའི་', 'lamé'],
  ['བཀས་', 'ké'],
  ['དགའོ་', 'gao'],
  ['འོད་', 'ö'],
  ['ཨ་མ་', 'ama'],
  ['ཀ་རྨ་', 'karma'],
  ['འོད་ཟེར་', 'özer'],
  ['འབྲས་བུ་', 'drebu'],
  ['ས་ག་ཟླ་བ་', 'sagadawa'],
  ['ནོར་བུ་', 'norbu'],
  ['བཀའ་བརྒྱུད་', 'kagyü'],
  ['སྔོན་', 'ngön'],
  ['ཐུགས་རྗེ་ཆེ།', 'tukjeché'],
  ['ཐུགས་རྗེ་', 'tukjé'],
  ['ཕུན་ཚོགས་', 'püntsok'],
  ['པད་མ་', 'pema'],
  ['ཤེས་རབ་', 'sherap'],
  ['མི་', 'mi'],
  ['ཀུན་དགའ་', 'künga'],
  ['སྐད་', 'ké'],
  ['བརྒྱད་', 'gyé'],
  ['ཁམས་', 'kham'],
  ['རྣམས་', 'nam'],
  ['གསེར་', 'ser'],
  ['སྨྲ་བ་', 'mawa'],
  ['ཨོཾ་', 'om'],
  ['༡༠་', '10'],
];

test('known words come out in their THL spelling', () => {
  for (const [tib, phon] of KNOWN) assert.equal(toPhonetics(tib), phon, tib);
});

test('syllables of a word are aligned with its syllables and join into the word', () => {
  assert.deepEqual(phoneticSyllables('དགོན་པ་'), ['gön', 'pa']);
  assert.deepEqual(phoneticSyllables('སེམས་ཅན་ཐམས་ཅད་'), ['sem', 'chen', 'tam', 'ché']); // ཐམས: THL writes tha as t
  assert.deepEqual(phoneticSyllables('བླ་མས་'), ['la', 'mé']);
  assert.deepEqual(phoneticSyllables('རྡོ་རྗེ་'), ['dor', 'jé']);
});

test('é only in the last open syllable', () => {
  assert.equal(toPhonetics('བདེ་ལེགས་'), 'delek');
  assert.equal(toPhonetics('བདེ་'), 'dé');
  assert.equal(toPhonetics('དེ་རིང་'), 'tering');
});

test('folding drops the diacritics for search', () => {
  assert.equal(foldPhonetics('Gönpa'), 'gonpa');
  assert.equal(foldPhonetics('dorjé'), 'dorje');
  assert.equal(foldPhonetics('ü'), 'u');
});

test('every word of the course gets a pronunciation of plain letters', () => {
  const words = JSON.parse(readFileSync(new URL('../../../data/words.json', import.meta.url), 'utf8'));
  for (const [id, w] of Object.entries(words)) {
    if (w.service) continue;
    const phon = toPhonetics(w.tib);
    assert.ok(phon.length > 0, `${id} ${w.tib}: empty`);
    assert.match(phon, /^[a-zöüé0-9 ]+$/u, `${id} ${w.tib}: ${phon}`);
    const parts = phoneticSyllables(w.tib);
    assert.equal(parts.join(''), phon.replace(/ /g, ''), `${id}: syllables join into the word`);
  }
});

// The colloquial phrases carry the phonetics of the open textbook Basic Tibetan (MSU), a different system
// (no umlaut, "zh", "ph", "sang" for bzang); the Tibetan has no spaces between words, so the engine sees each
// phrase as one word. Its THL output is pinned here, so a change in the rules shows up as a diff in this list.
test('the phrases of content/phrases.tsv in THL', () => {
  const rows = readFileSync(new URL('../../../../content/phrases.tsv', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.trim() && !l.startsWith('#')).map((l) => l.split('|').map((x) => x.trim()));
  const expected = {
    'tashi delek': 'trashidelek',
    'ngadro delek': 'ngadrodelek',
    'nyinmo delek': 'nyinmodelek',
    'tsenmo delek': 'tsenmodelek',
    'galer phep': 'kalerpep',
    'galer zhuk': 'kalerzhuk',
    'zimjak nang-go': 'zimjaknanggo',
    'sangnyin jel yong': 'sangnyinjelyong',
    'zhuk dang': 'zhukdang',
    'thukje che': 'tukjeché',
    'gai nang gi marey': 'kenanggimaré',
    'laso laso': 'lasolaso',
    'nge she masong': 'ngeshemasong',
    'yangkyar sung dang': 'yangkyarsungdang',
    'galer sung dang': 'kalersungdang',
    'she song ngam': 'shesongngam',
    'nge she song': 'ngeshesong',
    'kukham sang': 'kukhamzang',
    'gong dak': 'gongdak',
    'zabzab nang-go': 'zapzapnanggo',
    'tropo nang-go': 'troponanggo',
    'kadrin che': 'kadrinché',
    'jemar jel yong': 'jemarjelyong',
  };
  for (const [tib, phon] of rows) {
    assert.ok(expected[phon], `${phon}: not in the list`);
    assert.equal(toPhonetics(tib), expected[phon], tib);
  }
});
