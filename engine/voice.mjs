import { InferenceClient } from "@huggingface/inference";
import fs from "node:fs/promises";
import path from "node:path";

const token = process.env.HF_TOKEN;
if (!token) {
  console.error("HF_TOKEN not set");
  process.exit(1);
}

const text = process.argv.slice(2).join(" ") ||
  "Three things you didn't know about the deep ocean.";

const hf = new InferenceClient(token);

const blob = await hf.textToSpeech({
  provider: "hf-inference",
  model: "facebook/mms-tts-eng",
  inputs: text,
});

const buf = Buffer.from(await blob.arrayBuffer());
await fs.mkdir("out", { recursive: true });
const out = path.join("out", `voice-${Date.now()}.wav`);
await fs.writeFile(out, buf);
process.stdout.write(out);
