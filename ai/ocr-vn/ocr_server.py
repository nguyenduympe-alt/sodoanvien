"""OCR-VN SERVER — AI đọc ảnh tiếng Việt chạy 100% OFFLINE trên CPU.

Pipeline lai (chuẩn thực tế cho thẻ CCCD / màn hình VNeID):
  1) PP-OCR DBNet (RapidOCR / ONNX Runtime) — DÒ vùng chữ + phân loại hướng chữ.
  2) VietOCR (VGG-Seq2Seq, huấn luyện riêng cho tiếng Việt có dấu) — ĐỌC chữ (họ tên, địa chỉ...).
  3) PP-OCR CRNN rec — ĐỌC lại mọi vùng; vùng dạng SỐ/NGÀY (CCCD, ngày sinh) lấy kết quả PP-OCR
     (đo trên bộ ảnh chụp xấu: đúng 24/24 số CCCD so với 19/24 nếu chỉ dùng VietOCR).
  Mỗi dòng trả kèm phương án thay thế (alt) để bộ phân tích kiểm tra chéo CCCD ↔ năm sinh ↔ giới tính.

Chính sách RAM (VPS 4GB dùng chung với EduAssist LLM):
  - Nạp mô hình khi có yêu cầu đầu tiên (lazy). Rảnh quá OCR_IDLE_UNLOAD_S giây → tiến trình tự
    thoát sạch (systemd khởi động lại ở trạng thái nhẹ ~60MB) — trả RAM thật về cho hệ điều hành.
  - Mỗi lần xử lý 1 ảnh (khóa), tối đa OCR_MAX_QUEUE ảnh chờ → 503 "bận".

Endpoints (chỉ nghe 127.0.0.1):
  GET  /health   → trạng thái, model, RAM
  POST /ocr      → {"image": "data:image/...;base64,..."}  →  {lines:[{text,conf,box}], text, ms}
"""
import base64
import gc
import io
import os
import re
import threading
import time

import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from PIL import Image, ImageOps

BASE = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(BASE, "models")
REC_MODEL = os.environ.get("OCR_REC_MODEL", "vgg_seq2seq")  # vgg_seq2seq (đo thực tế: chính xác nhất trên ảnh chụp xấu + nhanh) | vgg_transformer
THREADS = int(os.environ.get("OCR_THREADS", "4"))
IDLE_UNLOAD_S = float(os.environ.get("OCR_IDLE_UNLOAD_S", "900"))
MAX_QUEUE = int(os.environ.get("OCR_MAX_QUEUE", "6"))
MAX_SIDE = int(os.environ.get("OCR_MAX_SIDE", "1600"))
MIN_SIDE = int(os.environ.get("OCR_MIN_SIDE", "1000"))

_lock = threading.Lock()
_state = {"det": None, "rec": None, "loaded_at": None, "last_used": 0.0, "queue": 0,
          "served": 0, "last_ms": None}


def _load():
    if _state["rec"] is not None:
        return
    import torch
    torch.set_num_threads(THREADS)
    from rapidocr_onnxruntime import RapidOCR
    from vietocr.tool.config import Cfg
    from vietocr.tool.predictor import Predictor

    t = time.time()
    det = RapidOCR(intra_op_num_threads=THREADS, inter_op_num_threads=1)
    yml = {"vgg_transformer": "vgg-transformer.yml", "vgg_seq2seq": "vgg-seq2seq.yml"}[REC_MODEL]
    cfg = Cfg.load_config_from_file(os.path.join(MODEL_DIR, "base.yml"))
    cfg.update(Cfg.load_config_from_file(os.path.join(MODEL_DIR, yml)))
    cfg["weights"] = os.path.join(MODEL_DIR, f"{REC_MODEL}.pth")
    cfg["cnn"]["pretrained"] = False           # không tải ImageNet — đã có trọng số đầy đủ
    cfg["device"] = "cpu"
    cfg["predictor"]["beamsearch"] = False
    rec = Predictor(cfg)
    _state.update(det=det, rec=rec, loaded_at=time.time(), last_used=time.time())
    print(f"[ocr-vn] loaded det=PP-OCR(onnx) rec={REC_MODEL} in {time.time()-t:.1f}s", flush=True)


