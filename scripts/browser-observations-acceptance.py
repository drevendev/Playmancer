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
from urllib.parse import urlsplit, unquote
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
                # Each recommendation must expose an ordered, individually
                # versioned comparison for every selected favorite, not just
                # the first basket item. Expanding links never changes ranking.
                first_result = page.locator('#results .card').first
                check(first_result.count() == 1, f'{engine}/{width}: sample has a recommendation')
                seed_names = page.locator('#seeds .seed-name').all_inner_texts()
                check(len(seed_names) >= 2, f'{engine}/{width}: sample contains multiple favorites')
                chooser = first_result.locator('details.fact-compare-menu')
                check(chooser.count() == 1, f'{engine}/{width}: per-favorite comparison disclosure')
                chooser.locator('summary').click()
                check(chooser.locator('summary').bounding_box()['height'] >= 44,
                      f'{engine}/{width}: comparison disclosure is touch accessible')
                compare = chooser.locator('a.fact-compare-link')
                check(compare.count() == len(seed_names),
                      f'{engine}/{width}: one comparison link per ordered favorite')
                pairs = []
                for index, favorite_name in enumerate(seed_names):
                    link = compare.nth(index)
                    check(link.inner_text() == f'With {favorite_name} (new tab)' and
                          link.get_attribute('target') == '_blank' and
                          link.get_attribute('rel') == 'noopener noreferrer' and
                          link.bounding_box()['height'] >= 44,
                          f'{engine}/{width}: favorite {index} has a keyboard/touch link')
                    fragment = urlsplit(link.get_attribute('href')).fragment
                    check(fragment.startswith('facts='), f'{engine}/{width}: pinned comparison deep link')
                    pinned = json.loads(unquote(fragment[len('facts='):]))
                    check(pinned['catalog'] == entry.get_attribute('data-observation-catalog') and
                          pinned['version'] == entry.get_attribute('data-observation-version') and
                          pinned['evidence'] == entry.get_attribute('data-observation-evidence') and
                          pinned['pair'][1] == first_result.get_attribute('data-game-id') and
                          pinned['pair'][0] != pinned['pair'][1] and
                          pinned['query'] == '' and pinned['tag'] == '',
                          f'{engine}/{width}: favorite {index} retains exact source revisions and candidate')
                    pairs.append(pinned['pair'][0])
                check(len(set(pairs)) == len(seed_names),
                      f'{engine}/{width}: distinct favorites are not silently substituted')
                # Choose the last favorite so a regression to the former
                # first-only link fails even if the initial pair still works.
                with page.expect_popup() as paired_popup:
                    compare.last.click()
                paired = paired_popup.value
                paired.wait_for_load_state('networkidle')
                check(paired.locator('#left').input_value() == pairs[-1] and
                      paired.locator('#right').input_value() == first_result.get_attribute('data-game-id') and
                      not paired.locator('#link-error').is_visible(),
                      f'{engine}/{width}: selected non-first favorite and result restored')
                check('partial observations' in paired.locator('#comparison').inner_text() or
                      'comparison is incomplete' in paired.locator('#comparison').inner_text(),
                      f'{engine}/{width}: incomplete evidence disclosed, not called fit')
                check(page.url == original, f'{engine}/{width}: comparison does not mutate basket')
                paired.close()
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
                check('66 dated facts' in explore.locator('#coverage').inner_text(), f'{engine}/{width}: honest coverage')
                explore.locator('#query').fill('telegraphed')
                check(explore.locator('.game-card').count() == 1 and
                      'Into the Breach' in explore.locator('.game-card').first.inner_text(),
                      f'{engine}/{width}: official new gameplay fact searchable')
                explore.locator('#query').fill('fingerprints')
                check(explore.locator('.game-card').count() == 1 and
                      'Papers, Please' in explore.locator('.game-card').first.inner_text(),
                      f'{engine}/{width}: officially sourced document inspection searchable')
                explore.locator('#query').fill('drafting')
                check(explore.locator('.game-card').count() == 1 and
                      'Inscryption' in explore.locator('.game-card').first.inner_text(),
                      f'{engine}/{width}: officially sourced card drafting searchable')
                explore.locator('#query').fill('')
                explore.locator('#left').select_option('wikidata:q109051201')
                explore.locator('#right').select_option('wikidata:q48078440')
                check(explore.locator('#comparison').get_by_text('Deck building', exact=True).count() == 1,
                      f'{engine}/{width}: Inscryption and Slay the Spire share sourced deck building')
                check(explore.locator('#comparison a[href="https://www.inscryption.com/steam"]').count() >= 1,
                      f'{engine}/{width}: official Inscryption field receipt linked')
                explore.locator('#query').fill('')
                check(explore.locator('.game-card').count() == 30, f'{engine}/{width}: complete catalog with unknowns')
                explore.locator('#sample').click()
                for side, expected in (('left', 'Factorio'), ('right', 'Terraria')):
                    current = explore.locator(f'#{side}-current')
                    check(current.is_visible() and expected in current.inner_text(),
                          f'{engine}/{width}: sample selected value shown outside truncated select')
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
                for side in ('left', 'right'):
                    check(explore.locator(f'#{side}-current').evaluate("""el => el.textContent ===
                        'Selected: ' + document.getElementById(el.id.replace('-current', '')).selectedOptions[0].textContent"""),
                        f'{engine}/{width}: selected readout follows share restoration')
                # The skip link must not replace the versioned state fragment.
                explore.locator('#query').fill('building')
                explore.locator('#show-link').click()
                navigation_state = """() => ({
                    hash: location.hash,
                    controls: ['left','right','query','tag','share-url'].map(id => document.getElementById(id).value),
                    comparison: document.getElementById('comparison').textContent,
                    results: [...document.querySelectorAll('.game-card')].map(el => el.dataset.gameId)
                })"""
                before_skip = explore.evaluate(navigation_state)
                for activation in ('keyboard', 'pointer'):
                    skip = explore.get_by_role('link', name='Skip to game comparison')
                    skip.focus()
                    if activation == 'keyboard':
                        skip.press('Enter')
                    else:
                        skip.click()
                    # Observe after queued hashchange/focus work, not the transient anchor focus.
                    explore.evaluate('() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
                    check(explore.evaluate(navigation_state) == before_skip, f'{engine}/{width}: {activation} skip preserves pair, filters and share')
                    check(explore.locator('#comparison-title').evaluate('(el)=>el===document.activeElement'), f'{engine}/{width}: {activation} skip focus')
                    check(not explore.locator('#link-error').is_visible(), f'{engine}/{width}: {activation} skip has no link error')
                    check(explore.locator('#share-box').is_visible(), f'{engine}/{width}: {activation} skip retains share controls')
                explore.screenshot(path=str(OUT / f'observations-{engine}-{width}-skip.png'), full_page=False)
                explore.locator('#query').fill('')
                explore.locator('#right').select_option('dreven:devmatch')
                check('not a zero match' in explore.locator('#comparison').inner_text(), f'{engine}/{width}: unknown comparison')
                explore.locator('#left').select_option('dreven:devmatch')
                check('Choose two different games' in explore.locator('#action-status').inner_text(), f'{engine}/{width}: duplicate pair rejected')
                explore.goto(base + 'observations.html#facts=%7B%22version%22%3A%22future%22%7D')
                explore.locator('#link-error').wait_for(state='visible')
                check(explore.locator('#link-error').is_visible(), f'{engine}/{width}: incompatible link visible')
                check(explore.locator('#left').input_value() == '', f'{engine}/{width}: no silent substitute')
                check(not explore.locator('#left-current').is_visible() and not explore.locator('#right-current').is_visible(),
                      f'{engine}/{width}: invalid share leaves no stale selected readouts')
                explore.locator('#reset').click()
                explore.locator('#sample').click()
                explore.locator('#query').fill('Celeste')
                explore.get_by_text('Inspect sources for Celeste', exact=True).click()
                check(explore.locator('.game-card a[href="https://www.celestegame.com/changelog.html"]').count() == 2, f'{engine}/{width}: per-field Celeste URLs')
                explore.locator('#query').fill('Idle Fantasy Shop')
                owned = explore.locator('.game-card[data-game-id="dreven:idle-fantasy-shop"]')
                check(owned.count() == 1, f'{engine}/{width}: canonical owner game searchable')
                owned.get_by_text('Inspect sources for Idle Fantasy Shop', exact=True).click()
                check(owned.locator('.fact-list a').count() == 6, f'{engine}/{width}: six dated owner-game source receipts')
                check(owned.locator('.fact-list a[href*="/devlog/"]').count() == 6,
                      f'{engine}/{width}: first-party field-specific devlogs')
                check(owned.get_by_text('Stocking shop shelves', exact=True).count() == 1,
                      f'{engine}/{width}: confirmed shelf stocking fact')
                check(owned.get_by_text('Automating production', exact=True).count() == 0,
                      f'{engine}/{width}: no speculative factory-automation tag')
                for locator in ('#query', '#tag', '#left', '#right', '#sample', '#show-link'):
                    check(explore.locator(locator).bounding_box()['height'] >= 44, f'{engine}/{width}: touch size {locator}')
                explore.locator('#left').focus()
                explore.keyboard.press('Tab')
                check(explore.locator('#right').evaluate('(el)=>el===document.activeElement'), f'{engine}/{width}: keyboard flow')
                explore.locator('#query').fill('')
                explore.screenshot(path=str(OUT / f'observations-{engine}-{width}.png'), full_page=True)
                # An unknown game's long native option is intentionally truncated at
                # extreme zoom; the external, fully wrapping readout must not be.
                explore.locator('#right').select_option('dreven:devmatch')
                for scale in (200, 400):
                    explore.evaluate('(scale)=>document.documentElement.style.fontSize=scale+"%"', scale)
                    layout = explore.evaluate("""() => ({
                        viewport: innerWidth,
                        document: document.documentElement.scrollWidth,
                        intrinsic: [...document.querySelectorAll('body, body *')].map(node => ({
                            node, excess: node.scrollWidth - node.clientWidth
                        })).filter(({node, excess}) => excess > 1 && node.clientWidth > 0)
                            .sort((a,b)=>b.excess-a.excess).slice(0, 12)
                            .map(({node, excess})=>({tag:node.tagName,id:node.id,
                                className: typeof node.className === 'string' ? node.className.slice(0,60):'',
                                scroll:node.scrollWidth,client:node.clientWidth,
                                text:node.textContent.slice(0,60)})),
                        offenders: [...document.querySelectorAll('body *')].map(node => ({
                            node, rect: node.getBoundingClientRect()
                        })).filter(({rect}) => rect.width > 0 && rect.right > innerWidth + 1)
                            .slice(0, 8).map(({node, rect}) => ({
                                tag: node.tagName, id: node.id, className: typeof node.className === 'string' ? node.className.slice(0, 80) : '',
                                right: Math.round(rect.right), width: Math.round(rect.width)
                            }))
                    })""")
                    check(layout['document'] <= layout['viewport'] + 1,
                          f'{engine}/{width}: {scale}% reflow; layout={layout}')
                    if scale == 400:
                        for side in ('left', 'right'):
                            readout = explore.locator(f'#{side}-current')
                            check(readout.is_visible() and readout.evaluate("""el => {
                                const side = el.id.replace('-current', '');
                                const select = document.getElementById(side);
                                return el.textContent === 'Selected: ' + select.selectedOptions[0].textContent
                                    && el.scrollWidth <= el.clientWidth + 1
                                    && getComputedStyle(el).whiteSpace === 'normal';
                            }"""), f'{engine}/{width}: 400% full wrapping {side} selected game')
                        # A page can have no horizontal overflow while tearing a heading
                        # into single-letter fragments. Assert actual rendered geometry.
                        for heading in ('h1', '#comparison-title', '#explore-title'):
                            words_whole = explore.locator(heading).evaluate("""el => {
                                const node = el.firstChild;
                                if (!node || node.nodeType !== Node.TEXT_NODE) return false;
                                return [...node.textContent.matchAll(/\\S+/gu)].every(word => {
                                    const range = document.createRange();
                                    range.setStart(node, word.index);
                                    range.setEnd(node, word.index + word[0].length);
                                    return range.getClientRects().length === 1;
                                });
                            }""")
                            check(words_whole, f'{engine}/{width}: 400% {heading} words remain whole')
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
