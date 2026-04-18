import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const [, , img, audio, title] = process.argv;
if (!img || !audio) {
  console.error("usage: compose.mjs <image.png> <audio> [title]");
  process.exit(1);
}

await fs.mkdir("out", { recursive: true });
const out = path.join("out", `clip-${Date.now()}.mp4`);

const vfParts = [
  "scale=1080:1920:force_original_aspect_ratio=increase",
  "crop=1080:1920",
  "zoompan=z='min(zoom+0.0012,1.18)':d=1:s=1080x1920:fps=30",
  "format=yuv420p",
];

if (title) {
  const esc = title
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\u2019");
  const font = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
  vfParts.push(
    `drawtext=fontfile=${font}:text='${esc}':fontsize=78:fontcolor=white:borderw=6:bordercolor=black:x=(w-text_w)/2:y=200`,
  );
}

const cmd = [
  "ffmpeg -y",
  `-loop 1 -i "${img}"`,
  `-i "${audio}"`,
  "-c:v libx264 -preset medium -crf 20",
  "-c:a aac -b:a 192k -ar 44100",
  `-vf "${vfParts.join(",")}"`,
  "-r 30 -shortest -movflags +faststart",
  `"${out}"`,
].join(" ");

execSync(cmd, { stdio: "inherit" });
process.stdout.write(out);
