import fs from "node:fs/promises";
import path from "node:path";

const text = process.argv.slice(2).join(" ") ||
  "Three things you didn't know about the deep ocean.";

const url = new URL("https://api.streamelements.com/kappa/v2/speech");
url.searchParams.set("voice", "Brian");
url.searchParams.set("text", text);

const resp = await fetch(url, { headers: { "Accept": "audio/mpeg" } });
if (!resp.ok) {
  console.error(`StreamElements ${resp.status}: ${await resp.text()}`);
  process.exit(1);
}

const buf = Buffer.from(await resp.arrayBuffer());
if (buf.length < 1024) {
  console.error(`Audio too small (${buf.length}B), likely an error page`);
  process.exit(1);
}

await fs.mkdir("out", { recursive: true });
const outPath = path.join("out", `voice-${Date.now()}.mp3`);
await fs.writeFile(outPath, buf);
process.stdout.write(outPath);
