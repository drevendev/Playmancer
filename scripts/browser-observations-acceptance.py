#!/usr/bin/env python3
"""Real HTTP observation explorer acceptance; no screenshots are fabricated."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
import re
from pathlib import Path
import subprocess
import threading
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / '.test-artifacts'
OUT.mkdir(exist_ok=True)
parser = argparse.ArgumentParser()
parser.add_argument('--site', type=Path)
parser.add_argument('--engine', choices=('chromium','all'), default='chromium')
parser.add_argument('--chromium', help='Optional local Chromium executable; CI uses its pinned browser')
args = parser.parse_args()
site = args.site or OUT / 'observations-site'
hosted = os.environ.get('PLAYMANCER_HOSTED_URL')
expected_sha = os.environ.get('PLAYMANCER_EXPECTED_SHA')
if hosted:
    if hosted.rstrip('/') != 'https://drevendev.github.io/Playmancer' or not re.fullmatch('[a-f0-9]{40}', expected_sha or ''):
        raise ValueError('Hosted observations require the canonical Pages URL and exact expected SHA')
if args.site is None and not hosted:
    subprocess.run(['node', 'scripts/build-release.mjs', str(site)], cwd=ROOT, check=True)

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

server = thread = None
if not hosted:
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(site.resolve())))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
base = hosted.rstrip('/') + '/' if hosted else f'http://127.0.0.1:{server.server_port}/'
results = []

def check(condition, name):
    results.append({'name': name, 'pass': bool(condition)})
    assert condition, name

try:
    with sync_playwright() as p:
        for engine in (('chromium','firefox','webkit') if args.engine == 'all' else ('chromium',)):
            browser = getattr(p, engine).launch(headless=True, **({'executable_path': args.chromium} if args.chromium and engine == 'chromium' else {}))
            for width in (1280, 390, 320):
                context = browser.new_context(viewport={'width': width, 'height': 900}, reduced_motion='reduce')
                page = context.new_page()
                errors, external = [], []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.on('request', lambda req: external.append(req.url) if urlsplit(req.url).netloc != urlsplit(base).netloc else None)
                page.goto(base, wait_until='networkidle')
                original = page.url
                entry = page.get_by_role('link', name='Explore gameplay facts (new tab)')
                check(entry.get_attribute('target') == '_blank', f'{engine}/{width}: basket remains in original tab')
                with page.expect_popup() as popup:
                    entry.click()
                explore = popup.value
                explore.wait_for_load_state('networkidle')
                if expected_sha:
                    for document in (page, explore):
                        check(document.locator('meta[name="playmancer-revision"]').get_attribute('content') == expected_sha, f'{engine}/{width}: exact hosted revision')
                explore.on('pageerror', lambda error: errors.append(str(error)))
                explore.on('request', lambda req: external.append(req.url) if urlsplit(req.url).netloc != urlsplit(base).netloc else None)
                check(page.url == original, f'{engine}/{width}: original basket URL unchanged')
                check('48 dated facts' in explore.locator('#coverage').inner_text(), f'{engine}/{width}: honest coverage')
                check(explore.locator('.game-card').count() == 30, f'{engine}/{width}: complete catalog with unknowns')
                explore.locator('#sample').click()
                check(explore.locator('#comparison-title').evaluate('(el)=>el===document.activeElement'), f'{engine}/{width}: sample focus')
                shared = explore.locator('#comparison > section')
                check(shared.get_by_text('Constructing structures', exact=True).count() == 1, f'{engine}/{width}: shared fact')
                check(shared.locator('a').count() == 2, f'{engine}/{width}: both field receipts')
                check('not a verified difference' in explore.locator('#comparison').inner_text(), f'{engine}/{width}: no fabricated mismatch')
                explore.locator('#query').fill('farming')
                check(explore.locator('.game-card').count() == 2, f'{engine}/{width}: gameplay search')
                explore.locator('#tag').select_option('mechanic:building')
                check(explore.locator('.game-card').count() == 0, f'{engine}/{width}: combined search empty state')
                explore.locator('#query').fill('')
                check(explore.locator('.game-card').count() == 3, f'{engine}/{width}: positive fact filter')
                explore.locator('#show-link').click()
                link = explore.locator('#share-url').input_value()
                explore.goto(link, wait_until='networkidle')
                check(explore.locator('#left').input_value() == 'wikidata:q16972008' and explore.locator('#right').input_value() == 'wikidata:q332697', f'{engine}/{width}: ordered pair restored')
                check(explore.locator('#tag').input_value() == 'mechanic:building', f'{engine}/{width}: filter restored')
                explore.locator('#right').select_option('dreven:devmatch')
                check('not a zero match' in explore.locator('#comparison').inner_text(), f'{engine}/{width}: unknown comparison')
                explore.locator('#left').select_option('dreven:devmatch')
                check('Choose two different games' in explore.locator('#action-status').inner_text(), f'{engine}/{width}: duplicate pair rejected')
                explore.goto(base + 'observations.html#facts=%7B%22version%22%3A%22future%22%7D')
                explore.locator('#link-error').wait_for(state='visible')
                check(explore.locator('#link-error').is_visible(), f'{engine}/{width}: incompatible link visible')
                check(explore.locator('#left').input_value() == '', f'{engine}/{width}: no silent substitute')
                explore.locator('#reset').click()
                explore.locator('#sample').click()
                explore.locator('#query').fill('Celeste')
                explore.get_by_text('Inspect sources for Celeste', exact=True).click()
                check(explore.locator('.game-card a[href="https://www.celestegame.com/changelog.html"]').count() == 2, f'{engine}/{width}: per-field Celeste URLs')
                for locator in ('#query', '#tag', '#left', '#right', '#sample', '#show-link'):
                    check(explore.locator(locator).bounding_box()['height'] >= 44, f'{engine}/{width}: touch size {locator}')
                explore.locator('#left').focus()
                explore.keyboard.press('Tab')
                check(explore.locator('#right').evaluate('(el)=>el===document.activeElement'), f'{engine}/{width}: keyboard flow')
                explore.locator('#query').fill('')
                explore.screenshot(path=str(OUT / f'observations-{engine}-{width}.png'), full_page=True)
                for scale in (200, 400):
                    explore.evaluate('(scale)=>document.documentElement.style.fontSize=scale+"%"', scale)
                    check(explore.evaluate('document.documentElement.scrollWidth<=innerWidth+1'), f'{engine}/{width}: {scale}% reflow')
                explore.locator('#comparison-title').scroll_into_view_if_needed()
                explore.screenshot(path=str(OUT / f'observations-{engine}-{width}-400.png'), full_page=False)
                check(not errors, f'{engine}/{width}: no JS errors {errors}')
                check(not external, f'{engine}/{width}: no external resource requests {external}')
                context.close()
            browser.close()
finally:
    if server:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
    (OUT / 'observations-browser.json').write_text(json.dumps({'checks': results, 'passed': sum(r['pass'] for r in results), 'total': len(results)}, indent=2))
print(f"Observation browser checks: {sum(r['pass'] for r in results)}/{len(results)} PASS")
