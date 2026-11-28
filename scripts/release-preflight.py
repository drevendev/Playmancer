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

args = sys.argv[1:]
candidates = {
    '--candidate-30': ('multi-store-genre-pilot-30-2026-10-28', 'aec15a40ed968916f4120d04aab53731740ee82d', 30),
    '--candidate-31': ('multi-store-genre-pilot-31-2026-11-24', 'db1591ae8691adbf2cf375476db93bc1281c057a', 31),
    '--candidate-35': ('multi-store-genre-pilot-35-2026-11-24', 'a49eb238b3f18fc0aa2d8e2d3be913a4862c336c', 35),
    '--candidate-51': ('multi-store-genre-pilot-51-2026-11-25', 'f3296c542e795d691f472aa401626317e656b82a', 51),
    '--candidate-54': ('multi-store-identity-candidate-54-2026-11-26', '473884e85398c820c4453eafd1c932d56710b36c', 54),
    '--candidate-58': ('multi-store-identity-candidate-58-2026-11-27', '8ebc922447aa80c032802d7ab0709b15bafbf85f', 58),
    '--candidate-62': ('multi-store-identity-candidate-62-2026-11-27', '1d02909f335531ede09db8cd1665c12cf6f0f404', 62),
    '--candidate-66': ('multi-store-identity-candidate-66-2026-11-28', '99cfc494fb1f5e6bffd5b57476d1259358f7651c', 66),
    '--candidate-70': ('multi-store-identity-candidate-70-2026-11-28', 'bf459c7e6b9c417d4a9c91e91142f7b474a04ad0', 70),
}
assert len(args) <= 2 and (len(args) < 2 or args[1] in candidates) and (not args or not args[0].startswith('-')), 'Expected [site [--candidate-30|--candidate-31|--candidate-35|--candidate-51|--candidate-54|--candidate-58|--candidate-62|--candidate-66|--candidate-70]]'
site = Path(args[0] if args else '_site').resolve()
expected_catalog, expected_evidence, expected_count = candidates[args[1]] if len(args) == 2 else candidates['--candidate-70']
root = Path(__file__).resolve().parents[1]
base = {'index.html','.nojekyll','bridge-worker.js','player.css'}
expected = base | {'observations.html'}
assert {p.relative_to(site).as_posix() for p in site.rglob('*') if p.is_file()} == expected, 'Unexpected production release contents'
assert all((site / name).is_file() and not (site / name).is_symlink() for name in expected), 'Expected regular release files'
text = (site / 'observations.html').read_text(encoding='utf-8')
budget = 100000 if expected_count <= 250 else 200000 if expected_count <= 1000 else 320000
assert 0 < len(text.encode()) < budget, 'Observation payload exceeds selected catalog size budget'
# The tier comes from the exact selected binding, not an untrusted page count.
embedded = re.findall(r'^const OBSERVATION_DATA = (.+);$', text, re.M)
assert len(embedded) == 1, 'Expected one observation model'
model = json.loads(embedded[0])
assert model['catalog'] == expected_catalog and model['evidence'] == expected_evidence, 'Embedded observation binding mismatch'
assert len(model['games']) == expected_count, 'Embedded observation catalog count mismatch'
parser = ObservationAssets(); parser.feed(text)
assert parser.title and parser.viewport and parser.modules == parser.scripts == 1, 'Incomplete observation document'
assert not parser.assets, 'Observation explorer must be self-contained'
assert not re.search(r'\bfetch\s*\(|XMLHttpRequest\s*\(|sendBeacon\s*\(|importScripts\s*\(|new\s+WebSocket\s*\(', text), 'Unexpected observation network API'
styles = re.findall(r'<style>([\s\S]*?)</style>', text)
assert len(styles) == 1 and not re.search(r'@import\b|url\s*\(', styles[0], re.I), 'Unexpected observation stylesheet assets'
assert parser.meta.get('playmancer-observations') == expected_evidence, 'Observation fingerprint missing or wrong for selected release'
assert parser.meta.get('playmancer-catalog') == expected_catalog, 'Wrong selected release catalog'
main = ObservationAssets(); main_text = (site / 'index.html').read_text(encoding='utf-8'); main.feed(main_text)
for key in ('playmancer-revision','playmancer-catalog'):
    assert parser.meta.get(key) and parser.meta[key] == main.meta.get(key), f'Observation {key} differs from player'
assert 'href="./observations.html" target="_blank" rel="noopener noreferrer"' in main_text, 'Explorer entry or basket isolation missing'
assert f'data-observation-catalog="{expected_catalog}" data-observation-evidence="{expected_evidence}"' in main_text, 'Player observation binding differs from selected release'
# The legacy validator still receives EXACT player bytes; only the separately
# validated new page is outside its four-file contract. Nothing is stripped.
with tempfile.TemporaryDirectory(prefix='playmancer-core-preflight-') as directory:
    for name in base: shutil.copyfile(site / name, Path(directory) / name)
    subprocess.run([sys.executable, str(root / 'scripts/pages-preflight.py'), directory], check=True)
print(json.dumps({'status':'PASS','files':sorted(expected),'observations_bytes':len(text.encode()),
                  'observations_sha256':hashlib.sha256(text.encode()).hexdigest(),
                  'scope':'LOCAL_STATIC_PAYLOAD_ONLY_NOT_DEPLOYED'}, indent=2))