def _unload():
    if _state["rec"] is None:
        return
    print("[ocr-vn] idle → thoát tiến trình để trả RAM (systemd sẽ khởi động lại ở trạng thái nhẹ)", flush=True)
    os._exit(0)


def _idle_watcher():
    while True:
        time.sleep(30)
        if IDLE_UNLOAD_S <= 0:
            continue
        if _state["rec"] is not None and _state["queue"] == 0 and \
                time.time() - _state["last_used"] > IDLE_UNLOAD_S:
            with _lock:
                if time.time() - _state["last_used"] > IDLE_UNLOAD_S:
                    _unload()


threading.Thread(target=_idle_watcher, daemon=True).start()


def _decode(data: str) -> Image.Image:
    m = re.match(r"^data:image/[\w+.-]+;base64,(.+)$", data or "", re.S)
    raw = base64.b64decode(m.group(1) if m else data)
    img = Image.open(io.BytesIO(raw))
    img = ImageOps.exif_transpose(img).convert("RGB")
    w, h = img.size
    s = max(w, h)
    if s > MAX_SIDE:
        r = MAX_SIDE / s
        img = img.resize((int(w * r), int(h * r)), Image.LANCZOS)
    elif s < MIN_SIDE:                       # ảnh nhỏ → phóng to giúp dò chữ nhỏ
        r = MIN_SIDE / s
        img = img.resize((int(w * r), int(h * r)), Image.BICUBIC)
    return img


def _crop(img_np, box, pad=0.12):
    """Cắt vùng chữ theo tứ giác (perspective) + chừa lề để giữ dấu tiếng Việt."""
    import cv2
    pts = np.array(box, dtype=np.float32)
    w = int(max(np.linalg.norm(pts[0] - pts[1]), np.linalg.norm(pts[2] - pts[3])))
    h = int(max(np.linalg.norm(pts[0] - pts[3]), np.linalg.norm(pts[1] - pts[2])))
    if w < 4 or h < 4:
        return None
    # nới tứ giác theo chiều cao (dấu mũ/dấu nặng hay bị cắt)
    c = pts.mean(axis=0)
    ph, pw = h * pad, h * pad * 0.6
    ux = (pts[1] - pts[0]) / max(np.linalg.norm(pts[1] - pts[0]), 1)
    uy = (pts[3] - pts[0]) / max(np.linalg.norm(pts[3] - pts[0]), 1)
    grown = np.array([
        pts[0] - ux * pw - uy * ph, pts[1] + ux * pw - uy * ph,
        pts[2] + ux * pw + uy * ph, pts[3] - ux * pw + uy * ph], dtype=np.float32)
    W, H = int(w + 2 * pw), int(h + 2 * ph)
    dst = np.array([[0, 0], [W, 0], [W, H], [0, H]], dtype=np.float32)
    M = cv2.getPerspectiveTransform(grown, dst)
    out = cv2.warpPerspective(img_np, M, (W, H), borderMode=cv2.BORDER_REPLICATE)
    if H > W * 1.5:                          # chữ dọc → xoay
        out = cv2.rotate(out, cv2.ROTATE_90_COUNTERCLOCKWISE)
    return Image.fromarray(out)


NUM_RE = re.compile(r"^[\d\s./\-:,]+$")


def _group_lines(items):
    """Gom các ô chữ cùng hàng (theo tâm y) → dòng, sắp trái→phải."""
    items = sorted(items, key=lambda it: it["cy"])
    lines = []
    for it in items:
        for ln in lines:
            if abs(ln["cy"] - it["cy"]) < 0.5 * min(ln["h"], it["h"]):
                ln["items"].append(it)
                ln["cy"] = np.mean([x["cy"] for x in ln["items"]])
                break
        else:
            lines.append({"cy": it["cy"], "h": it["h"], "items": [it]})
    out = []
    for ln in sorted(lines, key=lambda l: l["cy"]):
        segs = sorted(ln["items"], key=lambda x: x["x"])
        out.append({
            "text": " ".join(s["text"] for s in segs),
            "conf": round(float(np.mean([s["conf"] for s in segs])), 4),
            "segments": [{"text": s["text"], "conf": round(s["conf"], 4), "src": s["src"], "alt": s["alt"], "box": s["box"]} for s in segs],
        })
    return out


