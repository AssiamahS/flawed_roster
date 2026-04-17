# flawed_roster

AI-generated vertical video engine. Runs on GitHub Actions + Codespaces — no local build required.

## stack

- Hugging Face Inference API — image (FLUX.1) + voice (MMS-TTS)
- ffmpeg — ken-burns composition → 1080x1920 mp4
- GitHub Actions — scheduled + manual generation
- GitHub Pages (`/docs`) — live queue dashboard

## run local (Codespace recommended)

```bash
npm install
export HF_TOKEN=$(gh secret get HF_TOKEN)   # or pull from codespace env
npm run pipeline -- "three facts about the octopus"
```

Output: `out/clip-<ts>.mp4`

## run in Actions

Actions → **Generate Clip** → Run workflow → enter a prompt.
Artifact appears under the run. Dashboard at `https://assiamahs.github.io/flawed_roster/`.

## layout

```
engine/     image.mjs, voice.mjs, compose.mjs, pipeline.mjs
prompts/    niches.json  — reusable prompt pools
docs/       index.html, queue.json  — Pages dashboard
.github/    workflows/generate.yml
```

## secrets (Actions + Codespaces)

- `HF_TOKEN` — huggingface.co fine-grained, Inference + Read public gated
