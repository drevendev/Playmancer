#!/usr/bin/env python3
"""Real production-library acceptance. Fresh contexts; no visitor data is used."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import subprocess
from threading import Thread
from urllib.parse import unquote, urlsplit
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / '.test-artifacts'
DB = 'playmancer-basket-library'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--engine', choices=['all', 'chromium', 'firefox', 'webkit'], default='all')
    parser.add_argument('--site', type=Path)
    args = parser.parse_args()
    ARTIFACTS.mkdir(exist_ok=True)
    hosted = os.environ.get('PLAYMANCER_HOSTED_URL')
    revision = os.environ.get('PLAYMANCER_EXPECTED_SHA')
    server = None
    if hosted:
        from hosted_validation import validate_hosted_identity
        validate_hosted_identity(hosted, revision, args.site)
        url = hosted.rstrip('/') + '/'
    else:
        site = args.site or ARTIFACTS / 'library-site'
        if not args.site:
            subprocess.run(['node', str(ROOT / 'scripts/build-release.mjs'), str(site)], check=True)
        server = ThreadingHTTPServer(('127.0.0.1', 0), partial(SimpleHTTPRequestHandler, directory=str(site.resolve())))
        Thread(target=server.serve_forever, daemon=True).start()
        url = f'http://127.0.0.1:{server.server_port}/'
    report = {'scope': 'HOSTED' if hosted else 'LOCAL_HTTP', 'expected_revision': revision,
              'checks': [], 'status': 'RUNNING'}

    def check(label, condition):
        report['checks'].append({'name': label, 'pass': bool(condition)})
        if not condition:
            raise AssertionError(label)

    def settled(page):
        page.wait_for_function("document.querySelector('#basket-library')?.getAttribute('aria-busy') === 'false'")

    def open_panel(page):
        page.goto(url, wait_until='networkidle')
        expect(page.locator('#intro-library')).to_be_visible()
        page.locator('#intro-library').focus()
        page.keyboard.press('Enter')
        settled(page)
        if hosted:
            check('served revision matches deployment', page.locator('meta[name="playmancer-revision"]').get_attribute('content') == revision)

    def backup(page, current=False):
        page.locator('#library-transfer').evaluate('(node) => node.open = true')
        page.click('#library-export-current' if current else '#library-export-all')
        settled(page)
        return json.loads(page.locator('#library-json').input_value())

    def save(page, name):
        page.fill('#library-name', name)
        page.locator('#library-save').focus()
        page.keyboard.press('Enter')
        settled(page)

    def import_data(page, data):
        page.locator('#library-transfer').evaluate('(node) => node.open = true')
        page.fill('#library-json', data if isinstance(data, str) else json.dumps(data))
        page.click('#library-import')
        settled(page)

    def count(page):
        return page.locator('.library-card').count()

    # Test fixture helpers are isolated from application code and only touch a
    # fresh context's local test database. No browser storage is uploaded.
    def inject(page, entry):
        page.evaluate("""entry => new Promise((resolve, reject) => {
          const request = indexedDB.open('playmancer-basket-library', 1);
          request.onsuccess = () => {
            const db = request.result, tx = db.transaction('baskets', 'readwrite');
            tx.objectStore('baskets').put(entry);
            tx.oncomplete = () => { db.close(); resolve(); };
            tx.onabort = () => { db.close(); reject(tx.error); };
          }; request.onerror = () => reject(request.error);
        })""", entry)

    try:
        with sync_playwright() as playwright:
            for engine in (['chromium', 'firefox', 'webkit'] if args.engine == 'all' else [args.engine]):
                browser = getattr(playwright, engine).launch()
                try:
                    for width, device in [(1280, 'desktop'), (390, 'mobile')]:
                        context = browser.new_context(viewport={'width': width, 'height': 900}, accept_downloads=True,
                                                      reduced_motion='reduce')
                        page = context.new_page()
                        errors, external = [], []
                        page.on('pageerror', lambda error: errors.append(str(error)))
                        page.on('request', lambda request: external.append(request.url)
                                if urlsplit(request.url).scheme in ('http', 'https') and urlsplit(request.url).netloc != urlsplit(url).netloc else None)
                        prefix = f'{engine}/{device}: '
                        open_panel(page)
                        check(prefix + 'keyboard shortcut focuses library', page.locator('#library-heading').evaluate('(node) => node === document.activeElement'))
                        check(prefix + 'no automatic saved preferences', count(page) == 0)
                        save(page, '')
                        check(prefix + 'blank name rejected', count(page) == 0 and 'name' in page.locator('#library-status').inner_text())
                        save(page, 'Weekend')
                        check(prefix + 'explicit keyboard save', count(page) == 1 and 'Saved' in page.locator('#library-status').inner_text())
                        initial = backup(page)['baskets'][0]
                        page.reload(wait_until='networkidle'); page.click('#intro-library'); settled(page)
                        check(prefix + 'reload retains saved basket', count(page) == 1)
                        # Simulate a real bfcache lifecycle in every engine, even if
                        # the test runner disables actual history caching.
                        preserved_hash = page.evaluate('location.hash')
                        page.evaluate("window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))")
                        check(prefix + 'suspended tab disables local writes', page.locator('#library-save').is_disabled())
                        page.evaluate("window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))")
                        settled(page)
                        check(prefix + 'bfcache return reopens saved library',
                              count(page) == 1 and not page.locator('#library-save').is_disabled()
                              and '1 of 20 saved baskets' in page.locator('#library-status').inner_text())
                        check(prefix + 'bfcache return does not alter the current basket',
                              page.evaluate('location.hash') == preserved_hash)
                        save(page, 'After history')
                        check(prefix + 'save works after bfcache reconnect', count(page) == 2)
                        page.once('dialog', lambda dialog: dialog.accept())
                        page.get_by_role('button', name='Delete saved basket After history', exact=True).click()
                        settled(page)
                        check(prefix + 'post-return delete preserves prior saved basket', count(page) == 1
                              and backup(page)['baskets'][0] == initial)
                        # Real interactions construct a nontrivial versioned basket.
                        page.select_option('#mode', 'blend')
                        page.locator('#lambda').focus(); page.keyboard.press('Home')
                        for _ in range(7): page.keyboard.press('ArrowRight')
                        page.locator('#seeds input[type=range]').first.focus(); page.keyboard.press('End')
                        hide = page.locator('#results .card-footer button[aria-label^="Hide "]').first
                        expect(hide).to_be_visible(); hide.click()
                        page.select_option('#platform', 'windows'); page.check('#coop')
                        endpoints = page.locator('#bridge-start option').evaluate_all('(nodes) => nodes.map(n => n.value).filter(Boolean)')
                        page.select_option('#bridge-start', endpoints[0]); page.select_option('#bridge-end', endpoints[1])
                        page.select_option('#bridge-hops', '4'); page.select_option('#bridge-threshold', '0.31')
                        save(page, 'Strict')
                        detailed = backup(page, current=True)['baskets'][0]
                        decoded = json.loads(unquote(detailed['hash'][8:]))
                        check(prefix + 'backup preserves all player controls', decoded['mode'] == 'blend' and decoded['platform'] == 'windows' and
                              decoded['coopOnly'] and decoded['seeds'][0]['weight'] == 10 and decoded['excluded'] and decoded['bridge']['maxHops'] == 4)
                        page.click('#reset')
                        before = page.evaluate('location.hash')
                        page.once('dialog', lambda dialog: dialog.dismiss())
                        page.get_by_role('button', name='Restore saved basket Strict', exact=True).click()
                        check(prefix + 'cancel restore preserves current', page.evaluate('location.hash') == before)
                        page.once('dialog', lambda dialog: dialog.accept())
                        page.get_by_role('button', name='Restore saved basket Strict', exact=True).click()
                        check(prefix + 'exact full-state restoration', page.evaluate('location.hash') == detailed['hash'])
                        check(prefix + 'restore focus is predictable', page.locator('#basket-title').evaluate('(n) => n === document.activeElement'))
                        save(page, 'Weekend')
                        check(prefix + 'duplicate save does not replace', count(page) == 2 and 'Duplicate' in page.locator('#library-status').inner_text())
                        check(prefix + 'old basket unchanged after collision', next(e for e in backup(page)['baskets'] if e['name'] == 'Weekend') == initial)
                        page.once('dialog', lambda dialog: dialog.accept('Evening'))
                        page.get_by_role('button', name='Rename saved basket Strict', exact=True).click(); settled(page)
                        check(prefix + 'rename retains state', next(e for e in backup(page)['baskets'] if e['name'] == 'Evening')['hash'] == detailed['hash'])
                        exported = backup(page)
                        with page.expect_download() as download_info: page.click('#library-download')
                        settled(page)
                        download = download_info.value
                        check(prefix + 'downloaded JSON matches library', json.loads(Path(download.path()).read_text()) == exported)
                        page.once('dialog', lambda dialog: dialog.accept())
                        page.get_by_role('button', name='Delete saved basket Evening', exact=True).click(); settled(page)
                        check(prefix + 'delete only affects saved entry', count(page) == 1 and page.evaluate('location.hash') == detailed['hash'])
                        import_data(page, exported)
                        check(prefix + 'duplicate import rolls back entire batch', count(page) == 1 and 'Duplicate' in page.locator('#library-status').inner_text())
                        for i, item in enumerate(exported['baskets']): item['name'] = f'Imported {i}'
                        import_data(page, exported)
                        check(prefix + 'valid batch added without changing current', count(page) == 3 and page.evaluate('location.hash') == detailed['hash'])
                        future = json.loads(json.dumps(exported)); future['baskets'][0]['name'] = 'Would add'
                        state_future = json.loads(unquote(initial['hash'][8:])); state_future['method'] = 'future-method'
                        from urllib.parse import quote
                        future['baskets'][1] = {'name': 'Future', 'hash': '#basket=' + quote(json.dumps(state_future))}
                        for invalid in ['{', {**exported, 'version': 2}, {**exported, 'unknown': True}, future]:
                            import_data(page, invalid)
                            check(prefix + 'invalid import preserves both stores', count(page) == 3 and page.evaluate('location.hash') == detailed['hash'])
                        hostile = '<img src=x onerror=alert(1)>'
                        save(page, hostile)
                        check(prefix + 'names rendered as inert text', count(page) == 4 and page.locator('#library-list img').count() == 0)
                        # Separate tabs share serialized read/write transactions.
                        second = context.new_page(); open_panel(second)
                        page.fill('#library-name', 'Concurrent A'); second.fill('#library-name', 'Concurrent B')
                        page.evaluate("document.getElementById('library-save').click()")
                        second.evaluate("document.getElementById('library-save').click()")
                        settled(page); settled(second); page.click('#library-refresh'); settled(page)
                        check(prefix + 'both concurrent saves retained', count(page) == 6 and
                              page.get_by_role('button', name='Restore saved basket Concurrent A', exact=True).count() == 1 and
                              page.get_by_role('button', name='Restore saved basket Concurrent B', exact=True).count() == 1)
                        second.close()
                        # Retain readable ordinary-library screenshots before capacity stress.
                        page.locator('#library-transfer').evaluate('(node) => node.open = false')
                        page.screenshot(path=str(ARTIFACTS / f'library-{engine}-{device}.png'), full_page=True)
                        page.locator('#basket-library').screenshot(path=str(ARTIFACTS / f'library-{engine}-{device}-panel.png'))
                        check(prefix + 'narrow layout has no overflow', page.evaluate('document.documentElement.scrollWidth <= innerWidth'))
                        targets = page.locator('#basket-library button:visible').evaluate_all('(nodes) => nodes.every(n => n.getBoundingClientRect().height >= 44)')
                        check(prefix + '44px action targets', targets)
                        # Simulate a write error; a request is NOT a committed save.
                        page.evaluate("""() => {
                          window.originalLibraryAdd = IDBObjectStore.prototype.add;
                          IDBObjectStore.prototype.add = function(...args) {
                            if (this.name === 'baskets') throw new DOMException('Simulated quota failure', 'QuotaExceededError');
                            return window.originalLibraryAdd.apply(this, args);
                          };
                        }""")
                        save(page, 'Must not exist')
                        check(prefix + 'failed write never reports saved', count(page) == 6 and 'Simulated quota failure' in page.locator('#library-status').inner_text())
                        page.evaluate('() => { IDBObjectStore.prototype.add = window.originalLibraryAdd; delete window.originalLibraryAdd; }')
                        page.click('#library-refresh'); settled(page)
                        check(prefix + 'failed transaction preserved prior data', count(page) == 6)
                        fill = {'format': 'playmancer-baskets', 'version': 1, 'baskets': [dict(initial, name=f'Capacity {i}') for i in range(14)]}
                        import_data(page, fill); check(prefix + '20-entry limit accepted', count(page) == 20)
                        save(page, 'Overflow'); check(prefix + 'no eviction on overflow', count(page) == 20 and '20' in page.locator('#library-status').inner_text())
                        page.locator('#library-transfer').evaluate('(node) => node.open = true')
                        page.set_input_files('#library-file', {'name': 'oversize.json', 'mimeType': 'application/json', 'buffer': b' ' * 1048577})
                        expect(page.locator('#library-status')).to_contain_text('exceeds 1 MiB')
                        check(prefix + 'oversized file cannot mutate library', count(page) == 20)
                        check(prefix + 'no JavaScript errors', not errors)
                        check(prefix + 'no external requests', not external)
                        context.close()

                    # Storage failures and stale records use separate disposable contexts.
                    context = browser.new_context(); page = context.new_page()
                    page.add_init_script("Object.defineProperty(window, 'indexedDB', { get() { throw new DOMException('Storage blocked', 'SecurityError'); } });")
                    open_panel(page)
                    check(engine + ': unavailable storage disables save', page.locator('#library-save').is_disabled())
                    check(engine + ': unavailable storage still exports current', len(backup(page, current=True)['baskets']) == 1)
                    context.close()
                    context = browser.new_context(); page = context.new_page(); open_panel(page)
                    stale = dict(initial, name='Older version', hash=future['baskets'][1]['hash'])
                    inject(page, stale); page.click('#library-refresh'); settled(page)
                    check(engine + ': stale record is retained but not restored', count(page) == 1 and page.get_by_role('button', name='Restore saved basket Older version', exact=True).is_disabled())
                    check(engine + ': stale record can be exported unchanged', backup(page)['baskets'] == [stale])
                    inject(page, {'name': 'Broken', 'hash': '#basket=bad', 'unexpected': True})
                    page.click('#library-refresh'); settled(page)
                    check(engine + ': corrupt store fails closed', page.locator('#library-save').is_disabled() and 'No stored records were erased' in page.locator('#library-status').inner_text())
                    check(engine + ': current export survives corrupt store', len(backup(page, current=True)['baskets']) == 1)
                    context.close()
                finally:
                    browser.close()
        report['status'] = 'PASS'
    except Exception as error:
        report['status'] = 'FAIL'; report['error'] = str(error)
        raise
    finally:
        (ARTIFACTS / 'library-browser.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
        if server: server.shutdown(); server.server_close()
        print(json.dumps({'status': report['status'], 'checks': len(report['checks'])}))


if __name__ == '__main__':
    main()