def run_ocr(img: Image.Image):
    det, rec = _state["det"], _state["rec"]
    img_np = np.array(img)
    t0 = time.time()
    res, _ = det(img_np, use_det=True, use_cls=True, use_rec=False)
    boxes = [b for b in (res or [])]
    crops, metas = [], []
    for b in boxes:
        box = b[0] if isinstance(b, (list, tuple)) and len(b) and isinstance(b[0], (list, tuple, np.ndarray)) and len(b[0]) == 4 and not np.isscalar(b[0][0]) else b
        box = np.array(box, dtype=np.float32).reshape(4, 2)
        cr = _crop(img_np, box)
        if cr is None:
            continue
        crops.append(cr)
        ys, xs = box[:, 1], box[:, 0]
        metas.append({"box": box.astype(int).tolist(), "cy": float(ys.mean()),
                      "h": float(ys.max() - ys.min()), "x": float(xs.min())})
    t1 = time.time()
    items = []
    if crops:
        texts, probs = rec.predict_batch(crops, return_prob=True)
        try:
            pp, _ = det.text_rec([np.array(c) for c in crops])
        except Exception:
            pp = [("", 0.0)] * len(crops)
        for m, t, p, (pt, pc) in zip(metas, texts, probs, pp):
            t, pt = (t or "").strip(), (pt or "").strip()
            numeric = bool(NUM_RE.match(pt)) and sum(ch.isdigit() for ch in pt) >= 4
            v_numeric = sum(ch.isdigit() for ch in t) >= max(4, 0.6 * len(t.replace(" ", "")))
            if (numeric or v_numeric) and pt and float(pc) >= 0.5:
                text, conf, src, alt = pt, float(pc), "ppocr", t
            else:
                text, conf, src, alt = t, float(p), "vietocr", pt
            if text:
                items.append({**m, "text": text, "conf": conf, "src": src, "alt": alt})
    lines = _group_lines(items)
    return lines, {"det_ms": int((t1 - t0) * 1000), "rec_ms": int((time.time() - t1) * 1000),
                   "boxes": len(crops)}


app = FastAPI(title="OCR-VN (PP-OCR det + VietOCR rec)")


class OcrReq(BaseModel):
    image: str


@app.get("/health")
def health():
    mem = {}
    try:
        with open("/proc/meminfo") as f:
            for l in f:
                k, v = l.split(":")
                if k in ("MemAvailable", "MemTotal"):
                    mem[k] = int(v.split()[0]) // 1024
    except Exception:
        pass
    return {"ok": True, "engine": f"ppocr+vietocr-{REC_MODEL}", "loaded": _state["rec"] is not None,
            "queue": _state["queue"], "served": _state["served"], "last_ms": _state["last_ms"],
            "idle_unload_s": IDLE_UNLOAD_S, "mem_mb": mem}


@app.post("/ocr")
def ocr(req: OcrReq):
    if _state["queue"] >= MAX_QUEUE:
        raise HTTPException(503, "OCR đang bận, thử lại sau ít giây")
    try:
        img = _decode(req.image)
    except Exception as e:
        raise HTTPException(400, f"Ảnh không hợp lệ: {e}")
    _state["queue"] += 1
    try:
        with _lock:
            t = time.time()
            _load()
            lines, timing = run_ocr(img)
            ms = int((time.time() - t) * 1000)
            _state["last_used"] = time.time()
            _state["served"] += 1
            _state["last_ms"] = ms
    finally:
        _state["queue"] -= 1
    return {"engine": f"ppocr+vietocr-{REC_MODEL}", "ms": ms, "timing": timing,
            "size": list(img.size), "lines": lines, "text": "\n".join(l["text"] for l in lines)}
