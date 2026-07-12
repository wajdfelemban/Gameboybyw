#!/usr/bin/env python3
"""Bundle the app into one self-contained HTML file (offline, no server).

Inlines css/style.css, js/data.js, js/app.js, and the pixel font (as a
base64 data URI) into a single SMLE-Study-standalone.html at the repo root.
Run after changing the CSS, app logic, or regenerating js/data.js:

    python3 tools/build_standalone.py
"""
import base64
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def build() -> Path:
    css = (ROOT / "css/style.css").read_text(encoding="utf-8")
    font_b64 = base64.b64encode((ROOT / "assets/fonts/pressstart2p-latin.woff2").read_bytes()).decode()
    css = css.replace(
        'url("../assets/fonts/pressstart2p-latin.woff2") format("woff2")',
        f'url("data:font/woff2;base64,{font_b64}") format("woff2")',
    )
    data_js = (ROOT / "js/data.js").read_text(encoding="utf-8")
    app_js = (ROOT / "js/app.js").read_text(encoding="utf-8")

    html = (ROOT / "index.html").read_text(encoding="utf-8")
    html = html.replace('<link rel="stylesheet" href="css/style.css">', f"<style>\n{css}\n</style>")
    html = html.replace('<script src="js/data.js"></script>', f"<script>\n{data_js}\n</script>")
    html = html.replace('<script src="js/app.js"></script>', f"<script>\n{app_js}\n</script>")

    out = ROOT / "SMLE-Study-standalone.html"
    out.write_text(html, encoding="utf-8")
    assert "SMLE_DATA" in html and "data:font/woff2" in html, "bundle missing embedded assets"
    return out


if __name__ == "__main__":
    out = build()
    print(f"Wrote {out} ({out.stat().st_size / 1024:.0f} KB)")
