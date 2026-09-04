"""
Process entry point for the packaged backend (and a convenient way to run
the dev server with an explicit port).

PyInstaller freezes THIS file, not app/main.py, because a frozen app needs
three things a bare `uvicorn app.main:app` command line cannot give it:

  * a port chosen by the caller (the Electron shell finds a free one and
    passes it in, so a stale process or another app on 8000 cannot stop the
    editor from opening);
  * somewhere for output to go — a windowed Windows executable has no
    console, so anything printed to a missing stdout would raise;
  * multiprocessing.freeze_support(), without which any accidental child
    process re-runs the whole app instead of the worker.

Usage:
    python run_server.py --port 8000
    video-editor-backend.exe --port 51234 --log-file "C:\\...\\backend.log"
"""
from __future__ import annotations

import argparse
import multiprocessing
import os
import sys
from pathlib import Path

MAX_LOG_BYTES = 5 * 1024 * 1024


def _default_log_path() -> Path:
    """Resolved without importing app.paths, because output has to be
    redirected before anything that might print is imported."""
    data_dir = (os.environ.get("AIVE_DATA_DIR") or "").strip().strip('"')
    if data_dir:
        base = Path(data_dir)
    elif sys.platform == "win32":
        root = os.environ.get("LOCALAPPDATA") or os.environ.get("APPDATA") or str(Path.home())
        base = Path(root) / "AI Video Editor"
    else:
        base = Path.home() / ".local" / "share" / "ai-video-editor"
    return base / "logs" / "backend.log"


class _Tee:
    """Writes to the log file and, when the parent process gave us real
    pipes, to the original stream as well — so Electron's live capture and
    the on-disk log both work."""

    def __init__(self, stream, handle):
        self._stream = stream
        self._handle = handle

    def write(self, text):
        try:
            self._handle.write(text)
            self._handle.flush()
        except Exception:
            pass
        if self._stream is not None:
            try:
                self._stream.write(text)
                self._stream.flush()
            except Exception:
                pass
        return len(text)

    def flush(self):
        for target in (self._handle, self._stream):
            try:
                if target is not None:
                    target.flush()
            except Exception:
                pass

    def isatty(self):
        return False


def _install_logging(log_file: Path) -> None:
    try:
        log_file.parent.mkdir(parents=True, exist_ok=True)
        # Cheap rotation: a render-heavy session can produce a lot of ffmpeg
        # stderr, and an unbounded log in the user's profile is a bug.
        if log_file.exists() and log_file.stat().st_size > MAX_LOG_BYTES:
            log_file.replace(log_file.with_suffix(".log.old"))
        handle = open(log_file, "a", encoding="utf-8", errors="replace", buffering=1)
    except OSError:
        return
    sys.stdout = _Tee(sys.stdout, handle)
    sys.stderr = _Tee(sys.stderr, handle)


def main() -> int:
    parser = argparse.ArgumentParser(description="AI Video Editor backend")
    parser.add_argument("--host", default=os.environ.get("AIVE_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("AIVE_PORT", "8000")))
    parser.add_argument("--log-file", default=os.environ.get("AIVE_LOG_FILE"))
    parser.add_argument("--log-level", default=os.environ.get("AIVE_LOG_LEVEL", "info"))
    args = parser.parse_args()

    _install_logging(Path(args.log_file) if args.log_file else _default_log_path())

    # Deliberately after logging is installed: importing the app prints a
    # banner describing where it resolved every path to, which is the first
    # thing worth having in the log when a packaged build misbehaves.
    import uvicorn
    from app.main import app

    print(f"[run_server] binding {args.host}:{args.port}")
    try:
        uvicorn.run(app, host=args.host, port=args.port, log_level=args.log_level)
    except OSError as exc:
        # Almost always "address already in use" — say so in the log rather
        # than leaving Electron to time out on the health check with no clue.
        print(f"[run_server] FATAL: could not bind {args.host}:{args.port}: {exc}")
        return 2
    return 0


if __name__ == "__main__":
    multiprocessing.freeze_support()
    sys.exit(main())
