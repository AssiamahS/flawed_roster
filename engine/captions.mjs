import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const [, , audioPath] = process.argv;
if (!audioPath) {
  console.error("usage: captions.mjs <audio>");
  process.exit(1);
}

const nichesCfg = JSON.parse(await fs.readFile("config/niches.json", "utf8"));
const nicheKey = process.env.NICHE || nichesCfg.active;
const language = nichesCfg.profiles[nicheKey]?.whisper_language || "it";

await fs.mkdir("out", { recursive: true });
const base = path.basename(audioPath, path.extname(audioPath));
const jsonOut = path.join("out", `${base}.json`);
const srtOut = path.join("out", `${base}.srt`);

execSync(
  `whisper "${audioPath}" --model base --language ${language} --output_format json --output_dir out --word_timestamps True --verbose False`,
  { stdio: "inherit" },
);

const data = JSON.parse(await fs.readFile(jsonOut, "utf8"));

const words = [];
for (const seg of data.segments || []) {
  for (const w of seg.words || []) {
    if (w.word?.trim()) words.push(w);
  }
}

if (!words.length) {
  console.error("whisper returned no words");
  process.exit(1);
}

const chunks = [];
let cur = [];
const maxWords = 3;
const maxDuration = 1.6;
for (const w of words) {
  if (!cur.length) {
    cur.push(w);
    continue;
  }
  const dur = w.end - cur[0].start;
  if (cur.length >= maxWords || dur > maxDuration) {
    chunks.push(cur);
    cur = [w];
  } else {
    cur.push(w);
  }
}
if (cur.length) chunks.push(cur);

function toSrtTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec - Math.floor(sec)) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

const srt = chunks
  .map((chunk, i) => {
    const text = chunk
      .map((w) => w.word.trim())
      .join(" ")
      .toUpperCase();
    const start = toSrtTime(chunk[0].start);
    const end = toSrtTime(chunk[chunk.length - 1].end);
    return `${i + 1}\n${start} --> ${end}\n${text}\n`;
  })
  .join("\n");

await fs.writeFile(srtOut, srt);
process.stdout.write(srtOut);
