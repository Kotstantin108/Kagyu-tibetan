# Cuts the recordings of the alphabet chapters of "Basic Tibetan" (Jampa
# Khedup, Sonam Tsering et al., Michigan State University Libraries, CC BY-NC
# 4.0, https://openbooks.lib.msu.edu/basictibetan/) into one clip per item.
#
#   python scripts/tools/msu-audio.py textbooks/msu-audio textbooks/msu-audio/clips
#
# then copy the tables to content/ and the mp3 files to the server (AUDIO_BASE):
#   sign-audio.tsv      the signs (letters, syllables, stacks)        -> sign-<codepoints>.mp3
#   spelling-audio.tsv  words spelled out letter by letter and read   -> spell-<codepoints>.mp3
#   word-audio.tsv      words read plainly                            -> msu-<codepoints>.mp3
#   phrase-audio.tsv    the frequent expressions                      -> phrase-<n>.mp3
#
# Each recording reads its items in a known order (SPEC below). The pauses are
# found with ffmpeg's silencedetect; clicks at the ends are dropped; the short
# pauses inside one item (a sign or word spelled out, "ka ya-tak kya") are
# merged by choosing the largest gap length at which the number of segments
# equals the number of items; two items read without a pause are split at the
# widest inner pause; a spoken introduction at the start is dropped when that
# makes the count fit. Clips are 16 kHz mono mp3 like the word clips.
# <out>/index.html lists every clip to listen to.
import subprocess, re, os, io, sys, json, statistics

SRC, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
# --extra <json>: more recordings, [{"file": ..., "mode": ..., "items": [...]}] (the vocabulary lists of chapters 4-10)
EXTRA = json.load(io.open(sys.argv[sys.argv.index('--extra') + 1], encoding='utf8')) if '--extra' in sys.argv else []

