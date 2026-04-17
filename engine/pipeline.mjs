import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const prompt = process.argv.slice(2).join(" ") ||
  "three facts about the octopus";

console.error(`> prompt: ${prompt}`);

const imgPath = execSync(`node engine/image.mjs "${prompt}, cinematic 9:16, moody"`, {
  encoding: "utf8",
  stdio: ["inherit", "pipe", "inherit"],
}).trim();
console.error(`> image: ${imgPath}`);

const voicePath = execSync(`node engine/voice.mjs "${prompt}"`, {
  encoding: "utf8",
  stdio: ["inherit", "pipe", "inherit"],
}).trim();
console.error(`> voice: ${voicePath}`);

const clipPath = execSync(`node engine/compose.mjs "${imgPath}" "${voicePath}"`, {
  encoding: "utf8",
  stdio: ["inherit", "pipe", "inherit"],
}).trim();
console.error(`> clip:  ${clipPath}`);

const entry = {
  id: path.basename(clipPath, ".mp4"),
  prompt,
  image: imgPath,
  voice: voicePath,
  clip: clipPath,
  created_at: new Date().toISOString(),
};

const qPath = "docs/queue.json";
let q = { clips: [], updated_at: null };
try { q = JSON.parse(await fs.readFile(qPath, "utf8")); } catch {}
q.clips.unshift(entry);
q.clips = q.clips.slice(0, 50);
q.updated_at = entry.created_at;
await fs.writeFile(qPath, JSON.stringify(q, null, 2));

process.stdout.write(clipPath);
