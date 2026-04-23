import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const [, , img, audio, title, captions] = process.argv;
if (!img || !audio) {
  console.error("usage: greenscreen.mjs <image> <audio> [title] [captions.srt]");
  process.exit(1);
}

const gsUrl = process.env.GS_URL
  || "https://www.tiktok.com/@igreenscreenthings/video/7501863875843755294";
const gsHex = process.env.GS_KEY_COLOR || "0x02f303";
const gsSim = process.env.GS_KEY_SIM || "0.28";
const gsBlend = process.env.GS_KEY_BLEND || "0.12";

const tmp = `/tmp/gs-${Date.now()}`;
await fs.mkdir(tmp, { recursive: true });
const gsMp4 = path.join(tmp, "gs.mp4");

console.error(`> gs: ${gsUrl}`);
execSync(
  `yt-dlp -f "mp4/best" --merge-output-format mp4 -o "${gsMp4}" "${gsUrl}"`,
  { stdio: "inherit" },
);

const gsDur = Number(
  execSync(
    `ffprobe -v error -show_entries format=duration -of csv=p=0 "${gsMp4}"`,
    { encoding: "utf8" },
  ).trim(),
) || 10;
const audioDur = Number(
  execSync(
    `ffprobe -v error -show_entries format=duration -of csv=p=0 "${audio}"`,
    { encoding: "utf8" },
  ).trim(),
) || 10;
const clipDur = Math.min(Math.max(audioDur, 8), Math.min(30, Math.max(gsDur, audioDur)));
console.error(`> gs duration=${gsDur.toFixed(1)}s audio=${audioDur.toFixed(1)}s → clip=${clipDur.toFixed(1)}s`);

await fs.mkdir("out", { recursive: true });
const out = path.join("out", `dance-${Date.now()}.mp4`);

const bgChain = "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,zoompan=z='min(zoom+0.0006,1.08)':d=1:s=1080x1920:fps=30,format=yuv420p";
const dancerChain = `chromakey=color=${gsHex}:similarity=${gsSim}:blend=${gsBlend},despill=type=green:mix=0.5:expand=0,scale=-1:1400,format=yuva420p`;

let extra = "";
if (title) {
  const esc = title.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "’");
  const font = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
  extra += `,drawtext=fontfile=${font}:text='${esc}':fontsize=90:fontcolor=white:borderw=7:bordercolor=black:x=(w-text_w)/2:y=160`;
}
if (captions) {
  const escPath = captions.replace(/:/g, "\\:").replace(/'/g, "\\'");
  const style = [
    "FontName=DejaVu Sans",
    "FontSize=24",
    "Bold=1",
    "PrimaryColour=&H00FFFFFF",
    "OutlineColour=&H00000000",
    "BackColour=&H80000000",
    "Outline=5",
    "Shadow=1",
    "Alignment=5",
    "MarginV=0",
  ].join(",");
  extra += `,subtitles=${escPath}:force_style='${style}'`;
}

const filter = [
  `[0:v]${bgChain}[bg]`,
  `[1:v]${dancerChain}[dancer]`,
  `[bg][dancer]overlay=(W-w)/2:H-h-60${extra}[v]`,
].join(";");

const cmd = [
  "ffmpeg -y",
  `-loop 1 -t ${clipDur.toFixed(2)} -i "${img}"`,
  `-stream_loop -1 -t ${clipDur.toFixed(2)} -i "${gsMp4}"`,
  `-i "${audio}"`,
  `-filter_complex "${filter}"`,
  `-map "[v]" -map 2:a`,
  "-c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p",
  "-c:a aac -b:a 192k -ar 44100",
  "-r 30 -shortest -movflags +faststart",
  `"${out}"`,
].join(" ");

execSync(cmd, { stdio: "inherit" });
await fs.rm(tmp, { recursive: true, force: true });
process.stdout.write(out);
