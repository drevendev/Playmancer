"""Exercise the built Bridge journey offline; this is not Pages/live evidence."""
import json
import os
from pathlib import Path
import subprocess
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / ".test-artifacts"
ARTIFACTS.mkdir(exist_ok=True)
subprocess.run(["node", "scripts/build-demo.mjs"], cwd=ROOT, check=True)
HTML = (ROOT / "_site/index.html").read_text()
results = []


def check(name, condition):
    results.append({"name": name, "passed": bool(condition)})
    if not condition:
        raise AssertionError(name)


try:
    with sync_playwright() as p:
        options = {"headless": True}
        if os.environ.get("PLAYWRIGHT_CHROMIUM_EXECUTABLE"):
            options["executable_path"] = os.environ["PLAYWRIGHT_CHROMIUM_EXECUTABLE"]
        browser = p.chromium.launch(**options)
        for label, width, height in [("desktop", 1280, 800), ("mobile", 390, 844)]:
            context = browser.new_context(viewport={"width": width, "height": height}, reduced_motion="reduce")
            page = context.new_page()
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.set_content(HTML, wait_until="load")
            button = page.locator("#intro-bridge")
            button.wait_for(state="visible")
            check(label + ": native first-screen Bridge action", button.evaluate("e => e.tagName === 'BUTTON' && e.type === 'button' && e.getBoundingClientRect().height >= 44"))
            page.screenshot(path=str(ARTIFACTS / ("bridge-discovery-" + label + ".png")))
            page.locator("#bridge-start").select_option("demo:ember")
            page.locator("#bridge-end").select_option("demo:harvest")
            page.locator("#bridge-threshold").select_option("0.05")
            check(label + ": route has supported steps", page.locator("#bridge-steps li").count() > 0)
            page.locator("#share").click()
            link = page.locator("#share-link").input_value()
            saved_hash = "#" + urlsplit(link).fragment
            check(label + ": saved basket includes a hash", saved_hash.startswith("#basket="))
            page.evaluate("hash => { location.hash = hash; }", saved_hash)
            page.wait_for_function("document.getElementById('bridge-start').value === 'demo:ember'")
            route_before = page.locator("#bridge-steps").inner_text()
            href_before = page.evaluate("location.href")
            button.focus()
            button.press("Enter")
            check(label + ": keyboard focus reaches Bridge", page.evaluate("document.activeElement.id") == "bridge-title")
            check(label + ": keyboard preserves exact share URL", page.evaluate("location.href") == href_before)
            check(label + ": keyboard preserves route and endpoints", page.locator("#bridge-steps").inner_text() == route_before and page.locator("#bridge-end").input_value() == "demo:harvest")
            check(label + ": title is in the viewport", page.locator("#bridge-title").evaluate("e => { const r=e.getBoundingClientRect(); return r.top >= 0 && r.top < innerHeight; }"))
            page.screenshot(path=str(ARTIFACTS / ("bridge-route-" + label + ".png")))
            button.click()
            check(label + ": pointer navigation preserves URL and focus", page.evaluate("location.href") == href_before and page.evaluate("document.activeElement.id") == "bridge-title")
            check(label + ": no horizontal overflow", page.evaluate("document.documentElement.scrollWidth <= innerWidth"))
            restored = context.new_page()
            restored.on("pageerror", lambda error: errors.append(str(error)))
            restored.set_content(HTML, wait_until="load")
            restored.evaluate("hash => { location.hash = hash; }", saved_hash)
            restored.wait_for_function("document.getElementById('bridge-start').value === 'demo:ember'")
            check(label + ": fresh-page route restoration", restored.locator("#bridge-steps").inner_text() == route_before and restored.locator("#bridge-end").input_value() == "demo:harvest")
            check(label + ": no JavaScript errors", not errors)
            context.close()
        browser.close()
finally:
    (ARTIFACTS / "bridge-acceptance.json").write_text(json.dumps({
        "revision": os.environ.get("GITHUB_SHA", os.environ.get("PLAYMANCER_REVISION", "unpublished")),
        "scope": "built-document offline Chromium; not hosted navigation or screen-reader certification",
        "checks": results,
    }, indent=2) + "\n")
print(json.dumps({"passed": len(results), "failed": 0}))
