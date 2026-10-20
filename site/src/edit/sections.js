// The theory texts live in content/intro/<lang>.md: a head (comment lines) and
// one "## <set id>" section per lesson or alphabet part. The editor page edits
// one section at a time; these helpers split a file into sections and put an
// edited section back without touching the rest. Round trip of an unchanged
// file is byte-identical for files in the canonical form (head, blank line,
// "## id", blank line, paragraphs separated by blank lines, one final newline).

const HEADING = /^## (\S+)\s*$/;

/** Split a file into { head, sections: [{ id, body }] }; bodies and the head are trimmed of trailing blank lines. */
export function splitSections(text) {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  const sections = [];
  let head = [];
  let current = null;
  for (const line of lines) {
    const m = line.match(HEADING);
    if (m) { current = { id: m[1], lines: [] }; sections.push(current); continue; }
    (current ? current.lines : head).push(line);
  }
  const trim = (ls) => ls.join('\n').replace(/^\n+/, '').replace(/\s+$/, '');
  return { head: trim(head), sections: sections.map((s) => ({ id: s.id, body: trim(s.lines) })) };
}

/** The canonical text of { head, sections }. */
export function joinSections({ head, sections }) {
  const parts = [];
  if (head) parts.push(head);
  for (const s of sections) parts.push(`## ${s.id}${s.body ? `\n\n${s.body}` : ''}`);
  return parts.join('\n\n') + '\n';
}

/** The file with the body of section `id` replaced (appended as a new section when the id is new). */
export function replaceSection(text, id, body) {
  const doc = splitSections(text);
  const s = doc.sections.find((x) => x.id === id);
  const clean = String(body).replace(/\r\n?/g, '\n').replace(/^\n+/, '').replace(/\s+$/, '');
  if (s) s.body = clean; else doc.sections.push({ id, body: clean });
  return joinSections(doc);
}
