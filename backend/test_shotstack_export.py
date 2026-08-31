"""
Offline tests for the Shotstack export engine.

No network and no API key are needed: the Shotstack HTTP calls are stubbed,
so this exercises the real conversion, the real validation and the real
job-state machine in routers/export.py end to end (Editor -> Export ->
Shotstack -> MP4 URL -> what the frontend polls).

Run from the backend folder:   python test_shotstack_export.py
"""
from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.models import Timeline, Asset          # noqa: E402
from app import shotstack, shotstack_timeline   # noqa: E402


def _ensure_fastapi_importable():
    """routers/export.py imports FastAPI at module level. The conversion and
    validation tests don't need it, but the end-to-end flow test drives the
    real _run_shotstack job machine, so a minimal stand-in is installed when
    FastAPI isn't present. Only the handful of names export.py imports are
    stubbed, and only when the real package is genuinely missing."""
    try:
        import fastapi  # noqa: F401
        return
    except ImportError:
        pass
    import types

    fa = types.ModuleType("fastapi")

    class APIRouter:
        def __init__(self, **kw):
            pass
        def _noop(self, *a, **k):
            return lambda fn: fn
        get = post = put = delete = patch = _noop

    class HTTPException(Exception):
        def __init__(self, status_code, detail=""):
            super().__init__(detail)
            self.status_code, self.detail = status_code, detail

    fa.APIRouter = APIRouter
    fa.HTTPException = HTTPException
    fa.BackgroundTasks = type("BackgroundTasks", (), {"add_task": lambda self, *a, **k: None})
    fa.Request = type("Request", (), {})
    fa.UploadFile = type("UploadFile", (), {})
    responses = types.ModuleType("fastapi.responses")
    responses.FileResponse = type("FileResponse", (), {})
    fa.responses = responses
    sys.modules["fastapi"] = fa
    sys.modules["fastapi.responses"] = responses


_ensure_fastapi_importable()

PASS, FAIL = [], []


def check(name: str, cond: bool, detail: str = ""):
    (PASS if cond else FAIL).append(name)
    print(f"[{'PASS' if cond else 'FAIL'}] {name}" + (f"\n       {detail}" if detail and not cond else ""))


def sample_timeline() -> tuple[Timeline, dict]:
    """A timeline exercising every construct the converter handles."""
    tl = Timeline(**{
        "project": {"id": "p1", "width": 1080, "height": 1920, "fps": 30, "duration": 12.0},
        "tracks": [
            {"id": "v", "type": "video", "items": [
                {"id": "main", "type": "video", "assetId": "a_main", "start": 0, "duration": 12.0,
                 "sourceStart": 0, "volume": 1.0}]},
            {"id": "b", "type": "broll", "items": [
                {"id": "b_full", "type": "broll", "assetId": "a_broll", "start": 2.0, "duration": 3.0,
                 "sourceStart": 0, "layout": "full", "revealAnimation": "fade_in", "zIndex": 10},
                {"id": "b_split", "type": "broll", "assetId": "a_img", "start": 6.0, "duration": 2.0,
                 "sourceStart": 0, "layout": "split_top", "revealAnimation": "slide_down", "zIndex": 10},
                {"id": "b_empty", "type": "broll", "assetId": None, "start": 9.0, "duration": 1.0,
                 "keyword": "ocean waves", "zIndex": 10}]},
            {"id": "c", "type": "caption", "items": [
                {"id": "cap1", "type": "caption", "start": 0.5, "duration": 2.0,
                 "text": "Up 90% today", "fontSize": 64, "color": "#FFFFFF", "fontFamily": "Montserrat",
                 "position": "bottom", "animation": "fade",
                 "stressWordIndices": [1], "stressColor": "#0F172A",
                 "stressBackgroundColor": "#FACC15", "stressFontFamily": "Poppins"},
                {"id": "cap_hidden", "type": "caption", "start": 3.0, "duration": 1.0,
                 "text": "hidden line", "hidden": True}]},
            {"id": "z", "type": "zoom", "items": [
                {"id": "z1", "type": "zoom", "start": 4.0, "duration": 2.0,
                 "transform": {"scale": 1.3}, "zIndex": 50}]},
            {"id": "au", "type": "audio", "items": [
                {"id": "mus", "type": "audio", "assetId": "a_audio", "start": 0, "duration": 12.0,
                 "sourceStart": 0, "volume": 0.4}]},
            {"id": "ct", "type": "cta", "items": [
                {"id": "cta1", "type": "cta", "start": 0.0, "duration": 3.0,
                 "text": "Follow for more", "backgroundColor": "#7C3AED", "position": "top"}]},
        ],
    })
    assets = {
        "a_main": Asset(id="a_main", kind="video", filename="m.mp4", url="/tmp/m.mp4", duration=12, width=1080, height=1920),
        "a_broll": Asset(id="a_broll", kind="video", filename="b.mp4", url="/tmp/b.mp4", duration=8, width=1080, height=1920),
        "a_img": Asset(id="a_img", kind="image", filename="i.png", url="/tmp/i.png", duration=None, width=1920, height=1020),
        "a_audio": Asset(id="a_audio", kind="audio", filename="a.mp3", url="/tmp/a.mp3", duration=30, width=None, height=None),
    }
    return tl, assets


