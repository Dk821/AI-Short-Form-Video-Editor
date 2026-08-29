"""
Export crash bisector.

Run this when an export fails with a Windows access violation
(exit code 3221225477 / 0xC0000005) or any other crash that leaves no
usable ffmpeg error message. A hard crash kills ffmpeg before its buffered
stderr is flushed, so the normal export error can only report the exit
code — this script finds WHICH PART of the render is responsible by
running a ladder of increasingly complete ffmpeg commands against your
real project media and reporting the first one that dies.

Usage, from the `backend` folder, with the same Python you run the server with:

    python diagnose_export.py                # newest project with a video
    python diagnose_export.py <project_id>   # a specific project

It only writes throwaway files into your system temp folder and never
touches the project, its timeline, or app/uploads.
"""
from __future__ import annotations

import os
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import db                                    # noqa: E402
from app.models import Timeline, Asset                # noqa: E402
from app import render                                # noqa: E402


def _crash_hint(code: int) -> str:
    if code == 3221225477:
        return "  -> 0xC0000005 ACCESS VIOLATION (hard crash inside ffmpeg)"
    if code == 3221225725:
        return "  -> 0xC00000FD STACK OVERFLOW (expression/filter too deeply nested)"
    if code < 0:
        return f"  -> killed by signal {-code}"
    return ""


def run(label: str, args: list[str], graph: str | None = None) -> bool:
    """Run one ffmpeg command; return True if it succeeded."""
    script_path = None
    try:
        if graph is not None:
            with tempfile.NamedTemporaryFile("w", suffix=".ffscript", delete=False, encoding="utf-8") as f:
                f.write(graph)
                script_path = f.name
            args = [*args[:-1],
                    render._filter_graph_file_option(render._configured_ffmpeg()),
                    script_path, args[-1]]
        cmd = [render._configured_ffmpeg(), "-y", "-hide_banner", "-loglevel", "error", *args]
        env = {**os.environ, **render._fontconfig_env()}
        proc = subprocess.run(cmd, capture_output=True, text=True, env=env)
        ok = proc.returncode == 0
        print(f"[{'PASS' if ok else 'FAIL'}] {label}")
        if not ok:
            print(f"  exit code: {proc.returncode}{_crash_hint(proc.returncode)}")
            err = (proc.stderr or "").strip()
            print("  stderr:", err[-700:] if err else "(none — consistent with a hard crash)")
        return ok
    finally:
        if script_path:
            try:
                os.remove(script_path)
            except OSError:
                pass


