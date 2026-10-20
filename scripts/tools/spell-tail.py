#!/usr/bin/env python3
# The plain reading of every spelled-out word: in the Basic Tibetan recordings a
# word is spelled letter by letter and then read whole, so the last stretch of
# speech of each spelled clip (content/spelling-audio.tsv) is the word itself.
# This cuts that tail from the source recording into msu-<codepoints>.mp3 (the
# id convention of content/word-audio.tsv) and appends the rows to that table,
# for the words that have no plain recording yet. Run after msu-audio.py:
#
#   python scripts/tools/spell-tail.py            # cut + append rows
#   python scripts/tools/spell-tail.py --dry-run  # report only
#
# Needs ffmpeg/ffprobe on PATH and the source m4a files in textbooks/msu-audio/.
# The tail must look like one spoken word: 0.25-1.4 s and at most 60 % of the
# spelled clip; other clips are reported and skipped (recut by hand).

import subprocess, re, os, io, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
SRC = os.path.join(ROOT, 'textbooks', 'msu-audio')
OUT = os.path.join(SRC, 'clips')
CONTENT = os.path.join(ROOT, 'content')
DRY = '--dry-run' in sys.argv

def run(args):
    p = subprocess.run(args, capture_output=True)
    return p.stdout.decode('utf8', 'replace'), p.stderr.decode('utf8', 'replace')

def rows(name):
    out = []
    for line in io.open(os.path.join(CONTENT, name), encoding='utf8'):
        line = line.rstrip('\n')
        if not line or line.startswith('#'): continue
        out.append([c.strip() for c in line.split('|')])
    return out

def speech(f, start, end, noise, d):
    """Stretches of speech inside [start, end] of file f, as absolute seconds."""
    _, r = run(['ffmpeg', '-hide_banner', '-ss', f'{start:.3f}', '-to', f'{end:.3f}', '-i', f, '-af', f'silencedetect=noise={noise}dB:d={d}', '-f', 'null', '-'])
    starts = [float(x) for x in re.findall(r'silence_start: (-?[0-9.]+)', r)]
    ends = [float(x) for x in re.findall(r'silence_end: (-?[0-9.]+)', r)]
    length = end - start
    bounds = [0.0] + ends
    segs = []
    for i, b in enumerate(bounds):
        e = starts[i] if i < len(starts) else length
        if e - b > 0.06: segs.append((start + b, start + e))
    while segs and segs[-1][1] - segs[-1][0] < 0.15: segs.pop()  # a click at the end
    return segs

def tail_of(f, start, end):
    """The last spoken stretch of the clip when it looks like one word, else None (with the reason)."""
    reason = 'no pause found'
    for noise, d in [(-40, 0.08), (-35, 0.1), (-45, 0.06), (-30, 0.12), (-38, 0.05)]:
        segs = speech(f, start, end, noise, d)
        if len(segs) < 2: reason = f'{len(segs)} stretch(es) at {noise}dB/{d}s'; continue
        b, e = segs[-1]
        n = e - b
        if 0.25 <= n <= 1.4 and n <= 0.6 * (end - start): return (b, e), None
        reason = f'tail {n:.2f}s of {end - start:.2f}s at {noise}dB/{d}s'
    return None, reason

def shorten(f, tail, tib):
    """A one-syllable word should take well under a second; a longer tail usually still holds the vowel's name
    ("na-ro ngo"): look for the faint pause inside it and keep the last piece."""
    b, e = tail
    if '་' in tib or e - b <= 0.85: return tail
    for noise, d in [(-30, 0.04), (-25, 0.04), (-28, 0.03), (-22, 0.05), (-18, 0.04)]:
        segs = speech(f, b, e, noise, d)
        if len(segs) >= 2 and segs[-1][1] - segs[-1][0] >= 0.25 and segs[-1][1] - segs[-1][0] < e - b - 0.15: return segs[-1]
    return tail

def main():
    have = {r[0] for r in rows('word-audio.tsv')}
    added, skipped = [], []
    for tib, clip, src, start, end in rows('spelling-audio.tsv'):
        if tib in have: continue
        f = os.path.join(SRC, src)
        if not os.path.exists(f): skipped.append(f'{tib}: {src} missing'); continue
        start, end = float(start), float(end)
        tail, why = tail_of(f, start, end)
        if not tail: skipped.append(f'{tib} ({clip}): {why}'); continue
        tail = shorten(f, tail, tib)
        b, e = max(start, tail[0] - 0.05), min(end, tail[1] + 0.10)
        cid = 'msu-' + '-'.join('%04x' % ord(c) for c in tib)
        if not DRY:
            out = os.path.join(OUT, cid + '.mp3')
            _, err = run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-ss', f'{b:.3f}', '-to', f'{e:.3f}', '-i', f,
                          '-af', 'afade=t=in:d=0.015,afade=t=out:st=%.3f:d=0.03' % (e - b - 0.03), '-ar', '16000', '-ac', '1', '-codec:a', 'libmp3lame', '-b:a', '48k', out])
            if err.strip(): skipped.append(f'{tib}: ffmpeg {err.strip()[:100]}'); continue
        added.append((tib, cid, src, round(b, 2), round(e, 2)))
    if added and not DRY:
        path = os.path.join(CONTENT, 'word-audio.tsv')
        text = io.open(path, encoding='utf8').read()
        if not text.endswith('\n'): text += '\n'
        text += '# The whole-word reading at the end of each spelled-out clip (spelling-audio.tsv), cut by scripts/tools/spell-tail.py:\n'
        text += ''.join(f'{t} | {c} | {s} | {b} | {e}\n' for t, c, s, b, e in added)
        io.open(path, 'w', encoding='utf8', newline='\n').write(text)
    print(f'{len(added)} tails cut' + (' (dry run)' if DRY else '') + f', {len(skipped)} skipped')
    for t, c, s, b, e in added: print(f'  {t} {c} {e - b:.2f}s')
    for s in skipped: print('  skipped: ' + s)

main()
