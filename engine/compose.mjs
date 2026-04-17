import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const [, , img, audio] = process.argv;
if (!img || !audio) {
  console.error("usage: compose.mjs <image.png> <audio.wav>");
  process.exit(1);
}

await fs.mkdir("out", { recursive: true });
const out = path.join("out", `clip-${Date.now()}.mp4`);

const vf = [
  "scale=1080:1920:force_original_aspect_ratio=increase",
  "crop=1080:1920",
  "zoompan=z='min(zoom+0.0012,1.18)':d=1:s=1080x1920:fps=30",
  "format=yuv420p",
].join(",");

const cmd = [
  "ffmpeg -y",
  `-loop 1 -i "${img}"`,
  `-i "${audio}"`,
  "-c:v libx264 -preset medium -crf 20",
  "-c:a aac -b:a 192k -ar 44100",
  `-vf "${vf}"`,
  "-r 30 -shortest -movflags +faststart",
  `"${out}"`,
].join(" ");

execSync(cmd, { stdio: "inherit" });
process.stdout.write(out);
