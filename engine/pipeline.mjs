import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const seed = process.argv.slice(2).join(" ") ||
  "pigeon fused with a cybertruck";

console.error(`> seed: ${seed}`);

function run(script, args) {
  const r = spawnSync("node", [script, ...args], {
    encoding: "utf8",
    stdio: ["inherit", "pipe", "inherit"],
  });
  if (r.status !== 0) {
    console.error(`${script} exited ${r.status}`);
    process.exit(r.status || 1);
  }
  return r.stdout.trim();
}

const scriptPath = run("engine/script.mjs", [seed]);
const script = JSON.parse(await fs.readFile(scriptPath, "utf8"));
console.error(`> name:   ${script.name}`);
console.error(`> lyrics: ${script.lyrics}`);

const imgPath = run("engine/image.mjs", [script.image_prompt]);
console.error(`> image:  ${imgPath}`);

const voicePath = run("engine/voice.mjs", [script.lyrics]);
console.error(`> voice:  ${voicePath}`);

const captionsPath = run("engine/captions.mjs", [voicePath]);
console.error(`> caps:   ${captionsPath}`);

const nichesCfg = JSON.parse(await fs.readFile("config/niches.json", "utf8"));
const nicheKey = process.env.NICHE || nichesCfg.active;
const nicheProfile = nichesCfg.profiles[nicheKey];
const composer = nicheProfile?.composer === "dance" ? "engine/dance_render.mjs" : "engine/compose.mjs";

const clipPath = run(composer, [imgPath, voicePath, script.name, captionsPath]);
console.error(`> clip:   ${clipPath}`);

const entry = {
  id: path.basename(clipPath, ".mp4"),
  seed,
  name: script.name,
  lyrics: script.lyrics,
  image_prompt: script.image_prompt,
  image: imgPath,
  voice: voicePath,
  captions: captionsPath,
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
