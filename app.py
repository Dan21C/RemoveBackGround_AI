import io
import json
import shutil
import subprocess
import threading
import time
import uuid
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter
from flask import Flask, Response, jsonify, render_template, request, send_from_directory

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 2 * 1024 * 1024 * 1024  # 2 GB

UPLOAD_DIR = Path("uploads")
OUTPUT_DIR = Path("outputs")
UPLOAD_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)

JOBS: dict[str, dict] = {}
_lock = threading.Lock()


def _set_progress(job_id: str, stage: str, pct: int) -> None:
    with _lock:
        if job_id in JOBS:
            JOBS[job_id].update({"stage": stage, "pct": pct})


def _finish_job(job_id: str, result: dict | None = None, error: str | None = None) -> None:
    with _lock:
        if job_id in JOBS:
            JOBS[job_id].update({"done": True, "result": result, "error": error, "pct": 100})


def _get_fps(video_path: Path) -> float:
    result = subprocess.run(
        [
            "ffprobe", "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=r_frame_rate",
            "-of", "default=noprint_wrappers=1:nokey=1",
            str(video_path),
        ],
        capture_output=True, text=True, check=True,
    )
    raw = result.stdout.strip()
    if "/" in raw:
        num, den = raw.split("/")
        return float(num) / float(den)
    return float(raw)


def _extract_frames(video_path: Path, frames_dir: Path, max_width: int) -> None:
    scale = f"scale='if(gt(iw,{max_width}),{max_width},-2)':-2"
    subprocess.run(
        [
            "ffmpeg", "-y", "-i", str(video_path),
            "-vf", scale,
            str(frames_dir / "frame_%06d.png"),
        ],
        check=True, capture_output=True,
    )


def _clean_edges(img: Image.Image) -> Image.Image:
    from PIL import ImageFilter
    arr = np.array(img).astype(np.float32)
    alpha = arr[..., 3] / 255.0

    # Spread foreground color into semi-transparent border pixels.
    # sigma=6 reaches ~18px — enough for thicker halos.
    # Threshold 0.85 (not 0.90) captures more "certain foreground" pixels as reference.
    opaque_weight = np.clip((alpha - 0.85) / 0.15, 0.0, 1.0)
    for c in range(3):
        num = gaussian_filter(arr[..., c] * opaque_weight, sigma=6)
        den = gaussian_filter(opaque_weight, sigma=6)
        fg = np.where(den > 1e-6, num / den, arr[..., c])
        semi = (alpha > 0.01) & (alpha < 0.97)
        arr[..., c] = np.where(semi, fg, arr[..., c])

    # Trim 1px from the alpha edge to clip the residual darkest fringe pixels.
    alpha_img = Image.fromarray(arr[..., 3].astype(np.uint8))
    arr[..., 3] = np.array(alpha_img.filter(ImageFilter.MinFilter(3))).astype(np.float32)

    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGBA")


def _remove_background(
    frames_dir: Path, out_dir: Path, model_name: str, progress_cb=None
) -> None:
    from rembg import new_session, remove
    session = new_session(model_name)
    frames = sorted(frames_dir.glob("frame_*.png"))
    for i, frame_path in enumerate(frames, 1):
        raw = remove(
            frame_path.read_bytes(),
            session=session,
            alpha_matting=True,
            alpha_matting_foreground_threshold=245,
            alpha_matting_background_threshold=8,
            alpha_matting_erode_size=15,
        )
        img = _clean_edges(Image.open(io.BytesIO(raw)).convert("RGBA"))
        img.save(str(out_dir / frame_path.name))
        if progress_cb:
            progress_cb(i, len(frames))


def _vp9_quality_flags(crf: int) -> list[str]:
    return [
        "-c:v", "libvpx-vp9",
        "-crf", str(crf), "-b:v", "0",
        "-quality", "good",
        "-cpu-used", "0",
        "-row-mt", "1",
        "-auto-alt-ref", "0",
        "-pix_fmt", "yuva420p",
    ]


def _frames_to_webm(frames_dir: Path, output_path: Path, fps: float, crf: int) -> None:
    subprocess.run(
        [
            "ffmpeg", "-y",
            "-framerate", str(fps),
            "-i", str(frames_dir / "frame_%06d.png"),
            *_vp9_quality_flags(crf),
            str(output_path),
        ],
        check=True, capture_output=True,
    )


