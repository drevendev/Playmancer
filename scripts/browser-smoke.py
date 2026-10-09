"""Offline Chromium smoke checks against the exact dependency-free static build.

Requires Python Playwright plus Chromium. No HTTP navigation is used by this harness;
this is not a hosted Pages/deployment or screen-reader certification test.
"""
from pathlib import Path
import json
import os
import shutil
import subprocess
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / '.test-artifacts'
ARTIFACTS.mkdir(exist_ok=True)
subprocess.run(['node', str(ROOT / 'scripts/build-demo.mjs')], check=True)
launch_options = {'headless': True}
executable = os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE') or shutil.which('chromium')
if executable:
    launch_options['executable_path'] = executable
checks=[]
def check(name, condition):
    if not condition:
        print('FAILED', name, 'errors=', errors)
        print('STATE',page.locator('#status').text_content(),page.locator('#mode').input_value(),page.locator('#platform').input_value(),page.locator('#coop').is_checked())
        print('PARTITIONS',page.locator('#partition-list').text_content())
        print('RESULTS',page.locator('#results').inner_text()[:1400])
    assert condition, name
    checks.append(name)
with sync_playwright() as p:
    browser = p.chromium.launch(**launch_options)
    context = browser.new_context(viewport={'width':1280,'height':1000}, reduced_motion='reduce')
    page=context.new_page(); errors=[]
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.set_content((ROOT / '_site/index.html').read_text()); page.wait_for_function("document.querySelectorAll('#seeds > li').length === 2")
    check('initial two-seed basket renders real ranking',page.locator('#seeds > li').count()==2 and page.locator('#results > li').count()==6)
    page.locator('#clear').click()
    check('start empty basket clears sample explicitly',page.locator('#seeds > li').count()==0 and page.locator('#results > li').count()==0 and page.evaluate('document.activeElement.id')=='search')
    page.locator('#reset').click()
    check('sample reset restores starter basket',page.locator('#seeds > li').count()==2 and page.locator('#results > li').count()==6)
    page.locator('.skip').focus(); page.keyboard.press('Enter')
    check('keyboard skip retains basket and focuses results', page.locator('#seeds > li').count()==2 and page.evaluate('document.activeElement.id')=='recommendations' and page.locator('#error').is_hidden())
    page.locator('#mode').select_option('blend')
    check('Blend exposes balance and selection explanations',page.locator('#blend-control').is_visible())
    page.locator('#results details').first.locator('summary').click()
    check('Blend exposes actual objective and gain', 'uncovered-strand gain' in page.locator('#results details').first.inner_text())
    slider=page.locator('#weight-ember'); slider.focus(); page.keyboard.press('ArrowRight')
    check('keyboard weight edit retains focus and updates value',slider.input_value()=='2' and page.evaluate('document.activeElement.id')=='weight-ember')
    page.locator('#platform').select_option('linux'); page.locator('#coop').check(); page.locator('#uncertainty > summary').click()
    check('Linux co-op filter excludes uncertain platform profiles',page.locator('#results > li').count()>0 and 'Echo Atlas' not in page.locator('#results').inner_text() and 'Echo Atlas: required filter evidence is unknown.' in page.locator('#partition-list').inner_text())
    expected=page.locator('#results > li').evaluate_all('(nodes)=>nodes.map(n=>n.dataset.gameId)')
    page.locator('#share').click(); page.wait_for_timeout(80)
    share=page.locator('#share-link').input_value()
    reopened=context.new_page(); reopened.evaluate('(hash) => { location.hash = hash; }', __import__('urllib.parse',fromlist=['urlsplit']).urlsplit(share).fragment); reopened.set_content((ROOT / '_site/index.html').read_text()); reopened.wait_for_function("document.querySelectorAll('#seeds > li').length === 2")
    check('shared URL restores weights filters mode and ranking',reopened.locator('#weight-ember').input_value()=='2' and reopened.locator('#mode').input_value()=='blend' and reopened.locator('#platform').input_value()=='linux' and reopened.locator('#coop').is_checked() and reopened.locator('#results > li').evaluate_all('(nodes)=>nodes.map(n=>n.dataset.gameId)')==expected)
    while page.locator('#results > li').count():
        page.locator('#results button').first.click()
    check('explicit exclusions produce empty results without fallback',page.locator('#empty').is_visible() and 'not been relaxed' in page.locator('#empty').inner_text())
    page.locator('#restore').click()
    check('restore hidden results is explicit and deterministic',page.locator('#results > li').evaluate_all('(nodes)=>nodes.map(n=>n.dataset.gameId)')==expected)
    while page.locator('#seeds > li').count(): page.locator('#seeds button').first.click()
    check('removing all seeds does not restore defaults',page.locator('#results > li').count()==0 and 'Add a profile' in page.locator('#empty').inner_text())
    page.locator('#search').fill('Orbit'); page.locator('#search').focus(); page.keyboard.press('Tab'); page.keyboard.press('Enter')
    check('search and add work with keyboard only',page.locator('#seeds > li').count()==1 and 'Orbit Cartographer' in page.locator('#seeds').inner_text())
    for query in ['Ember', 'Harvest', 'Tide', 'Grove']:
        page.locator('#search').fill(query)
        candidate = page.locator('#search-results button').first
        check(f'{query} remains available for the five-seed basket', candidate.count()==1 and candidate.is_enabled())
        candidate.click()
    page.locator('#search').fill('Forge')
    check('five-seed cap disables additions without creating duplicates',page.locator('#seeds > li').count()==5 and page.locator('#search-results button:enabled').count()==0 and 'Five games selected' in page.locator('#search-hint').inner_text())
    page.locator('#reset').click()
    for width in [360,390,800,1280]:
        page.set_viewport_size({'width':width,'height':1000})
        check(f'no horizontal overflow at {width}px',page.evaluate('document.documentElement.scrollWidth <= innerWidth'))
    check('reduced-motion preference active',page.evaluate('matchMedia("(prefers-reduced-motion: reduce)").matches'))
    page.set_viewport_size({'width':390,'height':844})
    page.evaluate('scrollTo(0,0)')
    page.screenshot(path=str(ARTIFACTS / 'preview-mobile.png'), full_page=True)
    page.set_viewport_size({'width':1280,'height':1000})
    page.evaluate('scrollTo(0,0)')
    page.screenshot(path=str(ARTIFACTS / 'preview-desktop.png'), full_page=True)
    context.set_offline(True); page.locator('#mode').select_option('arithmetic')
    check('ranking edits need no network after load',page.locator('#results > li').count()>0)
    context.set_offline(False)
    page.evaluate('(hash) => { location.hash = hash; }', '#basket='+__import__('urllib.parse',fromlist=['quote']).quote(json.dumps({'v':999}))); page.wait_for_function("!document.getElementById('error').hidden")
    check('unavailable version displays error and never silently substitutes a basket',page.locator('#error').is_visible() and page.locator('#seeds > li').count()==0 and page.locator('#results > li').count()==0)
    page.locator('#reset').click()
    check('explicit reset recovers from bad link',page.locator('#error').is_hidden() and page.locator('#seeds > li').count()==2)
    check('no JavaScript exceptions',not errors)
    browser.close()
report = {'passed': len(checks), 'checks': checks}
(ARTIFACTS / 'browser-results.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
