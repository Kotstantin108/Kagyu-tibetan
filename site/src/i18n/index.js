// Interface strings: loading, language detection and a tiny `t()` formatter.
import en from './en.js';
import ru from './ru.js';
import de from './de.js';
import fr from './fr.js';
import pl from './pl.js';
import { LANGS, DEFAULT_LANG } from '../engine/config.js';

export const STRINGS = { en, ru, de, fr, pl };

/** Language from navigator.language: ru*, de*, fr*, pl* map to themselves, anything else is English. */
export function detectLang(navigatorLanguage) {
  const code = String(navigatorLanguage || '').toLowerCase().slice(0, 2);
  return LANGS.includes(code) ? code : DEFAULT_LANG;
}

/** All leaf key paths of a strings object, e.g. "play.check". */
export function keyPaths(obj, prefix = '') {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') out.push(...keyPaths(v, path));
    else out.push(path);
  }
  return out.sort();
}

function lookup(obj, path) {
  return path.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj);
}

/** Make a translator for `lang`; falls back to English, then to the key itself. */
export function makeT(lang) {
  const primary = STRINGS[lang] || STRINGS[DEFAULT_LANG];
  return (path, vars = {}) => {
    let s = lookup(primary, path);
    if (s === undefined) s = lookup(STRINGS[DEFAULT_LANG], path);
    if (s === undefined) return path;
    if (typeof s !== 'string') return s;
    return s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
  };
}

/** Pick a translated field {ru,en,...}; returns { text, lang, fallback } */
export function pickTr(tr, lang) {
  if (!tr) return { text: '', lang, fallback: false };
  if (tr[lang]) return { text: tr[lang], lang, fallback: false };
  if (tr[DEFAULT_LANG]) return { text: tr[DEFAULT_LANG], lang: DEFAULT_LANG, fallback: true };
  for (const l of LANGS) if (tr[l]) return { text: tr[l], lang: l, fallback: true };
  return { text: '', lang, fallback: false };
}
