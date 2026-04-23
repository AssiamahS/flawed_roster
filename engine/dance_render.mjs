import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

const [, , img, audio, title, captions] = process.argv;
if (!img || !audio) {
  console.error("usage: dance_render.mjs <image.png> <audio> [title] [captions.srt]");
  process.exit(1);
}

const animDir = path.join(root, "Animations");
const pool = (await fs.readdir(animDir))
  .filter((f) => f.endsWith(".animation.json") && !f.startsWith("summoning"));
if (pool.length === 0) {
  console.error("no animations found in Animations/");
  process.exit(1);
}
const pick = pool[Math.floor(Math.random() * pool.length)];
const animPath = path.join(animDir, pick);
const animation = JSON.parse(await fs.readFile(animPath, "utf8"));
console.error(`> dance: ${pick}`);

const scene = pathToFileURL(path.join(here, "dance_scene.html")).toString();
const imgUrl = pathToFileURL(path.resolve(img)).toString();

const { default: puppeteer } = await import("puppeteer");
const browser = await puppeteer.launch({
  headless: "new",
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--allow-file-access-from-files"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });

page.on("pageerror", (e) => console.error(`page error: ${e.message}`));
await page.goto(scene);

const color = animation.scene?.characterColors?.[0] || "#5eead4";
await page.evaluate(
  ({ animation, backgroundUrl, color }) => window.__boot({ animation, backgroundUrl, color }),
  { animation, backgroundUrl: imgUrl, color },
);
await page.waitForFunction(() => window.__ready === true, { timeout: 20000 });

const duration = await page.evaluate(() => window.__duration);
const fps = 30;
const audioDurationSec = Number(
  execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${audio}"`, {
    encoding: "utf8",
  }).trim(),
) || 6;
const totalSec = Math.max(3, Math.min(60, audioDurationSec));
const totalFrames = Math.ceil(totalSec * fps);

const framesDir = path.join("out", `frames-${Date.now()}`);
await fs.mkdir(framesDir, { recursive: true });

for (let i = 0; i < totalFrames; i++) {
  const t = i / fps;
  const looped = duration > 0 ? t % duration : 0;
  await page.evaluate((tt) => window.__renderAt(tt), looped);
  const buf = await page.screenshot({ type: "png", omitBackground: false });
  await fs.writeFile(path.join(framesDir, `f-${String(i).padStart(5, "0")}.png`), buf);
}

await browser.close();

await fs.mkdir("out", { recursive: true });
const clipOut = path.join("out", `dance-${Date.now()}.mp4`);

const vfParts = ["format=yuv420p"];
if (title) {
  const esc = title.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "’");
  const font = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
  vfParts.push(
    `drawtext=fontfile=${font}:text='${esc}':fontsize=72:fontcolor=white:borderw=6:bordercolor=black:x=(w-text_w)/2:y=180`,
  );
}
if (captions) {
  const escPath = captions.replace(/:/g, "\\:").replace(/'/g, "\\'");
  const style = [
    "FontName=DejaVu Sans",
    "FontSize=22",
    "Bold=1",
    "PrimaryColour=&H00FFFFFF",
    "OutlineColour=&H00000000",
    "BackColour=&H80000000",
    "Outline=4",
    "Shadow=1",
    "Alignment=5",
    "MarginV=0",
  ].join(",");
  vfParts.push(`subtitles=${escPath}:force_style='${style}'`);
}

const cmd = [
  "ffmpeg -y",
  `-framerate ${fps} -i "${framesDir}/f-%05d.png"`,
  `-i "${audio}"`,
  "-c:v libx264 -preset medium -crf 20",
  "-c:a aac -b:a 192k -ar 44100",
  `-vf "${vfParts.join(",")}"`,
  "-r 30 -shortest -movflags +faststart",
  `"${clipOut}"`,
].join(" ");

execSync(cmd, { stdio: "inherit" });
await fs.rm(framesDir, { recursive: true, force: true });
process.stdout.write(clipOut);