def main() -> int:
    project_id = sys.argv[1] if len(sys.argv) > 1 else None
    if project_id:
        project = db.get_project(project_id)
        if not project:
            print(f"No project with id {project_id}")
            return 2
    else:
        candidates = [p for p in db.list_projects() if p.get("assets")]
        if not candidates:
            print("No projects with media found.")
            return 2
        project = candidates[-1]
        project_id = project["timeline"]["project"]["id"]
    print(f"Project: {project_id}\n")

    timeline = Timeline(**project["timeline"])
    assets = {a["id"]: Asset(**a) for a in project["assets"]}

    main_item = next(
        (it for t in timeline.tracks if t.type == "video" for it in t.items if it.assetId), None
    )
    if not main_item or main_item.assetId not in assets:
        print("Project has no main video item; nothing to test.")
        return 2
    main_path = assets[main_item.assetId].url
    if not os.path.exists(main_path):
        print(f"Main video file is missing on disk: {main_path}")
        return 2

    W = timeline.project.width
    H = timeline.project.height
    fps = timeline.project.fps or 30
    null_out = ["-f", "null", "-"]
    # A couple of seconds is plenty to trigger a crash and keeps this quick.
    short = ["-t", "2"]

    print("Running ladder (each step adds one suspect):\n")
    results = {}

    results["ffmpeg runs at all"] = run(
        "1. decode main video, no filters, no encode",
        ["-i", main_path, *short, *null_out],
    )

    results["x264 encode"] = run(
        "2. encode with libx264 (what MP4 export uses)",
        ["-i", main_path, *short, "-c:v", "libx264", "-preset", "veryfast", "-crf", "30",
         "-an", "-f", "mp4", os.path.join(tempfile.gettempdir(), "diag_x264.mp4")],
    )

    results["libvpx-vp9 encode"] = run(
        "3. encode with libvpx-vp9 (what WebM export uses)",
        ["-i", main_path, *short, "-c:v", "libvpx-vp9", "-crf", "32", "-b:v", "0",
         "-deadline", "good", "-cpu-used", "4", "-row-mt", "1",
         "-an", "-f", "webm", os.path.join(tempfile.gettempdir(), "diag_vp9.webm")],
    )

    results["libvpx-vp9 without row-mt"] = run(
        "4. same, but WITHOUT -row-mt (multithreading suspect)",
        ["-i", main_path, *short, "-c:v", "libvpx-vp9", "-crf", "32", "-b:v", "0",
         "-deadline", "good", "-cpu-used", "4", "-threads", "1",
         "-an", "-f", "webm", os.path.join(tempfile.gettempdir(), "diag_vp9_nomt.webm")],
    )

    # drawtext / fontconfig — the exact font strings the graph will use.
    # These are the RESOLVED variants ("Poppins Bold Italic"), not the bare
    # family, because that resolved string is what fontconfig actually has
    # to match and is the thing that could fail.
    fonts = set()
    for track in timeline.tracks:
        if track.type not in ("caption", "cta"):
            continue
        for it in track.items:
            fonts.add(it.fontFamily or "Inter")
            if it.stressWordIndices:
                fonts.add(render._resolve_font_variant(
                    it.stressFontFamily or it.fontFamily or "Inter",
                    it.stressFontWeight, it.stressFontStyle) or "Inter")
    fonts = sorted(f for f in fonts if f)
    for font in fonts:
        results[f"drawtext font {font!r}"] = run(
            f"5. drawtext with font {font!r}",
            ["-i", main_path, *short,
             "-vf", f"drawtext=text='Sample 90%':expansion=none:fontsize=48:fontcolor=white:"
                    f"x=10:y=10:font='{font}'",
             "-an", *null_out],
        )

    # geq mask — used by split layouts, wipe reveals and speaker bubbles.
    half = H // 2
    mask = render._luma_mask("mS", "mM", W, half, fps,
                             f"if(lt(Y,{half}*min(max(T/1,0),1)),255,0)")
    results["geq luma mask"] = run(
        "6. geq alpha mask + alphamerge (split / wipe / speaker bubble)",
        ["-i", main_path, *short, "-an", "-map", "[out]", *null_out],
        graph=(
            f"[0:v]scale={W}:{half}:force_original_aspect_ratio=increase,"
            f"crop={W}:{half},fps={fps},format=rgba[lay];"
            f"{mask};[lay][mM]alphamerge=shortest=1[out]"
        ),
    )

    # The real thing: the project's own full filter graph.
    for fmt in ("mp4", "webm"):
        out = os.path.join(tempfile.gettempdir(), f"diag_full.{fmt}")
        label = f"7. FULL project graph -> {fmt}"
        try:
            render.render_timeline(timeline, assets, out, fmt=fmt, quality="draft")
            print(f"[PASS] {label}")
            results[f"full render {fmt}"] = True
        except Exception as e:
            print(f"[FAIL] {label}")
            first = [l for l in str(e).splitlines() if "exited with code" in l]
            print("  ", first[0] if first else str(e).splitlines()[0][:200])
            results[f"full render {fmt}"] = False

    print("\n" + "=" * 60)
    failed = [k for k, v in results.items() if not v]
    if not failed:
        print("Everything passed — the crash did not reproduce in this run.")
    else:
        print("FIRST FAILING STAGE tells you the culprit:")
        for k in failed:
            print(f"  - {k}")
    print("=" * 60)
    print("\nPaste this whole output back into the chat.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
