#!/usr/bin/env python3
"""
Build a single self-contained HTML file from the site.

The hosted site fetches its catalogue from data/*.json, which a browser refuses
to read over file://. This packs the stylesheets, scripts, both JSON databases
and every image into one document that works from a double-click, an email
attachment, or a USB stick — no server, no network.

Images are re-encoded smaller for this build: the plates never render above
~320 CSS px, so shipping the full-size textiles would triple the file for no
visible gain.

    python3 build-single-file.py [-o inclusively-zera.html]
"""

import argparse
import base64
import json
import mimetypes
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent
OUT_DEFAULT = ROOT / "inclusively-zera.html"

# Longest edge, in pixels, for each image in the packed build.
IMAGE_WIDTHS = {
    "assets/img/fabric/": 520,   # clipped into a ~300px plate
    "assets/img/": 1400,         # hero, shown full-bleed
}


def die(msg):
    print(f"error: {msg}", file=sys.stderr)
    sys.exit(1)


def read(rel):
    p = ROOT / rel
    if not p.exists():
        die(f"missing {rel}")
    return p.read_text(encoding="utf-8")


def target_width(rel):
    for prefix, width in IMAGE_WIDTHS.items():
        if rel.startswith(prefix):
            return width
    return 1400


def data_uri(rel, tmpdir):
    """Read an image, shrink it for this build, and return it as a data: URI."""
    src = ROOT / rel
    if not src.exists():
        die(f"missing image {rel}")

    mime = mimetypes.guess_type(src.name)[0] or "application/octet-stream"
    work = pathlib.Path(tmpdir) / src.name
    shutil.copy2(src, work)

    # sips ships with macOS. Elsewhere, fall back to the original bytes.
    if shutil.which("sips"):
        subprocess.run(
            ["sips", "-Z", str(target_width(rel)), str(work)],
            capture_output=True, check=False,
        )

    blob = base64.b64encode(work.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{blob}"


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("-o", "--output", default=str(OUT_DEFAULT),
                    help="where to write the packed file")
    args = ap.parse_args()

    html = read("index.html")
    inventory = json.loads(read("data/inventory.json"))
    sources = json.loads(read("data/sources.json"))

    with tempfile.TemporaryDirectory() as tmp:
        # --- images: rewrite every path in the data before it is inlined ------
        packed = {}

        def pack(rel):
            if rel not in packed:
                packed[rel] = data_uri(rel, tmp)
            return packed[rel]

        for item in inventory["items"]:
            if item.get("fabric", {}).get("file"):
                item["fabric"]["file"] = pack(item["fabric"]["file"])
            if item.get("photo"):
                item["photo"] = pack(item["photo"])

        # --- stylesheets ------------------------------------------------------
        css = "\n".join(
            f"/* ===== {name} ===== */\n{read('assets/' + name)}"
            for name in ("styles.css", "a11y.css")
        )
        html = re.sub(
            r'<link rel="stylesheet" href="assets/styles\.css">\s*'
            r'<link rel="stylesheet" href="assets/a11y\.css">',
            lambda _m, _c="<style>\n" + css + "\n</style>": _c,
            html, count=1,
        )

        # --- scripts ----------------------------------------------------------
        # The shop fetches its data; here it is already on the page, so a small
        # shim answers those two fetches from memory and lets app.js run
        # unmodified. Everything else about the file is the hosted site verbatim.
        shim = (
            "<script>\n"
            "/* Packed single-file build: the catalogue is embedded below, so the\n"
            "   two fetches app.js makes are answered from memory rather than the\n"
            "   network. Nothing else differs from the hosted site. */\n"
            "window.ZERA_EMBEDDED = {\n"
            '  "data/inventory.json": ' + json.dumps(inventory, ensure_ascii=False) + ",\n"
            '  "data/sources.json": ' + json.dumps(sources, ensure_ascii=False) + "\n"
            "};\n"
            "(function (realFetch) {\n"
            "  window.fetch = function (input, init) {\n"
            "    var url = typeof input === 'string' ? input : (input && input.url) || '';\n"
            "    var hit = window.ZERA_EMBEDDED[url];\n"
            "    if (hit) {\n"
            "      return Promise.resolve({\n"
            "        ok: true, status: 200,\n"
            "        json: function () { return Promise.resolve(hit); },\n"
            "        text: function () { return Promise.resolve(JSON.stringify(hit)); }\n"
            "      });\n"
            "    }\n"
            "    return realFetch ? realFetch.apply(window, arguments)\n"
            "                     : Promise.reject(new Error('offline build: ' + url));\n"
            "  };\n"
            "})(window.fetch && window.fetch.bind(window));\n"
            "</script>\n"
        )

        scripts = shim + "\n".join(
            f'<script>\n/* ===== {name} ===== */\n{read("assets/" + name)}\n</script>'
            for name in ("plates.js", "app.js", "a11y.js")
        )
        html = re.sub(
            r'<script src="assets/plates\.js"></script>\s*'
            r'<script src="assets/app\.js"></script>\s*'
            r'<script src="assets/a11y\.js"></script>',
            lambda _m, _c=scripts: _c, html, count=1,
        )

        # --- remaining images in the markup ----------------------------------
        def sub_img(m):
            return m.group(1) + pack(m.group(2)) + m.group(3)

        html = re.sub(r'(src=")(assets/img/[^"]+)(")', sub_img, html)

        # --- the docs pages are not packed; point at the hosted copies --------
        html = html.replace(
            'href="docs/accessibility.html"',
            'href="https://aryamansub17.github.io/house-of-zera/docs/accessibility.html"')
        html = html.replace(
            'href="docs/data-sources.html"',
            'href="https://aryamansub17.github.io/house-of-zera/docs/data-sources.html"')

    out = pathlib.Path(args.output)
    out.write_text(html, encoding="utf-8")

    mb = out.stat().st_size / (1024 * 1024)
    print(f"wrote {out}  ({mb:.1f} MB, {len(packed)} images inlined)")
    if mb > 12:
        print("warning: over 12 MB — some mail servers will reject this as an attachment.")


if __name__ == "__main__":
    main()
