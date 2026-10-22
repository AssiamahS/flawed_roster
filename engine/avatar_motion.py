"""Real motion transfer on Replicate: avatar image + reference dance clip -> new clip.
Stdlib only. Token comes from REPLICATE_API_TOKEN; nothing secret is printed."""
import json, os, subprocess, sys, time, urllib.request, urllib.error

API = "https://api.replicate.com/v1"
TOKEN = os.environ.get("REPLICATE_API_TOKEN", "")
BACKEND = os.environ.get("BACKEND", "replicate")
OUT = os.environ.get("OUT_DIR", "out")
os.makedirs(OUT, exist_ok=True)

def call(method, path, body=None):
    req = urllib.request.Request(API + path if path.startswith("/") else path, method=method,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json", "User-Agent": "avatar-motion/1.0 (+github actions)"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        raw = e.read() or b"{}"
        try:
            return e.code, json.loads(raw)
        except ValueError:
            return e.code, {"detail": raw.decode("utf-8", "replace")[:300]}

def upload(path, ctype):
    r = subprocess.run(["curl", "-s", "-X", "POST", "-H", f"Authorization: Bearer {TOKEN}",
                        "-F", f"content=@{path};type={ctype};filename={os.path.basename(path)}", f"{API}/files"],
                       capture_output=True, text=True, check=True)
    d = json.loads(r.stdout)
    if "urls" not in d: sys.exit(f"file upload failed: {json.dumps(d)[:300]}")
    return d["urls"]["get"]

def schema(model):
    code, m = call("GET", f"/models/{model}")
    if code != 200: sys.exit(f"model {model}: HTTP {code} {json.dumps(m)[:300]}")
    props = m["latest_version"]["openapi_schema"]["components"]["schemas"]["Input"]["properties"]
    print(f"[{model}] inputs:", ", ".join(f"{k}{'=' + str(v.get('default')) if 'default' in v else ''}" for k, v in props.items()))
    return props

def run(model, inp, label):
    print(f"[{label}] submit {model} with {sorted(inp)}")
    code, p = call("POST", f"/models/{model}/predictions", {"input": inp})
    if code >= 300: sys.exit(f"[{label}] rejected HTTP {code}: {p.get('detail') or json.dumps(p)[:400]}")
    t0, last = time.time(), None
    while p.get("status") not in ("succeeded", "failed", "canceled"):
        if p.get("status") != last: print(f"[{label}] {p.get('status')} t+{int(time.time() - t0)}s", flush=True); last = p.get("status")
        if time.time() - t0 > 1500: sys.exit(f"[{label}] timed out")
        time.sleep(5); _, p = call("GET", p["urls"]["get"])
    print(f"[{label}] {p['status']} in {int(time.time() - t0)}s metrics={p.get('metrics')}")
    if p["status"] != "succeeded": sys.exit(f"[{label}] error: {str(p.get('error'))[:500]}")
    out = p["output"]
    return out[0] if isinstance(out, list) else out

def fetch(url, path):
    req = urllib.request.Request(url, headers={"User-Agent": "avatar-motion/1.0"})
    with urllib.request.urlopen(req, timeout=300) as r, open(path, "wb") as f: f.write(r.read())
    print("saved", path, os.path.getsize(path), "bytes")

# ---- 1. reference clip: download, trim, crop to 9:16
src = os.path.join(OUT, "src.mp4"); ref = os.path.join(OUT, "reference.mp4")
fetch(os.environ["VIDEO_URL"], src)
vf = "crop='min(iw,ih*9/16)':'min(ih,iw*16/9)',scale=720:1280"
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", os.environ.get("TRIM_START", "0"), "-t", os.environ.get("DURATION", "6"),
                "-i", src, "-vf", vf, "-c:v", "libx264", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart", ref], check=True)
os.remove(src)

# ---- 2. avatar: given URL, or generate one
avatar = os.path.join(OUT, "avatar.png")
if os.environ.get("IMAGE_PATH"):
    import shutil; shutil.copy(os.environ["IMAGE_PATH"], avatar); print("avatar from", os.environ["IMAGE_PATH"])
elif os.environ.get("IMAGE_URL"):
    fetch(os.environ["IMAGE_URL"], avatar)
else:
    img_model = os.environ.get("IMAGE_MODEL", "black-forest-labs/flux-1.1-pro")
    props = schema(img_model)
    inp = {"prompt": os.environ["AVATAR_PROMPT"]}
    if "aspect_ratio" in props: inp["aspect_ratio"] = "9:16"
    if "output_format" in props: inp["output_format"] = "png"
    if "safety_tolerance" in props: inp["safety_tolerance"] = 2
    fetch(run(img_model, inp, "avatar"), avatar)

# ---- 3. motion transfer
final = os.path.join(OUT, "avatar-dance.mp4")

def run_hf():
    """Free path: a public Wan 2.2 Animate Space on ZeroGPU (quota-limited, slow, short clips)."""
    from gradio_client import Client, handle_file
    space = os.environ.get("HF_SPACE", "alexnasa/Wan2.2-Animate-ZEROGPU")
    print(f"[hf] connecting to {space}", flush=True)
    client = Client(space, hf_token=os.environ.get("HF_TOKEN") or None, verbose=False)
    t0 = time.time()
    res = client.predict(input_video={"video": handle_file(ref)}, max_duration_s=float(os.environ.get("DURATION", "4")),
                         edited_frame=handle_file(avatar), rc_str="Character Swap",
                         resolution_choice=os.environ.get("HF_RESOLUTION", "Low Res"), api_name="/animate_scene")
    print(f"[hf] finished in {int(time.time() - t0)}s -> {str(res)[:200]}")
    path = res.get("video") if isinstance(res, dict) else (res[0] if isinstance(res, (list, tuple)) else res)
    if isinstance(path, dict): path = path.get("video") or path.get("path")
    import shutil; shutil.copy(path, final)

if BACKEND == "hf":
    run_hf()
model = os.environ.get("MOTION_MODEL", "wan-video/wan-2.2-animate-replace")
def pick(props, *words):
    for k, v in props.items():
        if v.get("format") == "uri" and any(w in k.lower() for w in words): return k
    for k in props:
        if any(w in k.lower() for w in words): return k
if BACKEND != "hf":
    props = schema(model)
    img_key, vid_key = pick(props, "character", "image"), pick(props, "video")
    if not img_key or not vid_key: sys.exit(f"cannot map inputs for {model}: {list(props)}")
    inp = {img_key: upload(avatar, "image/png"), vid_key: upload(ref, "video/mp4")}
    extra = json.loads(os.environ.get("EXTRA_JSON") or "{}")
    for k, v in extra.items():
        if k in props: inp[k] = v
        else: print(f"ignoring unknown input {k}")
    fetch(run(model, inp, "motion"), final)

# ---- 4. put the clip audio back if the model returned a silent video
has_audio = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", final],
                           capture_output=True, text=True).stdout.strip()
ref_audio = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", ref],
                           capture_output=True, text=True).stdout.strip()
if not has_audio and ref_audio:
    tmp = final + ".tmp.mp4"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", final, "-i", ref, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-shortest", tmp], check=True)
    os.replace(tmp, final); print("merged reference audio")
# side-by-side preview: reference | result
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", ref, "-i", final, "-filter_complex",
                "[0:v]scale=540:960,setsar=1[a];[1:v]scale=540:960,setsar=1[b];[a][b]hstack=2[v]", "-map", "[v]", "-map", "1:a:0?",
                "-c:v", "libx264", "-crf", "22", "-pix_fmt", "yuv420p", "-shortest", os.path.join(OUT, "side-by-side.mp4")], check=True)
print(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height", "-of", "compact", final],
                     capture_output=True, text=True).stdout)
