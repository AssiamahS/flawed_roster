#!/usr/bin/env python3
"""
rip_tiktok.py <url_or_mp4> <out_animation.json>

Downloads a TikTok/YouTube video (or reads a local mp4), runs MediaPipe
Pose on every Nth frame, retargets the 33 landmarks onto Animateur's
11-joint cube rig via hierarchy-aware forward kinematics, and writes
an Animateur-compatible .animation.json.
"""
import json
import math
import os
import subprocess
import sys
import tempfile
from pathlib import Path

if len(sys.argv) != 3:
    print("usage: rip_tiktok.py <url_or_mp4> <out.animation.json>", file=sys.stderr)
    sys.exit(2)

src = sys.argv[1]
out_path = sys.argv[2]
name = Path(out_path).stem.replace(".animation", "")

tmp = Path(tempfile.mkdtemp(prefix="rip_"))
if src.startswith("http") or src.startswith("ytsearch"):
    mp4 = tmp / "input.mp4"
    subprocess.run(
        ["yt-dlp", "-f", "mp4/best", "--merge-output-format", "mp4",
         "-o", str(mp4), src],
        check=True,
    )
else:
    mp4 = Path(src).resolve()
    if not mp4.exists():
        print(f"file not found: {mp4}", file=sys.stderr)
        sys.exit(1)

audio_path = tmp / "audio.mp3"
subprocess.run(
    ["ffmpeg", "-v", "error", "-y", "-i", str(mp4), "-vn",
     "-ac", "2", "-ar", "44100", "-b:a", "192k", str(audio_path)],
    check=True,
)

import cv2
import mediapipe as mp

mp_pose = mp.solutions.pose
cap = cv2.VideoCapture(str(mp4))
src_fps = cap.get(cv2.CAP_PROP_FPS) or 30
total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
sample_hz = 15
step = max(1, int(round(src_fps / sample_hz)))

L_SHOULDER, R_SHOULDER = 11, 12
L_ELBOW, R_ELBOW = 13, 14
L_WRIST, R_WRIST = 15, 16
L_HIP, R_HIP = 23, 24
L_KNEE, R_KNEE = 25, 26
L_ANKLE, R_ANKLE = 27, 28
NOSE = 0

def mp_to_tj(p):
    return (p[0], -p[1], -p[2])

def vsub(a, b): return (a[0]-b[0], a[1]-b[1], a[2]-b[2])
def vmid(a, b): return ((a[0]+b[0])/2, (a[1]+b[1])/2, (a[2]+b[2])/2)
def vlen(v): return math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2])
def vnorm(v):
    m = vlen(v)
    return (v[0]/m, v[1]/m, v[2]/m) if m > 1e-9 else (0.0, 0.0, 0.0)

def qmul(a, b):
    ax, ay, az, aw = a
    bx, by, bz, bw = b
    return (
        aw*bx + ax*bw + ay*bz - az*by,
        aw*by - ax*bz + ay*bw + az*bx,
        aw*bz + ax*by - ay*bx + az*bw,
        aw*bw - ax*bx - ay*by - az*bz,
    )

def qinv(q):
    return (-q[0], -q[1], -q[2], q[3])

def qrot(q, v):
    qx, qy, qz, qw = q
    ix =  qw*v[0] + qy*v[2] - qz*v[1]
    iy =  qw*v[1] + qz*v[0] - qx*v[2]
    iz =  qw*v[2] + qx*v[1] - qy*v[0]
    iw = -qx*v[0] - qy*v[1] - qz*v[2]
    rx = ix*qw + iw*(-qx) + iy*(-qz) - iz*(-qy)
    ry = iy*qw + iw*(-qy) + iz*(-qx) - ix*(-qz)
    rz = iz*qw + iw*(-qz) + ix*(-qy) - iy*(-qx)
    return (rx, ry, rz)

def q_from_to(src, dst):
    s = vnorm(src); d = vnorm(dst)
    dot = s[0]*d[0] + s[1]*d[1] + s[2]*d[2]
    if dot > 0.99999:
        return (0.0, 0.0, 0.0, 1.0)
    if dot < -0.99999:
        axis = (1.0, 0.0, 0.0) if abs(s[0]) < 0.9 else (0.0, 1.0, 0.0)
        cross = (
            s[1]*axis[2] - s[2]*axis[1],
            s[2]*axis[0] - s[0]*axis[2],
            s[0]*axis[1] - s[1]*axis[0],
        )
        cross = vnorm(cross)
        return (cross[0], cross[1], cross[2], 0.0)
    cross = (
        s[1]*d[2] - s[2]*d[1],
        s[2]*d[0] - s[0]*d[2],
        s[0]*d[1] - s[1]*d[0],
    )
    w = 1.0 + dot
    n = math.sqrt(cross[0]**2 + cross[1]**2 + cross[2]**2 + w*w)
    return (cross[0]/n, cross[1]/n, cross[2]/n, w/n)

