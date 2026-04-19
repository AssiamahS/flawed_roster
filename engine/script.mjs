import fs from "node:fs/promises";
import path from "node:path";

const seed = process.argv.slice(2).join(" ");

const nichesCfg = JSON.parse(await fs.readFile("config/niches.json", "utf8"));
const nicheKey = process.env.NICHE || nichesCfg.active;
const niche = nichesCfg.profiles[nicheKey];
if (!niche) {
  console.error(`Unknown niche: ${nicheKey}`);
  process.exit(1);
}

const finalSeed = seed || niche.default_seed;
const system = await fs.readFile(niche.system_prompt_file, "utf8");

const body = {
  model: "openai-fast",
  reasoning_effort: "low",
  messages: [
    { role: "system", content: system },
    { role: "user", content: `seed: ${finalSeed}` },
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
  niche: nicheKey,
  seed: finalSeed,
  name: field("NAME"),
  lyrics: field("LYRICS"),
  image_prompt: field("IMAGE_PROMPT"),
  hashtags: niche.hashtags,
};

if (!out.name || !out.lyrics || !out.image_prompt) {
  console.error(`Parse failed. Raw: ${text.slice(0, 800)}`);
  process.exit(1);
}

await fs.mkdir("out", { recursive: true });
const outPath = path.join("out", `script-${Date.now()}.json`);
await fs.writeFile(outPath, JSON.stringify(out, null, 2));
process.stdout.write(outPath);
