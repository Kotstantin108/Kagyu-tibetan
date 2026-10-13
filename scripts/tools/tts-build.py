"""Synthesises pronunciation clips for the course with an OpenPecha MMS-VITS voice.

Usage: python tts-build.py <texts.json> <out_dir> [--model openpecha/op-mms-ft-v3] [--speaker 0]

texts.json is written by scripts/tools/tts-texts.mjs: [{ "id": "w-bla-ma", "text": "བླ་མ་" }, ...].
Writes <out_dir>/<id>.mp3 (16 kHz mono) and skips ids that already exist, so the
script can be re-run after the content changes. Runs on a CPU at about real time.
"""
import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
from transformers import AutoTokenizer, VitsModel


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("texts")
    ap.add_argument("out_dir")
    ap.add_argument("--model", default="openpecha/op-mms-ft-v3")
    ap.add_argument("--speaker", type=int, default=0)
    args = ap.parse_args()

    items = json.loads(Path(args.texts).read_text(encoding="utf-8"))
    out = Path(args.out_dir)
    out.mkdir(parents=True, exist_ok=True)
    todo = [it for it in items if not (out / f"{it['id']}.mp3").exists()]
    print(f"{len(items)} texts, {len(todo)} to synthesise with {args.model}", flush=True)
    if not todo:
        return

    tok = AutoTokenizer.from_pretrained(args.model)
    model = VitsModel.from_pretrained(args.model).eval()
    sr = model.config.sampling_rate
    multi = (getattr(model.config, "num_speakers", 1) or 1) > 1
    torch.set_num_threads(max(1, torch.get_num_threads() - 1))

    t0 = time.time()
    for n, it in enumerate(todo, 1):
        text = it["text"].replace("།", "").strip()
        inputs = tok(text, return_tensors="pt")
        if multi:
            inputs["speaker_id"] = torch.tensor([args.speaker])
        torch.manual_seed(1)
        with torch.no_grad():
            wav = model(**inputs).waveform[0].numpy()
        peak = float(np.abs(wav).max()) or 1.0
        wav = np.clip(wav / peak * 0.85, -1, 1)
        # trim leading/trailing near-silence, keep 60 ms of air
        thr = 0.01
        idx = np.where(np.abs(wav) > thr)[0]
        if len(idx):
            a, b = max(0, idx[0] - int(0.06 * sr)), min(len(wav), idx[-1] + int(0.06 * sr))
            wav = wav[a:b]
        sf.write(out / f"{it['id']}.mp3", wav, sr, format="MP3", subtype="MPEG_LAYER_III")
        if n % 50 == 0 or n == len(todo):
            el = time.time() - t0
            print(f"{n}/{len(todo)} done, {el / 60:.1f} min, eta {(len(todo) - n) * el / n / 60:.1f} min", flush=True)


if __name__ == "__main__":
    sys.exit(main())