ROWS = 'ཀ ཁ ག ང ཅ ཆ ཇ ཉ ཏ ཐ ད ན པ ཕ བ མ ཙ ཚ ཛ ཝ ཞ ཟ འ ཡ ར ལ ཤ ས ཧ ཨ'.split()
V = ['ི', 'ུ', 'ེ', 'ོ']
# (file, mode, items); mode: sign | spelled | word | phrase
SPEC = [
    ('The-Thirty-consonants.m4a', 'sign', ROWS),
    ('vowels-ka.m4a', 'sign', [c + v for c in ROWS[:16] for v in V]),
    ('vowels-tsa.m4a', 'sign', [c + v for c in ROWS[16:] for v in V]),
    ('Superscript-Letter-Ra.m4a', 'sign', 'རྐ རྒ རྔ རྗ རྙ རྟ རྡ རྣ རྦ རྩ རྨ རྫ'.split()),
    ('Superscript-Letter-La.m4a', 'sign', 'ལྐ ལྒ ལྔ ལྕ ལྗ ལྟ ལྡ ལྤ ལྦ ལྷ'.split()),
    ('Superscript-Letter-Sa.m4a', 'sign', 'སྐ སྒ སྔ སྙ སྟ སྡ སྣ སྤ སྦ སྨ སྩ'.split()),
    ('The-Seven-YaTaks.m4a', 'sign', 'ཀྱ ཁྱ གྱ པྱ ཕྱ བྱ མྱ'.split()),
    ('The-Thirteen-RaTaks.m4a', 'sign', 'ཀྲ ཁྲ གྲ ཏྲ ཐྲ དྲ ནྲ པྲ ཕྲ བྲ མྲ སྲ ཧྲ'.split()),
    ('The-Six-LaTaks-2.m4a', 'sign', 'ཀླ གླ བླ རླ སླ ཟླ'.split()),
    ('The-Sixteen-WaZurs.m4a', 'sign', 'ཀྭ ཁྭ གྭ ཅྭ ཉྭ ཏྭ དྭ ཙྭ ཚྭ ཞྭ ཟྭ རྭ ལྭ ཤྭ སྭ ཧྭ'.split()),
    ('The-Six-Reverse-Letters.m4a', 'sign', 'ཊ ཋ ཌ ཎ ཥ ཀྵ'.split()),
    ('The-Five-Heavy-Sounding-Letters.m4a', 'sign', 'གྷ ཛྷ ཌྷ བྷ དྷ'.split()),
    ('The-Single-Letter-words.m4a', 'word', 'ཁ ང ཆ ཇ ཉ ན ཕ བ མ ཝ ཟ ཡ ར ཤ ས'.split()),
    ('Single-Letter-words-with-vowels.m4a', 'spelled', 'མི རི ཤི ངུ ཆུ ཕུ ཤུ མེ ངོ ཞོ རོ ཤོ སོ'.split()),
    ('Suffix-Letters.m4a', 'spelled', 'ལག་པ ཁང་པ པད་མ བན་དེ ཐབ་ཚང ཟམ་པ འཇའ ཆར་པ བལ ལས་ཀ'.split()),
    ('Suffix-Letters-with-Vowels.m4a', 'spelled', 'མིག་ཆུ ཆུང་ཆུང བོད་པ ཆེན་པོ དེབ་ཁུག ཞིམ་པོ ལེའུ་ཚན འུར་ཤོབ རིལ་རིལ གོས་ཐུང'.split()),
    ('Post-suffix-Letter-Sa.m4a', 'spelled', 'ཇ་ཚགས གངས ཆར་ཁེབས སེམས་ཅན ཐམས་ཅད'.split()),
    ('Post-suffix-Letter-Da.m4a', 'spelled', 'ཕྱིནད བསྟནད བསྐོརད གྱུརད སྩལད་བ'.split()),
    ('prefix-1.m4a', 'spelled', 'དགར འཇའ བདག འབར མཛངས'.split()),
    ('prefix-2.m4a', 'spelled', 'མངར གཉན གནན དམར གཡག'.split()),
    ('prefix-3.m4a', 'spelled', 'ཁ་བ རེ་བ བདེ་བ རྒོ་བ བྱ་བ'.split()),
    ('prefix-4.m4a', 'spelled', 'དབར དབང དབེན་པ དབྱར་ཁ དབྱིབས དབྲལ དབུལ་པོ དབྱུག་པ'.split()),
    ('Examples-of-YaTaks.m4a', 'spelled', 'ཞབས་ཀྱུ ཁྱི ཁྱེད་རང ཕྱུ་པ ཕྱི་ལོགས བྱ་ཤ ལས་ཀ་བྱེད རོགས་པ་བྱེད ཁྱི་ཉར་མ་མྱོང'.split()),
    ('Examples-of-RaTaks.m4a', 'spelled', 'ཀྲུང་གོ ཉལ་ཁྲི གྲང་མོ དྲི་བ དྲུག ཕྲེང་ང ཕོ་བྲང ཆབ་སྲིད ཧྲང་ཧེ'.split()),
    ('Examples-of-LaTaks.m4a', 'spelled', 'ཀློག ཀླད་པ གློག་ཀླད བླ་མ རླུང སློབ་ཕྲུག ལས་སླ་པོ ཟླ་བ'.split()),
    ('Examples-of-WaZurs.m4a', 'spelled', 'ཉྭ་རིལ དྭ་ཕྲུག ལ་དྭགས ཚྭ ཞྭ་མོ རྭ་ཅོ ཤྭ་བ སློབ་གྲྭ ཧྭ་ཤང'.split()),
    ('Frequent-expression-1.m4a', 'phrase', 'བཀྲ་ཤིས་བདེ་ལེགས། སྔ་དྲོ་བདེ་ལེགས། ཉིན་མོ་བདེ་ལེགས། མཚན་མོ་བདེ་ལེགས། ག་ལེར་ཕེབས། ག་ལེར་བཞུགས། གཟིམ་འཇགས་གནང་གོ། སང་ཉིན་མཇལ་ཡོང་།'.split()),
    ('Frequent-Expression-2.m4a', 'phrase', 'བཞུགས་དང་། ཐུགས་རྗེ་ཆེ། གའི་གནང་གི་མ་རེད། ལ་སོ་ལ་སོ། ངས་ཤེས་མ་སོང་། ཡང་བསྐྱར་གསུངས་དང་། ག་ལེར་གསུངས་དང་། ཤེས་སོང་ངམ། ངས་ཤེས་སོང་།'.split()),
    ('Frequent-Expressions-3-1.m4a', 'phrase', 'སྐུ་ཁམས་བཟང་། དགོངས་དག གཟབ་གཟབ་གནང་གོ། སྤྲོ་པོ་གནང་གོ། བཀའ་དྲིན་ཆེ། རྗེས་མར་མཇལ་ཡོང་།'.split()),
]
# the longest clip of a recording may be this many times the median one (a spelled two-syllable word against a one-syllable one)
MAX_RATIO = {'sign': 2.2, 'word': 4.0, 'spelled': 4.0, 'phrase': 3.0}
SPEC += [(x['file'], x['mode'], x['items']) for x in EXTRA]
PREFIX = {'sign': 'sign', 'word': 'msu', 'spelled': 'spell', 'phrase': 'phrase'}

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
    # clicks at the ends
    while segs and segs[0][1] - segs[0][0] < 0.2: segs.pop(0)
    while segs and segs[-1][1] - segs[-1][0] < 0.2: segs.pop()
    return segs, dur

def merge_gaps(segs, g):
    out = []
    for b, e in segs:
        if out and b - out[-1][1] < g: out[-1] = (out[-1][0], e)
        else: out.append((b, e))
    return out

