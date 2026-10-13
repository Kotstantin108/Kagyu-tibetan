"""Trial run of OpenPecha / Monlam AI Tibetan TTS (MMS-VITS fine-tunes).

Usage: python tts-trial.py <out_dir> <model_id> [<model_id> ...]
Variants per model: default, and "slow" (speaking_rate 0.7, noise_scale 0.5,
noise_scale_duration 0.6). Writes <out_dir>/<model>-<variant>/<n>-<id>.wav and index.txt.
"""
import sys
import time
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
from transformers import AutoTokenizer, VitsModel

SAMPLES = [
    ("bla-ma", "བླ་མ་", "guru"),
    ("dgon-pa-dmar-po", "དགོན་པ་དམར་པོ་", "red monastery"),
    ("nga-slob-ma-yin", "ང་སློབ་མ་ཡིན།", "I am a student."),
    ("s120", "དགོན་པ་དཀར་པོའི་བླ་མ་བཟང་པོ་", "the excellent guru of the white monastery"),
    ("s700", "ཁོང་གིས་བླ་མ་ལ་མཆོད་པ་འབུལ་ཞིང་ཕྱག་འཚལ་ལོ།", "He makes offerings to the guru and prostrates to him."),
]

VARIANTS = {
    "default": {},
    "slow": {"speaking_rate": 0.7, "noise_scale": 0.5, "noise_scale_duration": 0.6},
}


def run(model_id, out_dir):
    name = model_id.split("/")[-1]
    t0 = time.time()
    tok = AutoTokenizer.from_pretrained(model_id)
    model = VitsModel.from_pretrained(model_id).eval()
    sr = model.config.sampling_rate
    print(f"{model_id}: loaded in {time.time() - t0:.1f}s, sr {sr}, speaking_rate {model.config.speaking_rate}, noise {model.config.noise_scale}/{model.config.noise_scale_duration}")
    n_spk = getattr(model.config, "num_speakers", 1) or 1
    for spk in range(n_spk):
      for vname, params in VARIANTS.items():
        for k, v in params.items():
            setattr(model, k, v)
        out = Path(out_dir) / f"{name}-spk{spk}-{vname}"
        out.mkdir(parents=True, exist_ok=True)
        lines = []
        for i, (sid, tib, en) in enumerate(SAMPLES, 1):
            torch.manual_seed(1)
            inputs = tok(tib, return_tensors="pt")
            if n_spk > 1:
                inputs["speaker_id"] = torch.tensor([spk])
            with torch.no_grad():
                wav = model(**inputs).waveform[0].numpy()
            wav = np.clip(wav / (np.abs(wav).max() or 1.0) * 0.9, -1, 1)
            path = out / f"{i}-{sid}.wav"
            sf.write(path, wav, sr)
            print(f"  spk{spk} {vname:8s} {path.name}: {len(wav) / sr:.1f}s")
            lines.append(f"{path.name}\t{tib}\t{en}")
        (out / "index.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
        for k in params:
            setattr(model, k, getattr(model.config, k))


if __name__ == "__main__":
    out_dir = sys.argv[1]
    for m in sys.argv[2:] or ["openpecha/op-mms-ft-v8"]:
        run(m, out_dir)
