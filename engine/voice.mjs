import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const text = process.argv.slice(2).join(" ") ||
  "Three things you didn't know about the deep ocean.";

const nichesCfg = JSON.parse(await fs.readFile("config/niches.json", "utf8"));
const nicheKey = process.env.NICHE || nichesCfg.active;
const niche = nichesCfg.profiles[nicheKey];

await fs.mkdir("out", { recursive: true });
const outPath = path.join("out", `voice-${Date.now()}.wav`);
const txtPath = path.join("out", `script-${Date.now()}.txt`);
await fs.writeFile(txtPath, text);

const model = process.env.PIPER_MODEL || niche.voice_model_file;

execSync(
  `piper --model "${model}" --output_file "${outPath}" < "${txtPath}"`,
  { stdio: "inherit", shell: "/bin/bash" },
);

process.stdout.write(outPath);