def test_validation():
    tl, assets = sample_timeline()
    errors, warnings = shotstack_timeline.validate(tl, assets)
    check("valid timeline produces no errors", not errors, str(errors))
    check("split layout is warned about", any("split" in w for w in warnings), str(warnings))
    check("animated zoom is warned about", any("Zoom" in w for w in warnings), str(warnings))

    # Odd dimensions are rejected (H.264 needs even width/height).
    bad = Timeline(**json.loads(json.dumps(tl.model_dump())))
    bad.project.width = 1081
    errors, _ = shotstack_timeline.validate(bad, assets)
    check("odd width is rejected", any("odd dimension" in e for e in errors), str(errors))

    # A dangling assetId must be caught before anything is uploaded.
    bad2 = Timeline(**json.loads(json.dumps(tl.model_dump())))
    for t in bad2.tracks:
        if t.type == "video":
            t.items[0].assetId = "does_not_exist"
    errors, _ = shotstack_timeline.validate(bad2, assets)
    check("missing asset is rejected", any("not in this project" in e for e in errors), str(errors))

    # No video at all.
    empty = Timeline(**{"project": {"id": "p", "width": 1080, "height": 1920, "fps": 30, "duration": 0},
                        "tracks": [{"id": "v", "type": "video", "items": []}]})
    errors, _ = shotstack_timeline.validate(empty, {})
    check("empty timeline is rejected", any("no video clip" in e for e in errors), str(errors))


