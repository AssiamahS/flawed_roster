import fs from "node:fs/promises";
import path from "node:path";

const seed = process.argv.slice(2).join(" ") ||
  "pigeon fused with a cybertruck";

const system = `You are a viral Italian Brainrot writer. Given a chimera seed (animal + object), output a TikTok character kit.

Return STRICT JSON with three fields:
1. "name": 2-4 pseudo-Italian words. Use -ino/-ina/-ello/-ato/-ana endings. Rhyming, chantable, playful. Examples: "Piccione Macchina", "Bombardiro Crocodilo", "Ballerina Cappuccina".
2. "lyrics": 10-18 seconds of Italian-accented nonsense. Start by naming the character twice. Use filler sounds (picci picci, brr brr, tralala, tung tung, sbada bim, la la la). End with a rhyming visual descriptor. No more than 35 words total. Absolutely NO religion, NO politics, NO violence, NO slurs — brand-safe for TikTok Creator Fund.
3. "image_prompt": one-paragraph English prompt for Flux. Photorealistic, portrait 9:16, the fusion looking absurd and dreamlike, cinematic golden-hour lighting, shallow depth of field, film grain, centered subject, uncanny valley but charming. Describe the chimera clearly so the model renders the fusion.

Return ONLY the JSON. No markdown fences, no commentary.`;

const body = {
  model: "openai-fast",
  messages: [
    { role: "system", content: system },
    { role: "user", content: `chimera: ${seed}` },
  ],
  response_format: { type: "json_object" },
  max_tokens: 700,
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
const content = json?.choices?.[0]?.message?.content;
if (!content) {
  console.error(`No content in response: ${JSON.stringify(json).slice(0, 500)}`);
  process.exit(1);
}

let out;
try {
  out = JSON.parse(content);
} catch {
  const m = content.match(/\{[\s\S]*\}/);
  if (!m) {
    console.error("Script not JSON: " + content.slice(0, 500));
    process.exit(1);
  }
  out = JSON.parse(m[0]);
}

if (!out.name || !out.lyrics || !out.image_prompt) {
  console.error("Missing fields: " + JSON.stringify(out));
  process.exit(1);
}

await fs.mkdir("out", { recursive: true });
const outPath = path.join("out", `script-${Date.now()}.json`);
await fs.writeFile(outPath, JSON.stringify(out, null, 2));
process.stdout.write(outPath);