def _clean_frames(frames_dir: Path, out_dir: Path, progress_cb=None) -> None:
    """Apply edge cleaning to frames that already have alpha (preserve_alpha mode)."""
    frames = sorted(frames_dir.glob("frame_*.png"))
    for i, frame_path in enumerate(frames, 1):
        img = _clean_edges(Image.open(frame_path).convert("RGBA"))
        img.save(str(out_dir / frame_path.name))
        if progress_cb:
            progress_cb(i, len(frames))


def _process_job(
    job_id: str, input_path: Path, job_dir: Path,
    mode: str, model_name: str, crf: int, max_width: int
) -> None:
    output_filename = f"{job_id}.webm"
    output_path = OUTPUT_DIR / output_filename
    try:
        _set_progress(job_id, "Leyendo video…", 3)
        fps = _get_fps(input_path)
        frames_raw = job_dir / "frames_raw"
        frames_clean = job_dir / "frames_clean"
        frames_raw.mkdir()
        frames_clean.mkdir()

        _set_progress(job_id, "Extrayendo frames…", 6)
        _extract_frames(input_path, frames_raw, max_width)

        def on_frame(i: int, total: int) -> None:
            pct = 10 + int(i / total * 75)
            label = f"Limpiando bordes… {i}/{total} frames" if mode == "preserve_alpha" else f"Removiendo fondo… {i}/{total} frames"
            _set_progress(job_id, label, pct)

        if mode == "preserve_alpha":
            _set_progress(job_id, "Limpiando bordes…", 10)
            _clean_frames(frames_raw, frames_clean, progress_cb=on_frame)
        else:
            _set_progress(job_id, "Removiendo fondo…", 10)
            _remove_background(frames_raw, frames_clean, model_name, progress_cb=on_frame)

        _set_progress(job_id, "Ensamblando WebM…", 87)
        _frames_to_webm(frames_clean, output_path, fps, crf)

        _finish_job(job_id, result={
            "filename": output_filename,
            "preview_url": f"/outputs/{output_filename}",
            "download_url": f"/outputs/{output_filename}",
        })

    except subprocess.CalledProcessError as exc:
        stderr = exc.stderr.decode(errors="replace") if exc.stderr else ""
        _finish_job(job_id, error=f"Error de FFmpeg: {stderr[-500:]}")
    except Exception as exc:
        _finish_job(job_id, error=str(exc))
    finally:
        shutil.rmtree(job_dir, ignore_errors=True)
        # Keep job state for 2 min so the client can read the result
        threading.Timer(120, lambda: JOBS.pop(job_id, None)).start()


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/health")
def health():
    ffmpeg_ok = shutil.which("ffmpeg") is not None
    return jsonify({"ffmpeg": ffmpeg_ok})


@app.route("/api/convert", methods=["POST"])
def convert():
    video_file = request.files.get("video")
    if not video_file:
        return jsonify({"ok": False, "error": "No se recibió ningún archivo."}), 400

    mode = request.form.get("mode", "remove_bg")
    model_name = request.form.get("model", "birefnet-general")
    crf = int(request.form.get("crf", 20))
    max_width = int(request.form.get("max_width", 1080))

    job_id = uuid.uuid4().hex
    job_dir = UPLOAD_DIR / job_id
    job_dir.mkdir()

    suffix = Path(video_file.filename).suffix or ".mov"
    input_path = job_dir / f"input{suffix}"
    video_file.save(str(input_path))

    with _lock:
        JOBS[job_id] = {"stage": "Iniciando…", "pct": 0, "done": False, "result": None, "error": None}

    threading.Thread(
        target=_process_job,
        args=(job_id, input_path, job_dir, mode, model_name, crf, max_width),
        daemon=True,
    ).start()

    return jsonify({"ok": True, "job_id": job_id})


@app.route("/api/progress/<job_id>")
def progress_stream(job_id: str):
    def generate():
        while True:
            with _lock:
                job = JOBS.get(job_id)
            if job is None:
                yield f"data: {json.dumps({'error': 'Job no encontrado'})}\n\n"
                break
            yield f"data: {json.dumps(job)}\n\n"
            if job.get("done") or job.get("error"):
                break
            time.sleep(0.4)

    return Response(
        generate(),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.route("/outputs/<path:filename>")
def serve_output(filename):
    return send_from_directory(OUTPUT_DIR.resolve(), filename)


if __name__ == "__main__":
    app.run(debug=False, host="0.0.0.0", port=5000, threaded=True)