def test_conversion():
    tl, assets = sample_timeline()
    urls = {
        "a_main": "https://cdn.shotstack.io/m.mp4",
        "a_broll": "https://cdn.shotstack.io/b.mp4",
        "a_img": "https://cdn.shotstack.io/i.png",
        "a_audio": "https://cdn.shotstack.io/a.mp3",
    }
    fonts_ok = {f: f"https://fonts.gstatic.com/s/{f.lower().replace(' ', '')}/v1/abc.ttf"
                for f in shotstack_timeline.collect_font_families(tl)}
    result = shotstack_timeline.build_edit(tl, assets, urls,
                                           callback="https://example.com/api/shotstack/webhook",
                                           font_urls=fonts_ok)
    edit = result.edit

    out = edit["output"]
    check("output is mp4", out["format"] == "mp4")
    check("exact pixel size preserved (aspect ratio)",
          out["size"] == {"width": 1080, "height": 1920}, str(out.get("size")))
    check("fps preserved", out["fps"] == 30, str(out.get("fps")))
    check("callback registered", edit.get("callback", "").endswith("/api/shotstack/webhook"))

    tracks = edit["timeline"]["tracks"]
    types = []
    for t in tracks:
        a = t["clips"][0]["asset"]
        types.append(a.get("type"))

    # Shotstack composites the FIRST track on TOP. CTA and captions must
    # therefore come before b-roll, which comes before the main video.
    def track_index(pred):
        for i, t in enumerate(tracks):
            if any(pred(c) for c in t["clips"]):
                return i
        return -1

    i_cta = track_index(lambda c: c["asset"].get("type") == "html" and "cta" in c["asset"].get("css", ""))
    i_cap = track_index(lambda c: c["asset"].get("type") == "html" and ".line{" in c["asset"].get("css", ""))
    i_broll = track_index(lambda c: c["asset"].get("src") in ("https://cdn.shotstack.io/b.mp4", "https://cdn.shotstack.io/i.png"))
    i_main = track_index(lambda c: c["asset"].get("src") == "https://cdn.shotstack.io/m.mp4" and c["asset"].get("volume") == 1.0)
    i_audio = track_index(lambda c: c["asset"].get("type") == "audio")

    check("layer order: CTA above captions", i_cta < i_cap, f"cta={i_cta} cap={i_cap}")
    check("layer order: captions above b-roll", i_cap < i_broll, f"cap={i_cap} broll={i_broll}")
    check("layer order: b-roll above main video", i_broll < i_main, f"broll={i_broll} main={i_main}")
    check("audio track present", i_audio >= 0)

    # Durations / positions preserved exactly.
    all_clips = [c for t in tracks for c in t["clips"]]
    main_clip = next(c for c in all_clips if c["asset"].get("src") == "https://cdn.shotstack.io/m.mp4" and c["asset"].get("volume") == 1.0)
    check("main clip length preserved", main_clip["length"] == 12.0, str(main_clip))
    broll_clip = next(c for c in all_clips if c["asset"].get("src") == "https://cdn.shotstack.io/b.mp4")
    check("b-roll start preserved", broll_clip["start"] == 2.0, str(broll_clip))
    check("b-roll length preserved", broll_clip["length"] == 3.0, str(broll_clip))
    check("b-roll fade maps to a fade transition",
          broll_clip.get("transition", {}).get("in") == "fade", str(broll_clip.get("transition")))
    check("b-roll audio is muted so it can't fight the main track",
          broll_clip["asset"].get("volume") == 0)

    img_clip = next(c for c in all_clips if c["asset"].get("src") == "https://cdn.shotstack.io/i.png")
    check("image b-roll uses the image asset type", img_clip["asset"]["type"] == "image")
    check("split_top anchors to the top half", img_clip.get("position") == "top", str(img_clip))

    # Captions: per-word spans, stress styling, hidden lines skipped.
    cap_clips = [c for c in all_clips if c["asset"].get("type") == "html" and ".line{" in c["asset"].get("css", "")]
    check("hidden caption is skipped", len(cap_clips) == 1, f"{len(cap_clips)} caption clips")
    cap_html = cap_clips[0]["asset"]["html"]
    check("caption words become individual spans", cap_html.count("<span") == 3, cap_html)
    check("stress word carries its highlight colour", "#FACC15" in cap_html, cap_html)
    check("percent sign survives into the caption", "90%" in cap_html, cap_html)
    check("stress font applied to the stress word", "Poppins" in cap_html, cap_html)

    # Zoom becomes a scaled copy of the main video.
    zoom_clip = next((c for c in all_clips
                      if c["asset"].get("src") == "https://cdn.shotstack.io/m.mp4" and c.get("scale")), None)
    check("zoom emitted as a scaled main-video clip", zoom_clip is not None)
    if zoom_clip:
        check("zoom scale preserved", zoom_clip["scale"] == 1.3, str(zoom_clip))
        check("zoom copy is muted", zoom_clip["asset"]["volume"] == 0)

    # Keyword-only b-roll must be skipped, not emitted as a blank layer.
    # (html caption/CTA assets carry no `src` by design, so only media
    # clips are checked here.)
    media_srcs = [c["asset"].get("src") for c in all_clips
                  if c["asset"].get("type") in ("video", "image", "audio")]
    check("every media clip has a real src (no blank layers)",
          all(bool(s) for s in media_srcs), str(media_srcs))
    check("keyword-only b-roll produced no clip", len(media_srcs) == 5, str(media_srcs))
    check("keyword-only b-roll is reported", any("ocean waves" in w for w in result.warnings), str(result.warnings))

    # Fonts used by captions are declared for the HTML renderer.
    fonts = json.dumps(edit["timeline"].get("fonts", []))
    check("caption fonts declared", "montserrat" in fonts.lower() and "poppins" in fonts.lower(), fonts)
    check("font families collected for resolution",
          set(shotstack_timeline.collect_font_families(tl)) == {"Inter", "Montserrat", "Poppins"},
          str(shotstack_timeline.collect_font_families(tl)))

    # REGRESSION: a font that cannot be resolved must degrade the typeface,
    # never fail the render. An unreachable URL in timeline.fonts makes
    # Shotstack reject the whole edit with "One or more assets could not be
    # found", which is exactly what happened with hardcoded font URLs.
    degraded = shotstack_timeline.build_edit(tl, assets, urls, font_urls={})
    check("unresolved fonts emit no fonts array at all",
          "fonts" not in degraded.edit["timeline"], str(degraded.edit["timeline"].get("fonts")))
    check("unresolved fonts are warned about, not fatal",
          any("font file" in w for w in degraded.warnings), str(degraded.warnings))
    check("captions still render without a resolved font",
          any(c["asset"].get("type") == "html"
              for t in degraded.edit["timeline"]["tracks"] for c in t["clips"]))
    partial = shotstack_timeline.build_edit(tl, assets, urls, font_urls={"Inter": "https://x/i.ttf"})
    check("only resolvable fonts are sent",
          partial.edit["timeline"]["fonts"] == [{"src": "https://x/i.ttf"}],
          str(partial.edit["timeline"].get("fonts")))

    check("only referenced assets are collected for upload",
          set(shotstack_timeline.collect_asset_ids(tl)) == {"a_main", "a_broll", "a_img", "a_audio"},
          str(shotstack_timeline.collect_asset_ids(tl)))