HIER = [
    ("Spine_0",          "Hips_0",            (0.0,  1.0, 0.0)),
    ("Head_0",           "Spine_0",           (0.0,  1.0, 0.0)),
    ("Left_Upper_Arm_0", "Spine_0",           (0.0, -1.0, 0.0)),
    ("Left_Lower_Arm_0", "Left_Upper_Arm_0",  (0.0, -1.0, 0.0)),
    ("Right_Upper_Arm_0","Spine_0",           (0.0, -1.0, 0.0)),
    ("Right_Lower_Arm_0","Right_Upper_Arm_0", (0.0, -1.0, 0.0)),
    ("Left_Upper_Leg_0", "Hips_0",            (0.0, -1.0, 0.0)),
    ("Left_Lower_Leg_0", "Left_Upper_Leg_0",  (0.0, -1.0, 0.0)),
    ("Right_Upper_Leg_0","Hips_0",            (0.0, -1.0, 0.0)),
    ("Right_Lower_Leg_0","Right_Upper_Leg_0", (0.0, -1.0, 0.0)),
]

REST_POS = {
    "Hips_0":           [0.0, 2.6, 0.0],
    "Spine_0":          [0.0, 0.4, 0.0],
    "Head_0":           [0.0, 1.1, 0.0],
    "Left_Upper_Arm_0": [0.55, 0.9, 0.0],
    "Left_Lower_Arm_0": [0.0, -0.6, 0.0],
    "Right_Upper_Arm_0":[-0.55, 0.9, 0.0],
    "Right_Lower_Arm_0":[0.0, -0.6, 0.0],
    "Left_Upper_Leg_0": [0.24, -0.2, 0.0],
    "Left_Lower_Leg_0": [0.0, -0.75, 0.0],
    "Right_Upper_Leg_0":[-0.24, -0.2, 0.0],
    "Right_Lower_Leg_0":[0.0, -0.75, 0.0],
}

def endpoints(lms):
    """Return (start_world, end_world) for each non-Hips bone."""
    sh_mid = vmid(lms[L_SHOULDER], lms[R_SHOULDER])
    hp_mid = vmid(lms[L_HIP], lms[R_HIP])
    return {
        "Spine_0":           (hp_mid,         sh_mid),
        "Head_0":            (sh_mid,         lms[NOSE]),
        "Left_Upper_Arm_0":  (lms[L_SHOULDER],lms[L_ELBOW]),
        "Left_Lower_Arm_0":  (lms[L_ELBOW],   lms[L_WRIST]),
        "Right_Upper_Arm_0": (lms[R_SHOULDER],lms[R_ELBOW]),
        "Right_Lower_Arm_0": (lms[R_ELBOW],   lms[R_WRIST]),
        "Left_Upper_Leg_0":  (lms[L_HIP],     lms[L_KNEE]),
        "Left_Lower_Leg_0":  (lms[L_KNEE],    lms[L_ANKLE]),
        "Right_Upper_Leg_0": (lms[R_HIP],     lms[R_KNEE]),
        "Right_Lower_Leg_0": (lms[R_KNEE],    lms[R_ANKLE]),
    }

HIP_BASE_Y = 2.6
SCALE = 3.0

def pose_from_landmarks(lms_raw):
    lms = [mp_to_tj((l.x, l.y, l.z)) for l in lms_raw]
    ep = endpoints(lms)

    pose = {}
    hips_world = vmid(lms[L_HIP], lms[R_HIP])
    pose["Hips_0"] = {
        "position": [hips_world[0] * SCALE, hips_world[1] * SCALE + HIP_BASE_Y, hips_world[2] * SCALE],
        "quaternion": [0.0, 0.0, 0.0, 1.0],
    }

    world_q = {"Hips_0": (0.0, 0.0, 0.0, 1.0)}
    for joint, parent, rest_dir in HIER:
        start, end = ep[joint]
        obs_world = vnorm(vsub(end, start))
        parent_q = world_q[parent]
        obs_local = qrot(qinv(parent_q), obs_world)
        local_q = q_from_to(rest_dir, obs_local)
        world_q[joint] = qmul(parent_q, local_q)
        pose[joint] = {
            "position": REST_POS[joint],
            "quaternion": [local_q[0], local_q[1], local_q[2], local_q[3]],
        }
    return pose

