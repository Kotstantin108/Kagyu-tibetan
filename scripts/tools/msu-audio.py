# Cuts the recordings of the alphabet chapters of "Basic Tibetan" (Jampa
# Khedup, Sonam Tsering et al., Michigan State University Libraries, CC BY-NC
# 4.0, https://openbooks.lib.msu.edu/basictibetan/) into one clip per sign.
#
#   python scripts/tools/msu-audio.py textbooks/msu-audio textbooks/msu-audio/clips
# then copy clips/sign-audio.tsv to content/ and the mp3 files to the server (AUDIO_BASE).
#
# Each recording reads its signs in a known order (SPEC below). The pauses are
# found with ffmpeg's silencedetect; the short pauses inside one item (a sign
# spelled out, "ka ya-tak kya") are merged by choosing the largest gap length
# at which the number of segments equals the number of signs. A spoken
# introduction at the start of a recording is dropped when that makes the
# count fit. Writes <out>/sign-<codepoints>.mp3 (16 kHz mono, like the word
# clips), <out>/sign-audio.tsv for content/ and <out>/index.html to listen.
import subprocess, re, os, io, sys, json, statistics

SRC, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)

ROWS = 'ཀ ཁ ག ང ཅ ཆ ཇ ཉ ཏ ཐ ད ན པ ཕ བ མ ཙ ཚ ཛ ཝ ཞ ཟ འ ཡ ར ལ ཤ ས ཧ ཨ'.split()
V = ['ི', 'ུ', 'ེ', 'ོ']
SPEC = [
    ('The-Thirty-consonants.m4a', 'letter', ROWS),
    ('vowels-ka.m4a', 'cv', [c + v for c in ROWS[:16] for v in V]),
    ('vowels-tsa.m4a', 'cv', [c + v for c in ROWS[16:] for v in V]),
    ('Superscript-Letter-Ra.m4a', 'super', 'རྐ རྒ རྔ རྗ རྙ རྟ རྡ རྣ རྦ རྩ རྨ རྫ'.split()),
    ('Superscript-Letter-La.m4a', 'super', 'ལྐ ལྒ ལྔ ལྕ ལྗ ལྟ ལྡ ལྤ ལྦ ལྷ'.split()),
    ('Superscript-Letter-Sa.m4a', 'super', 'སྐ སྒ སྔ སྙ སྟ སྡ སྣ སྤ སྦ སྨ སྩ'.split()),
    ('The-Seven-YaTaks.m4a', 'sub', 'ཀྱ ཁྱ གྱ པྱ ཕྱ བྱ མྱ'.split()),
    ('The-Thirteen-RaTaks.m4a', 'sub', 'ཀྲ ཁྲ གྲ ཏྲ ཐྲ དྲ ནྲ པྲ ཕྲ བྲ མྲ སྲ ཧྲ'.split()),
    ('The-Six-LaTaks-2.m4a', 'sub', 'ཀླ གླ བླ རླ སླ ཟླ'.split()),
    ('The-Sixteen-WaZurs.m4a', 'sub', 'ཀྭ ཁྭ གྭ ཅྭ ཉྭ ཏྭ དྭ ཙྭ ཚྭ ཞྭ ཟྭ རྭ ལྭ ཤྭ སྭ ཧྭ'.split()),
    ('The-Six-Reverse-Letters.m4a', 'reversed', 'ཊ ཋ ཌ ཎ ཥ ཀྵ'.split()),
    ('The-Five-Heavy-Sounding-Letters.m4a', 'heavy', 'གྷ ཛྷ ཌྷ བྷ དྷ'.split()),
]
# the vowel-sign cards show the signs on ཨ: those clips come from the ཨ row of the syllable recording
ALIASES = {'ཨི': 'ཨི', 'ཨུ': 'ཨུ', 'ཨེ': 'ཨེ', 'ཨོ': 'ཨོ'}

def run(args):
    p = subprocess.run(args, capture_output=True)
    return p.stdout.decode('utf8', 'replace'), p.stderr.decode('utf8', 'replace')

def duration(f):
    return float(run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f])[0].strip())

def segments(f, noise, d):
    _, r = run(['ffmpeg', '-hide_banner', '-i', f, '-af', f'silencedetect=noise={noise}dB:d={d}', '-f', 'null', '-'])
    starts = [float(x) for x in re.findall(r'silence_start: ([0-9.]+)', r)]
    ends = [float(x) for x in re.findall(r'silence_end: ([0-9.]+)', r)]
    dur = duration(f)
    bounds = [0.0] + ends
    segs = []
    for i, b in enumerate(bounds):
        e = starts[i] if i < len(starts) else dur
        if e - b > 0.08: segs.append((b, e))
    return segs, dur

