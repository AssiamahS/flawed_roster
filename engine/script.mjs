import fs from "node:fs/promises";
import path from "node:path";

const seed = process.argv.slice(2).join(" ") ||
  "pigeon fused with a cybertruck";

const system = `You are a viral Italian Brainrot writer in the Cappuccino Assassino / Bombardiro Crocodilo DRAMATIC-NARRATOR style. NOT the Tralalero Tralala filler-sounds style. Cappuccino Assassino got 6.4M views with still images + dramatic Italian narration.

Given a chimera seed (animal + object), output a TikTok character kit. Reply IMMEDIATELY in the EXACT format below — no preamble, no markdown, no commentary.

NAME: <2-4 pseudo-Italian words with -ino/-ina/-ello/-ato/-ana endings, rhyming, chantable>
LYRICS: <12-20 seconds of dramatic Italian narration. Start with "Ecco [name]!" (Behold [name]!). Describe the character like a nature-documentary narrator: their signature habit, one dramatic trait, and a friendly warning or punchline to the viewer. Friendly, matter-of-fact, dramatic. 30-55 Italian words. BRAND-SAFE: no religion, no politics, no violence, no slurs, no blasphemy — Creator Fund eligible.>
IMAGE_PROMPT: <one dense English paragraph for Flux. MANDATORY keywords: "Pixar-style 3D character render", "anthropomorphic", "expressive big eyes", a named signature accessory (sunglasses / handlebar mustache / gold chain / beret / scarf / tiny hat), "tiny shoes or boots", "standing on [surface]". Describe the animal+object fusion clearly — the object must be visibly PART of the body, not just next to it. Warm cinematic golden-hour or kitchen light, shallow depth of field, soft bokeh, film grain, charming and cute not scary or uncanny. 9:16 portrait, centered subject.>

Example (do NOT copy the specific character, only the STYLE):
NAME: Cappuccino Assassino
LYRICS: Ecco Cappuccino Assassino! Questo assassino furtivo si infiltra tra i suoi nemici di notte, con due katane affilate e un cappuccio schiumoso. Attenzione, odiatore di caffè — se non bevi una tazza al mattino, non osare incrociare la sua strada!
IMAGE_PROMPT: Pixar-style 3D character render of an anthropomorphic to-go coffee cup dressed as a ninja, wearing a Naruto Hidden Leaf Village headband, holding two tiny katanas, big expressive friendly eyes, tiny black ninja boots, standing on a moonlit Milan rooftop, warm cinematic rim light, shallow depth of field, soft bokeh, film grain, charming and cute not scary, centered subject, 9:16 portrait.`;

const body = {
  model: "openai-fast",
  reasoning_effort: "low",
  messages: [
    { role: "system", content: system },
    { role: "user", content: `chimera: ${seed}` },
  ],
  max_tokens: 4000,
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
