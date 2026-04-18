import fs from "node:fs/promises";
import path from "node:path";

const token = process.env.TOGETHER_API_KEY;
if (!token) {
  console.error("TOGETHER_API_KEY not set");
  process.exit(1);
}

const prompt = process.argv.slice(2).join(" ") ||
  "cinematic 9:16 portrait, moody studio lighting, shallow depth of field, film grain";

const resp = await fetch("https://api.together.xyz/v1/images/generations", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "black-forest-labs/FLUX.1-schnell-Free",
    prompt,
    width: 768,
    height: 1344,
    steps: 4,
    n: 1,
    response_format: "b64_json",
  }),
});

if (!resp.ok) {
  console.error(`Together API ${resp.status}: ${await resp.text()}`);
  process.exit(1);
}

const json = await resp.json();
const b64 = json?.data?.[0]?.b64_json;
if (!b64) {
  console.error(`Unexpected response: ${JSON.stringify(json).slice(0, 500)}`);
  process.exit(1);
}

await fs.mkdir("out", { recursive: true });
const outPath = path.join("out", `image-${Date.now()}.png`);
await fs.writeFile(outPath, Buffer.from(b64, "base64"));
process.stdout.write(outPath);
