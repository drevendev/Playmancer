#!/usr/bin/env python3
"""Nonpublished, strict-preflight 1,000-profile release fixture browser gate."""
import json
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import sys
import threading
from urllib.parse import unquote, urlsplit
from playwright.sync_api import sync_playwright

site = Path(sys.argv[1]).resolve()
out = Path(__file__).resolve().parents[1] / '.test-artifacts'
out.mkdir(exist_ok=True)
server = ThreadingHTTPServer(('127.0.0.1', 0), partial(SimpleHTTPRequestHandler, directory=str(site)))
thread = threading.Thread(target=server.serve_forever, daemon=True)
thread.start()
url = f'http://127.0.0.1:{server.server_port}/observations.html'
report = []
late = 'fixture:scale-0965'
observed = 'wikidata:q16972008'

try:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        for width in (1280, 390):
            page = browser.new_page(viewport={'width': width, 'height': 900}, reduced_motion='reduce')
            errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.goto(url)
            page.locator('#coverage').wait_for()
            cards = page.locator('#observation-games article')
            def check(condition, label):
                report.append({'width': width, 'name': label, 'pass': bool(condition)})
                assert condition, label
            def counts():
                return [cards.count(), page.locator('#left option').count(), page.locator('#right option').count()]
            check('30 of 1000' in page.locator('#coverage').inner_text(), 'exact fixture coverage')
            check(counts() == [24, 25, 25], 'bounded actual card/option nodes')
            first = cards.evaluate_all('els => els.map(el => el.dataset.gameId)')
            next_button = page.locator('#observation-next')
            next_button.focus()
            next_button.press('Enter')
            check(cards.count() == 24 and not set(first).intersection(cards.evaluate_all('els => els.map(el => el.dataset.gameId)')), 'keyboard next page, no duplicate IDs')
            check(next_button.evaluate('el => el === document.activeElement'), 'next keeps focus')
            viewport = cards.first.evaluate('el => { const r = el.getBoundingClientRect(); return {top: r.top, bottom: r.bottom, height: innerHeight}; }')
            check(0 <= viewport['top'] < viewport['height'], f'new batch starts in viewport: {viewport}')
            page.keyboard.press('Tab')
            check(cards.first.locator('button').first.evaluate('el => el === document.activeElement'), 'native Tab enters first new card')
            page.keyboard.press('Shift+Tab')
            check(next_button.evaluate('el => el === document.activeElement'), 'reverse Tab returns to pager')
            second = cards.evaluate_all('els => els.map(el => el.dataset.gameId)')
            page.keyboard.press('Enter')
            check(cards.count() == 24 and not set(second).intersection(cards.evaluate_all('els => els.map(el => el.dataset.gameId)')), 'repeat Enter advances again')
            page.locator('#observation-prev').focus()
            page.keyboard.press('Enter')
            check(cards.evaluate_all('els => els.map(el => el.dataset.gameId)') == second, 'previous returns to second page')
            page.locator('#observation-prev').focus()
            page.locator('#observation-prev').press('Enter')
            check(cards.evaluate_all('els => els.map(el => el.dataset.gameId)') == first, 'previous restores exact IDs')
            check(next_button.evaluate('el => el === document.activeElement'), 'boundary retains actionable focus')
            page.locator('#query').fill('ZZ Scale fixture 0965')
            check(cards.count() == 1 and cards.first.get_attribute('data-game-id') == late, 'late unknown search')
            check('Unrecorded is unknown' in cards.first.inner_text(), 'unknown is not absent')
            check(not page.locator('#observation-pages').is_visible(), 'single page hides paging')
            page.locator('#left-filter').fill('Factorio')
            page.keyboard.press('Tab')
            check(page.locator('#left').evaluate('el => el === document.activeElement'), 'first filter Tab reaches first select')
            page.keyboard.press('Tab')
            check(page.locator('#right-filter').evaluate('el => el === document.activeElement'), 'first select Tab reaches second filter')
            page.locator('#left').select_option(observed)
            page.locator('#right-filter').fill('ZZ Scale fixture 0965')
            page.keyboard.press('Tab')
            check(page.locator('#right').evaluate('el => el === document.activeElement'), 'second filter Tab reaches second select')
            page.locator('#right').select_option(late)
            check('comparison is incomplete' in page.locator('#comparison').inner_text(), 'observed versus unknown comparison')
            page.locator('#right-filter').fill('no such identity')
            check(page.locator('#right').input_value() == late and page.locator('#right option').count() == 2, 'retains selected ID while filtering')
            page.locator('#left-filter').fill('')
            check(page.locator('#left').input_value() == observed and page.locator('#left option').count() <= 26, 'left option bound including retained ID')
            page.locator('#show-link').click()
            share = page.locator('#share-url').input_value()
            state = json.loads(unquote(urlsplit(share).fragment.removeprefix('facts=')))
            check(state['pair'] == [observed, late] and state['query'] == 'ZZ Scale fixture 0965' and state['catalog'] == 'multi-store-genre-pilot-scale-fixture-1000' and len(state['evidence']) == 40, 'exact ordered versioned share')
            page.goto(share)
            page.reload()
            check(page.locator('#left').input_value() == observed and page.locator('#right').input_value() == late and cards.count() == 1, 'restores late selected ID and query')
            check(max(counts()[1:]) <= 26, 'restored selects bounded')
            page.locator('#query').fill('')
            check(cards.count() == 24 and cards.evaluate_all('els => els.map(el => el.dataset.gameId)') == first, 'clear search resets first page')
            check(page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'no horizontal overflow')
            check(not errors, 'no runtime errors')
            page.screenshot(path=str(out / f'observations-scale-{width}.png'))
            page.close()
        browser.close()
finally:
    server.shutdown()
    server.server_close()
    (out / 'observations-scale.json').write_text(json.dumps(report, indent=2))
print(f'Passed {len(report)} sparse explorer browser assertions.')
