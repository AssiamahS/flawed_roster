import fs from "node:fs/promises";
import path from "node:path";

const seed = process.argv.slice(2).join(" ") ||
  "pigeon fused with a cybertruck";

const system = `You are a viral Italian Brainrot writer. Given a chimera seed (animal + object), output a TikTok character kit. Reply immediately in the EXACT format below — no preamble, no thinking, no markdown fences.

NAME: <2-4 pseudo-Italian words, -ino/-ina/-ello/-ato/-ana endings, rhyming and chantable>
LYRICS: <10-18 seconds of Italian-accented nonsense. Start by naming the character twice. Use filler sounds (picci picci, brr brr, tralala, tung tung, sbada bim, la la la). End with a rhyming visual descriptor. 25-35 words. Brand-safe: NO religion, NO politics, NO violence, NO slurs.>
IMAGE_PROMPT: <one dense English paragraph for Flux: photorealistic 9:16 portrait, the fusion looking absurd and dreamlike, cinematic golden-hour lighting, shallow depth of field, film grain, centered subject, surreal, charming.>

Examples of the style — do not copy these:
NAME: Piccione Macchina
LYRICS: Piccione macchina, piccione macchina! Picci picci ad ore mattina, sbada bim, sbada bim! Tralala truccino, scarpe bianche da spingipista, la la la!
IMAGE_PROMPT: A hyper-detailed photorealistic 9:16 portrait of a pigeon seamlessly fused with a Tesla Cybertruck — the bird's feathered head and beady eyes merged onto angular stainless-steel body panels, geometric windows across its chest, glowing LED headlights under its beak, perched on wet Milan cobblestones at golden hour, dramatic rim light, film grain, shallow depth of field, uncanny valley charm, centered subject.`;

const body = {
  model: "mistral",
  messages: [
    { role: "system", content: system },
    { role: "user", content: `chimera: ${seed}` },
  ],
  max_tokens: 900,
  temperature: 1.0,
};

const resp = await fetch("https://text.pollinations.ai/openai", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

if (!resp.ok) {
  console.error(`Pollinations text ${resp.status}: ${await resp.text()}`);
  process.exit(1);
}

const json = await resp.json();
const msg = json?.choices?.[0]?.message ?? {};
const text = msg.content || msg.reasoning_content || "";
if (!text) {
  console.error(`No content: ${JSON.stringify(json).slice(0, 500)}`);
  process.exit(1);
}

function field(label) {
  const re = new RegExp(`${label}\\s*:\\s*(.+?)(?=\\n[A-Z_]{3,}\\s*:|$)`, "is");
  const m = text.match(re);
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : null;
}

const out = {
  name: field("NAME"),
  lyrics: field("LYRICS"),
  image_prompt: field("IMAGE_PROMPT"),
};

if (!out.name || !out.lyrics || !out.image_prompt) {
  console.error(`Parse failed. Raw: ${text.slice(0, 800)}`);
  process.exit(1);
}

await fs.mkdir("out", { recursive: true });
const outPath = path.join("out", `script-${Date.now()}.json`);
await fs.writeFile(outPath, JSON.stringify(out, null, 2));
process.stdout.write(outPath);