def test_full_flow_mocked():
    """Editor -> Export -> Shotstack -> MP4 -> what the frontend polls."""
    from app import db
    from app.routers import export as export_router

    tl, assets = sample_timeline()
    project_id = "test_proj_shotstack"
    db.put_project(project_id, {
        "id": project_id, "name": "test",
        "timeline": tl.model_dump(),
        "assets": [a.model_dump() for a in assets.values()],
    })

    calls = {"uploads": 0, "submits": 0, "status": 0}
    orig = (shotstack.upload_asset, shotstack.submit_render,
            shotstack.get_render_status, shotstack.require_configured)

    def fake_upload(path, poll_ready=True):
        calls["uploads"] += 1
        return f"https://cdn.shotstack.io/{os.path.basename(path)}"

    def fake_submit(edit):
        calls["submits"] += 1
        # The edit handed to Shotstack must be JSON-serialisable.
        json.dumps(edit)
        return "render_abc123"

    statuses = iter([
        {"status": "queued", "url": None, "error": None, "raw": {}},
        {"status": "rendering", "url": None, "error": None, "raw": {}},
        {"status": "done", "url": "https://cdn.shotstack.io/out/render_abc123.mp4",
         "error": None, "poster": None, "thumbnail": None, "raw": {}},
    ])

    def fake_status(render_id):
        calls["status"] += 1
        return next(statuses)

    def fake_fonts(families, verify=True):
        # Mimic the real failure: nothing resolves. The render must proceed.
        return {}, list(families)

    shotstack.upload_asset = fake_upload
    shotstack.submit_render = fake_submit
    shotstack.get_render_status = fake_status
    shotstack.require_configured = lambda: None
    shotstack.resolve_font_urls = fake_fonts
    export_router.shotstack.resolve_font_urls = fake_fonts
    export_router.shotstack.upload_asset = fake_upload
    export_router.shotstack.submit_render = fake_submit
    export_router.shotstack.get_render_status = fake_status
    export_router.shotstack.require_configured = lambda: None

    job_id = "job_test_1"
    db.put_job(job_id, {"id": job_id, "projectId": project_id, "status": "queued",
                        "format": "mp4", "engine": "shotstack", "progress": 0,
                        "outputUrl": None, "error": None})
    try:
        import app.routers.export as ex
        ex._poll_shotstack.__globals__  # noqa
        # Speed the poller up for the test.
        real_poll = ex._poll_shotstack
        ex._poll_shotstack = lambda jid, rid, attempts=10, delay=0: real_poll(jid, rid, attempts=10, delay=0)
        ex._run_shotstack(job_id, project_id)
        ex._poll_shotstack = real_poll
    finally:
        (shotstack.upload_asset, shotstack.submit_render,
         shotstack.get_render_status, shotstack.require_configured) = orig

    job = db.get_job(job_id)
    check("flow: assets uploaded once each", calls["uploads"] == 4, str(calls))
    check("flow: render submitted", calls["submits"] == 1, str(calls))
    check("flow: job ends done", job["status"] == "done", str(job))
    check("flow: MP4 URL returned to the frontend",
          job.get("outputUrl", "").endswith(".mp4"), str(job.get("outputUrl")))
    check("flow: marked as externally hosted", job.get("hosted") is True, str(job))
    check("flow: progress reaches 100", job.get("progress") == 100, str(job.get("progress")))
    check("flow: conversion warnings surfaced on the job", bool(job.get("warnings")), str(job.get("warnings")))
    check("flow: render id recorded for the webhook", job.get("renderId") == "render_abc123", str(job))

    # ---- failure path ----
    job2 = "job_test_2"
    db.put_job(job2, {"id": job2, "projectId": project_id, "status": "queued",
                      "format": "mp4", "engine": "shotstack", "progress": 0})
    def failing_status(render_id):
        return {"status": "failed", "url": None, "error": "asset could not be fetched", "raw": {}}
    shotstack.get_render_status = export_router.shotstack.get_render_status = failing_status
    shotstack.upload_asset = export_router.shotstack.upload_asset = fake_upload
    shotstack.submit_render = export_router.shotstack.submit_render = fake_submit
    shotstack.require_configured = export_router.shotstack.require_configured = lambda: None
    import app.routers.export as ex
    real_poll = ex._poll_shotstack
    ex._poll_shotstack = lambda jid, rid, attempts=3, delay=0: real_poll(jid, rid, attempts=3, delay=0)
    ex._run_shotstack(job2, project_id)
    ex._poll_shotstack = real_poll
    (shotstack.upload_asset, shotstack.submit_render,
     shotstack.get_render_status, shotstack.require_configured) = orig

    j2 = db.get_job(job2)
    check("failure: job marked failed", j2["status"] == "failed", str(j2))
    check("failure: Shotstack's reason is surfaced",
          "asset could not be fetched" in (j2.get("error") or ""), str(j2.get("error")))

    # ---- validation blocks before any upload ----
    bad_id = "test_proj_bad"
    bad_tl = tl.model_dump()
    bad_tl["project"]["width"] = 1081
    db.put_project(bad_id, {"id": bad_id, "name": "bad", "timeline": bad_tl,
                            "assets": [a.model_dump() for a in assets.values()]})
    job3 = "job_test_3"
    db.put_job(job3, {"id": job3, "projectId": bad_id, "status": "queued", "engine": "shotstack"})
    before = calls["uploads"]
    shotstack.require_configured = export_router.shotstack.require_configured = lambda: None
    shotstack.upload_asset = export_router.shotstack.upload_asset = fake_upload
    ex._run_shotstack(job3, bad_id)
    (shotstack.upload_asset, shotstack.require_configured) = (orig[0], orig[3])
    j3 = db.get_job(job3)
    check("validation blocks the job before any upload",
          j3["status"] == "failed" and calls["uploads"] == before, str(j3.get("error")))
    check("validation failure is labelled as such", j3.get("errorStage") == "validation", str(j3))

    for k in (job_id, job2, job3):
        d = db._load(); d["jobs"].pop(k, None); db._save(d)
    for k in (project_id, bad_id):
        db.delete_project(k)