def fit(segs, n, ratio):
    """Drop a spoken introduction if there is one, merge the pauses shorter than g: the largest g that gives n plausible items."""
    for drop in (0, 1):
        s = segs[drop:]
        if drop and not (segs[0][1] - segs[0][0] > 1.8): continue
        for g10 in range(90, 10, -1):
            m = merge_gaps(s, g10 / 100)
            # two items read without a pause: split the longest items at their widest inner pause
            while len(m) < n:
                longest = max(range(len(m)), key=lambda i: m[i][1] - m[i][0])
                inner = [x for x in s if x[0] >= m[longest][0] and x[1] <= m[longest][1]]
                if len(inner) < 2: break
                k = max(range(len(inner) - 1), key=lambda i: inner[i + 1][0] - inner[i][1])
                m[longest:longest + 1] = [(m[longest][0], inner[k][1]), (inner[k + 1][0], m[longest][1])]
            if len(m) != n: continue
            lens = sorted(e - b for b, e in m)
            med = lens[len(lens) // 2]
            if lens[0] < 0.2 or lens[-1] > ratio * med: continue
            return m, drop, g10 / 100
    return None, None, None

def clip_id(mode, tib, n):
    if mode == 'phrase': return f'phrase-{n:02d}'
    return PREFIX[mode] + '-' + '-'.join('%04x' % ord(c) for c in tib)

tables = {m: [] for m in PREFIX}
report, html = [], []
phrase_no = 0
for fname, mode, items in SPEC:
    f = os.path.join(SRC, fname)
    if not os.path.exists(f): report.append(f'{fname}: missing'); continue
    done = False
    for noise, d in [(-40, 0.12), (-35, 0.15), (-45, 0.1), (-35, 0.22), (-30, 0.2), (-50, 0.1)]:
        segs, dur = segments(f, noise, d)
        m, drop, g = fit(segs, len(items), MAX_RATIO[mode])
        if m: done = True; break
    if not done:
        report.append(f'{fname}: no cut gives {len(items)} items (raw {len(segs)}); skipped')
        continue
    lens = [e - b for b, e in m]
    report.append(f'{fname}: {len(segs)} raw at {noise}dB/{d}s, dropped {drop}, gaps < {g}s merged -> {len(items)} items; {min(lens):.2f}-{max(lens):.2f}s, median {statistics.median(lens):.2f}s')
    html.append(f'<h2>{fname} ({mode})</h2>')
    for (b, e), tib in zip(m, items):
        start, end = max(0.0, b - 0.06), min(dur, e + 0.10)
        if mode == 'phrase': phrase_no += 1
        cid = clip_id(mode, tib, phrase_no)
        out = os.path.join(OUT, cid + '.mp3')
        _, err = run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-ss', f'{start:.3f}', '-to', f'{end:.3f}', '-i', f, '-af', 'afade=t=in:d=0.015,afade=t=out:st=%.3f:d=0.03' % (end - start - 0.03), '-ar', '16000', '-ac', '1', '-codec:a', 'libmp3lame', '-b:a', '48k', out])
        if err.strip(): report.append(f'  ffmpeg: {err.strip()[:100]}')
        tables[mode].append((tib, cid, fname, round(start, 2), round(end, 2)))
        html.append(f'<div><span class="t">{tib}</span> <code>{cid}</code> {end - start:.2f}s <audio controls preload="none" src="{cid}.mp3"></audio></div>')

HEAD = ['# {what}: tib | clip id | source recording | start | end (seconds).',
        '# Cut by scripts/tools/msu-audio.py from "Basic Tibetan" (Jampa Khedup, Sonam Tsering et al., Michigan State',
        '# University Libraries, CC BY-NC 4.0, https://openbooks.lib.msu.edu/basictibetan/). The clips <clip id>.mp3 live',
        '# beside the word clips on the server (AUDIO_BASE).']
WHAT = {'sign': ('sign-audio.tsv', 'Native recordings of the signs of the alphabet'), 'spelled': ('spelling-audio.tsv', 'Words spelled out letter by letter and then read, by a native speaker'),
        'word': ('word-audio.tsv', 'Words read plainly by a native speaker'), 'phrase': ('phrase-audio.tsv', 'Frequent colloquial expressions read by a native speaker')}
for mode, (name, what) in WHAT.items():
    rows = [h.replace('{what}', what) for h in HEAD]
    for tib, cid, src, b, e in tables[mode]: rows.append(f'{tib} | {cid} | {src} | {b} | {e}')
    io.open(os.path.join(OUT, name), 'w', encoding='utf8', newline='\n').write('\n'.join(rows) + '\n')
io.open(os.path.join(OUT, 'index.html'), 'w', encoding='utf8', newline='\n').write('<!doctype html><meta charset="utf-8"><title>MSU clips</title><style>body{font-family:sans-serif;max-width:900px;margin:20px auto}.t{font-size:1.6em;display:inline-block;min-width:6em}div{display:flex;align-items:center;gap:12px;margin:4px 0}</style>' + '\n'.join(html))
io.open(os.path.join(OUT, 'report.txt'), 'w', encoding='utf8', newline='\n').write('\n'.join(report) + '\n')
print('\n'.join(report))
print({m: len(t) for m, t in tables.items()})
