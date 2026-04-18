import fs from "node:fs/promises";
import path from "node:path";

const prompt = process.argv.slice(2).join(" ") ||
  "cinematic 9:16 portrait, moody studio lighting, shallow depth of field, film grain";

const url = new URL(`https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}`);
url.searchParams.set("width", "720");
url.searchParams.set("height", "1280");
url.searchParams.set("model", "flux");
url.searchParams.set("nologo", "true");
url.searchParams.set("enhance", "true");
url.searchParams.set("seed", String(Date.now() % 1_000_000));

const resp = await fetch(url, { headers: { "Accept": "image/png" } });
if (!resp.ok) {
  console.error(`Pollinations ${resp.status}: ${await resp.text()}`);
  process.exit(1);
}

const buf = Buffer.from(await resp.arrayBuffer());
if (buf.length < 1024) {
  console.error(`Image too small (${buf.length}B), likely an error page`);
  process.exit(1);
}

await fs.mkdir("out", { recursive: true });
const outPath = path.join("out", `image-${Date.now()}.png`);
await fs.writeFile(outPath, buf);
process.stdout.write(outPath);