def test_error_messages():
    """Shotstack rejections must come back as something a user can act on."""
    class R:
        def __init__(self, code, body):
            self.status_code = code
            self._b = body
            self.text = json.dumps(body)
        def json(self):
            return self._b

    e = shotstack._explain_http_error(R(401, {}), "submit")
    check("401 explains the API key", "API key" in e.message, e.message)
    e = shotstack._explain_http_error(R(429, {}), "submit")
    check("429 explains rate limiting", "rate-limited" in e.message, e.message)
    e = shotstack._explain_http_error(
        R(400, {"message": "Bad Request",
                "data": [{"field": "timeline.tracks[0].clips[0].asset.src",
                          "message": "must be a valid url"}]}), "submit")
    check("400 names the offending field",
          "asset.src" in e.message and "valid url" in e.message, e.message)


if __name__ == "__main__":
    print("=== validation ===");   test_validation()
    print("\n=== conversion ===");  test_conversion()
    print("\n=== error messages ==="); test_error_messages()
    print("\n=== full flow (mocked Shotstack) ==="); test_full_flow_mocked()
    print(f"\n{'=' * 56}\n{len(PASS)} passed, {len(FAIL)} failed")
    if FAIL:
        print("FAILED:")
        for f in FAIL:
            print("  -", f)
    raise SystemExit(1 if FAIL else 0)
