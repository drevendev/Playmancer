#!/usr/bin/env python3
"""Validate the five-file production release, retaining every legacy player check."""
from html.parser import HTMLParser
from pathlib import Path
import hashlib
import json
import re
import shutil
import subprocess
import sys
import tempfile

class ObservationAssets(HTMLParser):
    def __init__(self):
        super().__init__()
        self.assets = []
        self.modules = 0
        self.scripts = 0
        self.meta = {}
        self.viewport = False
        self.title = False
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'title': self.title = True
        if tag == 'meta':
            self.meta[attrs.get('name')] = attrs.get('content')
            self.viewport |= attrs.get('name') == 'viewport'
        if tag == 'script':
            self.scripts += 1
            self.modules += attrs.get('type') == 'module'
        if tag in ('script','link','img','iframe','video','audio','source'):
            self.assets.extend(value for key,value in attrs.items() if key in ('src','href','srcset','poster') and value)

site = Path(sys.argv[1] if len(sys.argv) > 1 else '_site').resolve()
root = Path(__file__).resolve().parents[1]
base = {'index.html','.nojekyll','bridge-worker.js','player.css'}
expected = base | {'observations.html'}
assert {p.relative_to(site).as_posix() for p in site.rglob('*') if p.is_file()} == expected, 'Unexpected production release contents'
assert all((site / name).is_file() and not (site / name).is_symlink() for name in expected), 'Expected regular release files'
text = (site / 'observations.html').read_text(encoding='utf-8')
assert 0 < len(text.encode()) < 100000, 'Observation payload exceeds 100 kB'
parser = ObservationAssets(); parser.feed(text)
assert parser.title and parser.viewport and parser.modules == parser.scripts == 1, 'Incomplete observation document'
assert not parser.assets, 'Observation explorer must be self-contained'
assert not re.search(r'\bfetch\s*\(|XMLHttpRequest\s*\(|sendBeacon\s*\(|importScripts\s*\(|new\s+WebSocket\s*\(', text), 'Unexpected observation network API'
styles = re.findall(r'<style>([\s\S]*?)</style>', text)
assert len(styles) == 1 and not re.search(r'@import\b|url\s*\(', styles[0], re.I), 'Unexpected observation stylesheet assets'
assert parser.meta.get('playmancer-observations') == '8d667a7c67b028e0f4f550ce22f8e333eb93c58a', 'Observation fingerprint missing'
main = ObservationAssets(); main_text = (site / 'index.html').read_text(encoding='utf-8'); main.feed(main_text)
for key in ('playmancer-revision','playmancer-catalog'):
    assert parser.meta.get(key) and parser.meta[key] == main.meta.get(key), f'Observation {key} differs from player'
assert 'href="./observations.html" target="_blank" rel="noopener noreferrer"' in main_text, 'Explorer entry or basket isolation missing'
# The legacy validator still receives EXACT player bytes; only the separately
# validated new page is outside its four-file contract. Nothing is stripped.
with tempfile.TemporaryDirectory(prefix='playmancer-core-preflight-') as directory:
    for name in base: shutil.copyfile(site / name, Path(directory) / name)
    subprocess.run([sys.executable, str(root / 'scripts/pages-preflight.py'), directory], check=True)
print(json.dumps({'status':'PASS','files':sorted(expected),'observations_bytes':len(text.encode()),
                  'observations_sha256':hashlib.sha256(text.encode()).hexdigest(),
                  'scope':'LOCAL_STATIC_PAYLOAD_ONLY_NOT_DEPLOYED'}, indent=2))
