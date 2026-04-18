import Replicate from "replicate";
import fs from "node:fs/promises";
import path from "node:path";

const token = process.env.REPLICATE_API_TOKEN;
if (!token) {
  console.error("REPLICATE_API_TOKEN not set");
  process.exit(1);
}

const prompt = process.argv.slice(2).join(" ") ||
  "cinematic 9:16 portrait, moody studio lighting, shallow depth of field, film grain";

const replicate = new Replicate({ auth: token });

const output = await replicate.run("black-forest-labs/flux-schnell", {
  input: {
    prompt,
    aspect_ratio: "9:16",
    output_format: "png",
    num_outputs: 1,
    num_inference_steps: 4,
  },
});

const item = Array.isArray(output) ? output[0] : output;
let buf;
if (typeof item === "string") {
  buf = Buffer.from(await (await fetch(item)).arrayBuffer());
} else {
  buf = Buffer.from(await new Response(item).arrayBuffer());
}

await fs.mkdir("out", { recursive: true });
const outPath = path.join("out", `image-${Date.now()}.png`);
await fs.writeFile(outPath, buf);
process.stdout.write(outPath);
