"""
Range-aware serving for uploaded media.

WHY THIS EXISTS
---------------
/api/uploads used to be a plain StaticFiles mount. Starlette 0.38 (what
FastAPI 0.115 pins) does not implement HTTP range requests in StaticFiles:
it answers every request with 200 and the whole file, ignoring the Range
header the browser sent.

For a video editor that is not a cosmetic problem. <video> seeks by asking
for a byte range; without 206 support, every scrub of the preview
re-downloads the entire source file from the start, and a 1-2 GB clip makes
the timeline unusable. It also means the browser cannot start playing until
a large file has fully transferred.

This route serves the exact same URLs the mount did — nothing in the
frontend changed — but honours Range, advertises Accept-Ranges, and streams
in bounded chunks so a multi-gigabyte file is never read into memory.
"""
from __future__ import annotations

import mimetypes
import os
import re
from typing import Iterator

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, Response, StreamingResponse

from ..storage import asset_path_for

router = APIRouter(prefix="/api/uploads", tags=["media"])

CHUNK_SIZE = 1024 * 1024  # 1 MiB per read — bounded memory regardless of file size
_RANGE_RE = re.compile(r"^bytes=(\d*)-(\d*)$")


def _file_iterator(path: str, start: int, end: int) -> Iterator[bytes]:
    """Yield [start, end] inclusive, a chunk at a time."""
    remaining = end - start + 1
    with open(path, "rb") as f:
        f.seek(start)
        while remaining > 0:
            chunk = f.read(min(CHUNK_SIZE, remaining))
            if not chunk:
                break
            remaining -= len(chunk)
            yield chunk


@router.get("/{filename}")
def serve_upload(filename: str, request: Request):
    # asset_path_for refuses anything that would escape the uploads
    # directory (see storage._safe_join) — `filename` comes off the URL.
    try:
        path = asset_path_for(filename)
    except ValueError:
        raise HTTPException(404, "Not found")
    if not os.path.isfile(path):
        raise HTTPException(404, "Not found")

    size = os.path.getsize(path)
    media_type = mimetypes.guess_type(path)[0] or "application/octet-stream"
    range_header = request.headers.get("range")

    if not range_header:
        return FileResponse(
            path,
            media_type=media_type,
            headers={"Accept-Ranges": "bytes", "Cache-Control": "no-cache"},
        )

    match = _RANGE_RE.match(range_header.strip())
    if not match:
        # A multipart or malformed range. Whole file is a valid answer.
        return FileResponse(path, media_type=media_type, headers={"Accept-Ranges": "bytes"})

    raw_start, raw_end = match.group(1), match.group(2)
    if raw_start == "":
        # "bytes=-500" — the last N bytes, which is how some players read
        # an MP4's moov atom when it sits at the end of the file.
        length = int(raw_end or 0)
        start = max(0, size - length)
        end = size - 1
    else:
        start = int(raw_start)
        end = int(raw_end) if raw_end else size - 1

    end = min(end, size - 1)
    if start > end or start >= size:
        return Response(
            status_code=416,
            headers={"Content-Range": f"bytes */{size}", "Accept-Ranges": "bytes"},
        )

    return StreamingResponse(
        _file_iterator(path, start, end),
        status_code=206,
        media_type=media_type,
        headers={
            "Content-Range": f"bytes {start}-{end}/{size}",
            "Content-Length": str(end - start + 1),
            "Accept-Ranges": "bytes",
            "Cache-Control": "no-cache",
        },
    )