keyframes = []
frame_idx = 0
kept = 0
visibility_ok = 0

with mp_pose.Pose(
    model_complexity=1,
    enable_segmentation=False,
    smooth_landmarks=True,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5,
) as pose_detector:
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if frame_idx % step == 0:
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            res = pose_detector.process(rgb)
            if res.pose_world_landmarks:
                lms = res.pose_world_landmarks.landmark
                vis = sum(1 for l in lms if l.visibility > 0.4)
                if vis >= 20:
                    t = kept / sample_hz
                    p = pose_from_landmarks(lms)
                    keyframes.append({"time": round(t, 4), "pose": p})
                    visibility_ok += 1
                    kept += 1
            frame_idx += 1
        else:
            frame_idx += 1
cap.release()

if not keyframes:
    print("no usable pose data — video may have no visible person", file=sys.stderr)
    sys.exit(3)

def qnormalize(q):
    n = math.sqrt(q[0]*q[0] + q[1]*q[1] + q[2]*q[2] + q[3]*q[3])
    return (q[0]/n, q[1]/n, q[2]/n, q[3]/n) if n > 1e-9 else (0.0, 0.0, 0.0, 1.0)

def qslerp(a, b, t):
    dot = a[0]*b[0] + a[1]*b[1] + a[2]*b[2] + a[3]*b[3]
    if dot < 0.0:
        b = (-b[0], -b[1], -b[2], -b[3])
        dot = -dot
    if dot > 0.9995:
        r = (a[0] + t*(b[0]-a[0]), a[1] + t*(b[1]-a[1]), a[2] + t*(b[2]-a[2]), a[3] + t*(b[3]-a[3]))
        return qnormalize(r)
    theta_0 = math.acos(max(-1.0, min(1.0, dot)))
    sin_0 = math.sin(theta_0)
    theta = theta_0 * t
    s1 = math.sin(theta_0 - theta) / sin_0
    s2 = math.sin(theta) / sin_0
    return (s1*a[0] + s2*b[0], s1*a[1] + s2*b[1], s1*a[2] + s2*b[2], s1*a[3] + s2*b[3])

WIN = 2
for joint in list(keyframes[0]["pose"].keys()):
    qs = [tuple(kf["pose"][joint]["quaternion"]) for kf in keyframes]
    ps = [tuple(kf["pose"][joint]["position"]) for kf in keyframes]
    n = len(keyframes)
    for i in range(n):
        lo = max(0, i - WIN); hi = min(n, i + WIN + 1)
        avg_q = qs[lo]
        for k in range(lo + 1, hi):
            avg_q = qslerp(avg_q, qs[k], 1.0 / (k - lo + 1))
        px = sum(ps[k][0] for k in range(lo, hi)) / (hi - lo)
        py = sum(ps[k][1] for k in range(lo, hi)) / (hi - lo)
        pz = sum(ps[k][2] for k in range(lo, hi)) / (hi - lo)
        keyframes[i]["pose"][joint]["quaternion"] = [avg_q[0], avg_q[1], avg_q[2], avg_q[3]]
        if joint == "Hips_0":
            keyframes[i]["pose"][joint]["position"] = [px, py, pz]

MAX_DURATION = 20.0
if keyframes[-1]["time"] > MAX_DURATION:
    keyframes = [kf for kf in keyframes if kf["time"] <= MAX_DURATION]

animation = {
    "format": "fast-poser-asset",
    "version": 1,
    "type": "animation",
    "name": name,
    "savedAt": "2026-04-23T06:00:00.000Z",
    "scene": {
        "characterCount": 1,
        "characterColors": ["#ff7ae0"],
    },
    "playbackSpeed": 1,
    "effects": None,
    "keyframes": keyframes,
    "_source": src if src.startswith("http") else None,
}

Path(out_path).parent.mkdir(parents=True, exist_ok=True)
with open(out_path, "w") as f:
    json.dump(animation, f, indent=2)

final_audio = str(Path(out_path).with_suffix("")) + ".mp3"
try:
    os.rename(str(audio_path), final_audio)
except OSError:
    subprocess.run(["cp", str(audio_path), final_audio], check=False)

print(f"rip: {len(keyframes)} frames at {sample_hz}Hz ({total_frames} src frames, {src_fps:.1f}fps)", file=sys.stderr)
print(f"wrote {out_path}", file=sys.stderr)
print(f"wrote {final_audio}", file=sys.stderr)
print(out_path)