def merge_gaps(segs, g):
    out = []
    for b, e in segs:
        if out and b - out[-1][1] < g: out[-1] = (out[-1][0], e)
        else: out.append((b, e))
    return out

def fit(segs, n):
    """Drop a spoken introduction if there is one, merge the pauses shorter than g: the largest g that gives n items."""
    for drop in (0, 1, 2):
        s = segs[drop:]
        if drop and not (segs[drop - 1][1] - segs[drop - 1][0] > 1.8 or segs[drop - 1][1] - segs[drop - 1][0] < 0.2): continue
        for g10 in range(70, 10, -1):
            m = merge_gaps(s, g10 / 100)
            # two signs read without a pause: split the longest items at their widest inner pause
            while len(m) < n:
                longest = max(range(len(m)), key=lambda i: m[i][1] - m[i][0])
                inner = [x for x in s if x[0] >= m[longest][0] and x[1] <= m[longest][1]]
                if len(inner) < 2: break
                k = max(range(len(inner) - 1), key=lambda i: inner[i + 1][0] - inner[i][1])
                m[longest:longest + 1] = [(m[longest][0], inner[k][1]), (inner[k + 1][0], m[longest][1])]
            if len(m) != n: continue
            lens = sorted(e - b for b, e in m)
            med = lens[len(lens) // 2]
            if lens[0] < 0.2 or lens[-1] > 2.2 * med: continue  # a click counted as a sign, or two signs in one clip
            return m, drop, g10 / 100
    return None, None, None

def clip_id(tib):
    return 'sign-' + '-'.join('%04x' % ord(c) for c in tib)

manifest, report, html = [], [], []
for fname, kind, items in SPEC:
    f = os.path.join(SRC, fname)
    done = False
    for noise, d in [(-40, 0.12), (-35, 0.15), (-45, 0.1), (-35, 0.22)]:
        segs, dur = segments(f, noise, d)
        m, drop, g = fit(segs, len(items))
        if m: done = True; break
    if not done:
        report.append(f'{fname}: no cut gives {len(items)} signs (raw {len(segs)}); skipped')
        continue
    lens = [e - b for b, e in m]
    report.append(f'{fname}: {len(segs)} raw at {noise}dB/{d}s, dropped {drop}, gaps < {g}s merged -> {len(items)} signs; {min(lens):.2f}-{max(lens):.2f}s, median {statistics.median(lens):.2f}s')
    html.append(f'<h2>{fname}</h2>')
    for (b, e), tib in zip(m, items):
        start, end = max(0.0, b - 0.06), min(dur, e + 0.10)
        cid = clip_id(tib)
        out = os.path.join(OUT, cid + '.mp3')
        _, err = run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-ss', f'{start:.3f}', '-to', f'{end:.3f}', '-i', f, '-af', 'afade=t=in:d=0.015,afade=t=out:st=%.3f:d=0.03' % (end - start - 0.03), '-ar', '16000', '-ac', '1', '-codec:a', 'libmp3lame', '-b:a', '48k', out])
        if err.strip(): report.append(f'  ffmpeg: {err.strip()[:100]}')
        manifest.append((tib, cid, fname, round(start, 2), round(end, 2)))
        html.append(f'<div><span class="t">{tib}</span> <code>{cid}</code> {end - start:.2f}s <audio controls preload="none" src="{cid}.mp3"></audio></div>')

tsv = ['# Native recordings of the signs of the alphabet: tib | clip id | source recording | start | end (seconds).',
       '# Cut by scripts/tools/msu-audio.py from "Basic Tibetan" (Jampa Khedup, Sonam Tsering et al., Michigan State',
       '# University Libraries, CC BY-NC 4.0, https://openbooks.lib.msu.edu/basictibetan/). The clips <clip id>.mp3 live',
       '# beside the word clips on the server (AUDIO_BASE).']
for tib, cid, src, b, e in manifest: tsv.append(f'{tib} | {cid} | {src} | {b} | {e}')
io.open(os.path.join(OUT, 'sign-audio.tsv'), 'w', encoding='utf8', newline='\n').write('\n'.join(tsv) + '\n')
io.open(os.path.join(OUT, 'index.html'), 'w', encoding='utf8', newline='\n').write('<!doctype html><meta charset="utf-8"><title>MSU sign clips</title><style>body{font-family:sans-serif;max-width:900px;margin:20px auto}.t{font-size:2em;display:inline-block;min-width:3em}div{display:flex;align-items:center;gap:12px;margin:4px 0}</style>' + '\n'.join(html))
io.open(os.path.join(OUT, 'report.txt'), 'w', encoding='utf8', newline='\n').write('\n'.join(report) + '\n')
print('\n'.join(report))
print(len(manifest), 'clips')
