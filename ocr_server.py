#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
漫画翻译工作台 · 本机 OCR 服务（免费 / 本地运行，零依赖框架）

提供两种本地 OCR 引擎，由网页「设置 → 翻译工作台 · OCR 引擎」选择调用：
  - manga-ocr  (engine=manga)  日文漫画专用，质量最佳，仅日文
  - PaddleOCR  (engine=paddle) 多语言（中/英/日/韩/繁中等）

安装（任选其一即可；建议 Python 3.9+）：
  pip install manga-ocr                       # 日文漫画专用（需 torch，体积较大）
  pip install paddlepaddle paddleocr          # 多语言（CPU 版 paddlepaddle 即可）

启动：
  python ocr_server.py
  默认监听 http://0.0.0.0:8765
  电脑上直接访问 http://127.0.0.1:8765；手机访问请填电脑局域网 IP（同网段），
  并在系统防火墙放行 8765 端口。

接口：
  GET  /health   -> {"ok":true,"engines":{"manga_ocr":bool,"paddleocr":bool}}
  POST /ocr      -> {"lines":["...", ...]}   body: {"image":"<base64>","engine":"manga|paddle","lang":"japan|ch|..."}
"""
import base64
import importlib.util
import io
import json
import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HOST, PORT = "0.0.0.0", 8765
MAX_BODY = 120 * 1024 * 1024  # 120MB，兼容大图 base64

_lock = threading.Lock()
_CACHE = {}
_HEALTH = {"manga_ocr": False, "paddleocr": False}


def _detect():
    _HEALTH["manga_ocr"] = importlib.util.find_spec("manga_ocr") is not None
    _HEALTH["paddleocr"] = importlib.util.find_spec("paddleocr") is not None


def _load_manga():
    if "manga" not in _CACHE:
        from manga_ocr import MangaOcr

        _CACHE["manga"] = MangaOcr()
    return _CACHE["manga"]


def _load_paddle(lang):
    key = "paddle:" + (lang or "japan")
    if key not in _CACHE:
        from paddleocr import PaddleOCR

        kwargs = {"lang": lang or "japan", "show_log": False}
        try:
            ocr = PaddleOCR(**kwargs)  # >=2.7
        except TypeError:
            kwargs.pop("show_log", None)
            ocr = PaddleOCR(use_angle_cls=True, **kwargs)  # 2.6 及更早
        _CACHE[key] = ocr
    return _CACHE[key]


def _decode_image(b64):
    raw = base64.b64decode(b64)
    try:
        from PIL import Image
    except Exception as e:  # pragma: no cover
        raise RuntimeError("缺少 Pillow，请先 pip install pillow：" + str(e))
    try:
        img = Image.open(io.BytesIO(raw))
        img.load()
    except Exception as e:
        raise RuntimeError("图片解码失败：" + str(e))
    return img.convert("RGB")


def _manga_lines(b64):
    img = _decode_image(b64)
    with _lock:
        ocr = _load_manga()
        text = ocr(img)
    if not text:
        return []
    text = str(text).strip()
    # manga-ocr 输出整页文本（无坐标/行结构），按标点与换行切成行块供逐条校对
    parts = re.split(r"[\n。．.！？!?…]+", text)
    return [p.strip() for p in parts if p and p.strip()]


def _paddle_lines(b64, lang):
    img_rgb = _decode_image(b64)
    import numpy as np

    img_bgr = np.array(img_rgb)[:, :, ::-1]  # PIL RGB -> opencv BGR
    with _lock:
        ocr = _load_paddle(lang)
        lines = []
        try:  # 2.x 风格
            res = ocr.ocr(img_bgr, cls=True)
            for page in res or []:
                for item in page or []:
                    if item and len(item) >= 2 and item[1]:
                        lines.append(str(item[1][0]))
        except TypeError:
            res = ocr.ocr(img_bgr)
            for page in res or []:
                for item in page or []:
                    if item and len(item) >= 2 and item[1]:
                        lines.append(str(item[1][0]))
        except Exception:
            try:  # 3.x 风格
                res = ocr.predict(img_bgr)
                for r in res or []:
                    for t in (getattr(r, "rec_texts", None) or []):
                        lines.append(str(t))
            except Exception as e2:
                raise RuntimeError("PaddleOCR 调用失败：" + str(e2))
        return [s.strip() for s in lines if s and s.strip()]


class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path.split("?")[0] == "/health":
            self._json(200, {"ok": True, "engines": dict(_HEALTH), "note": "manga-ocr/PaddleOCR 本地 OCR 服务"})
        else:
            self._json(404, {"error": "not found"})

    def do_POST(self):
        if self.path.split("?")[0] != "/ocr":
            self._json(404, {"error": "not found"})
            return
        try:
            length = int(self.headers.get("Content-Length") or 0)
            if length <= 0 or length > MAX_BODY:
                raise RuntimeError("请求体过大或为空")
            raw = self.rfile.read(length)
            payload = json.loads(raw.decode("utf-8"))
            b64 = payload.get("image") or ""
            engine = payload.get("engine") or "manga"
            lang = payload.get("lang") or "japan"
            if not b64:
                raise RuntimeError("缺少 image")
            if engine == "paddle":
                if not _HEALTH["paddleocr"]:
                    raise RuntimeError("未安装 PaddleOCR：pip install paddlepaddle paddleocr")
                lines = _paddle_lines(b64, lang)
            elif engine == "manga":
                if not _HEALTH["manga_ocr"]:
                    raise RuntimeError("未安装 manga-ocr：pip install manga-ocr")
                lines = _manga_lines(b64)
            else:
                raise RuntimeError("未知引擎：" + str(engine))
            self._json(200, {"lines": lines})
        except Exception as e:
            self._json(400, {"error": str(e)})

    def log_message(self, fmt, *args):
        try:
            import sys

            sys.stderr.write("[ocr-server] " + (fmt % args) + "\n")
        except Exception:
            pass


if __name__ == "__main__":
    _detect()
    print("=" * 56)
    print("  漫画翻译工作台 · 本机 OCR 服务")
    print("  地址: http://127.0.0.1:%d   (手机访问用电脑局域网 IP)" % PORT)
    print("  manga-ocr   : %s" % ("已安装" if _HEALTH["manga_ocr"] else "未安装 (pip install manga-ocr)"))
    print("  PaddleOCR   : %s" % ("已安装" if _HEALTH["paddleocr"] else "未安装 (pip install paddlepaddle paddleocr)"))
    print("  网页设置 → 翻译工作台 · OCR 引擎 中选择并检测")
    print("=" * 56)
    try:
        ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
    except OSError as e:
        print("启动失败（端口被占用？）：", e)
