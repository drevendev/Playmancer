#!/usr/bin/env python3
"""Fail a Pages build when the player is incomplete or has remote assets.

The source must already be built by scripts/build-demo.mjs. This tool does not
create or deploy a site and cannot substitute for live Pages verification.
"""
from __future__ import annotations

import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import sys


class AssetLinks(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.assets: list[str] = []
        self.has_title = False
        self.has_viewport = False
        self.script_count = 0
        self.script_modules = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attrs = dict(attrs)
        if tag == "title":
            self.has_title = True
        if tag == "meta" and attrs.get("name") == "viewport":
            self.has_viewport = True
        if tag == "script":
            self.script_count += 1
            self.script_modules += (attrs.get("type") == "module")
        if tag in ("script", "link", "img", "iframe", "video", "audio", "source"):
            for attr in ("src", "href", "srcset", "poster"):
                if attrs.get(attr):
                    self.assets.append(f"{tag}[{attr}]={attrs[attr]}")


def main() -> int:
    site = Path(sys.argv[1] if len(sys.argv) > 1 else "_site").resolve()
    index = site / "index.html"
    marker = site / ".nojekyll"
    worker = site / "bridge-worker.js"
    assert site.is_dir(), f"Static output missing: {site}"
    assert index.is_file() and not index.is_symlink(), "Expected regular _site/index.html"
    assert marker.is_file() and not marker.is_symlink(), "Expected regular _site/.nojekyll"
    assert marker.stat().st_size == 0, ".nojekyll must be empty"
    assert worker.is_file() and not worker.is_symlink(), "Expected regular same-origin bridge-worker.js"
    assert worker.stat().st_size < 40_000, "Bridge worker exceeds bounded static asset budget"
    paths = {p.relative_to(site).as_posix() for p in site.rglob("*") if p.is_file()}
    assert paths == {"index.html", ".nojekyll", "bridge-worker.js"}, f"Unexpected public build contents: {paths}"
    text = index.read_text(encoding="utf-8")
    worker_text = worker.read_text(encoding="utf-8")
    parser = AssetLinks()
    parser.feed(text)
    assert parser.has_title and parser.has_viewport, "Missing title or responsive viewport"
    assert parser.script_count >= 1 and parser.script_modules == 1, "Expected exactly one inline module"
    assert not parser.assets, f"Unbundled or network assets: {parser.assets}"
    assert re.search(r"synthetic|fictional", text, re.I), "Demo provenance label missing"
    assert not re.search(r"\bfetch\s*\(|XMLHttpRequest\s*\(|sendBeacon\s*\(", text + worker_text), "Unexpected network API use"
    assert not re.search(r"\bimportScripts\s*\(|\bnew\s+WebSocket\s*\(", worker_text), "Unexpected worker network or dynamic imports"
    assert "self.onmessage =" in worker_text and "buildBridgePreview(data.input)" in worker_text, "Worker entry is incomplete"
    assert "./bridge-worker.js" in text, "Player does not refer to bundled worker asset"
    payload = {
        "status": "PASS",
        "files": sorted(paths),
        "size_bytes": len(index.read_bytes()),
        "index_sha256": hashlib.sha256(index.read_bytes()).hexdigest(),
        "worker_size_bytes": len(worker.read_bytes()),
        "worker_sha256": hashlib.sha256(worker.read_bytes()).hexdigest(),
        "scope": "LOCAL_STATIC_PAYLOAD_ONLY_NOT_DEPLOYED",
    }
    print(json.dumps(payload, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
