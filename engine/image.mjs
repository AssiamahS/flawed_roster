import { InferenceClient } from "@huggingface/inference";
import fs from "node:fs/promises";
import path from "node:path";

const token = process.env.HF_TOKEN;
if (!token) {
  console.error("HF_TOKEN not set");
  process.exit(1);
}

const prompt = process.argv.slice(2).join(" ") ||
  "cinematic 9:16 portrait, moody studio lighting, shallow depth of field, film grain";

const hf = new InferenceClient(token);

const blob = await hf.textToImage({
  provider: "hf-inference",
  model: "stabilityai/stable-diffusion-xl-base-1.0",
  inputs: prompt,
  parameters: { width: 768, height: 1344, num_inference_steps: 30, guidance_scale: 7.5 },
});

const buf = Buffer.from(await blob.arrayBuffer());
await fs.mkdir("out", { recursive: true });
const out = path.join("out", `image-${Date.now()}.png`);
await fs.writeFile(out, buf);
process.stdout.write(out);
