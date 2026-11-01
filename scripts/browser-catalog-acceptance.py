"""Real Chromium acceptance of a built synthetic snapshot; not live Pages evidence."""
import json
import os
from pathlib import Path
import subprocess
from urllib.parse import unquote, urlsplit
from playwright.sync_api import sync_playwright
from browser_test_html import offline_html

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / ".test-artifacts"
SITE = ARTIFACTS / "catalog-site"
ARTIFACTS.mkdir(exist_ok=True)
subprocess.run(["node", "scripts/build-demo.mjs", str(SITE), "--catalog",
                "examples/catalog.alternative.synthetic.json"], cwd=ROOT, check=True)
subprocess.run(["python3", "scripts/pages-preflight.py", str(SITE)], cwd=ROOT, check=True)
HTML = offline_html(SITE)
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
            errors, requests = [], []
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.on("request", lambda request: requests.append(request.url))
            page.set_content(HTML, wait_until="load")
            page.wait_for_function("document.getElementById('seeds').children.length === 2")
            check(label + ": alternate snapshot owns visible identity and sample", "synthetic-pilot-1" in page.locator("#versions").inner_text()
                  and "6 invented profiles" in page.locator(".intro").inner_text()
                  and "Aurora Survey" in page.locator("#seeds").inner_text()
                  and "Ember Circuit" not in page.locator("#seeds").inner_text())
            check(label + ": unknown description is explicit", "Description unavailable" in page.locator('[data-game-id="pilot:relay"]').inner_text())
            check(label + ": edition and DLC stay distinct candidates", "edition" in page.locator('[data-game-id="pilot:aurora-deluxe"]').inner_text()
                  and "dlc" in page.locator('[data-game-id="pilot:cove-dlc"]').inner_text())
            check(label + ": unchecked private fields and artwork never reach the artifact", "PRIVATE_" not in HTML and "not-publishable.png" not in HTML and page.locator("img").count() == 0)
            page.screenshot(path=str(ARTIFACTS / ("catalog-sample-" + label + ".png")), full_page=True)
            page.locator("#search").fill("NORTHERN DELUXE")
            add = page.get_by_role("button", name="Add Aurora Survey Deluxe")
            add.focus()
            add.press("Enter")
            check(label + ": alias search adds canonical edition with keyboard", page.locator("#seeds > li").count() == 3
                  and "Aurora Survey Deluxe" in page.locator("#seeds").inner_text())
            page.locator("#search").fill("Bay Add-on")
            page.get_by_role("button", name="Add Quiet Cove: Estuary").click()
            check(label + ": DLC selection does not collapse the base game", page.locator("#seeds > li").count() == 4)
            page.get_by_role("button", name="Remove Quiet Cove: Estuary").click()
            page.locator("#mode").select_option("blend")
            page.locator("#seeds input").first.focus()
            page.locator("#seeds input").first.press("ArrowRight")
            page.get_by_role("button", name="Hide Moss Relay").click()
            page.locator("#bridge-start").select_option("pilot:aurora")
            page.locator("#bridge-end").select_option("pilot:cove")
            page.locator("#bridge-threshold").select_option("0.31")
            check(label + ": Bridge consumes the selected catalog", page.locator("#bridge-steps li").count() > 0
                  and "Aurora Survey" in page.locator("#bridge-steps").inner_text()
                  and "Quiet Cove" in page.locator("#bridge-steps").inner_text())
            page.locator("#platform").select_option("steamdeck")
            check(label + ": declared additional platform is supported and remains strict", "unavailable" in page.locator("#bridge-status").inner_text().lower()
                  and page.locator("#bridge-steps li").count() == 0)
            page.locator("#platform").select_option("windows")
            page.locator("#coop").check()
            check(label + ": co-op does not silently pass an endpoint", "unavailable" in page.locator("#bridge-status").inner_text().lower())
            page.locator("#coop").uncheck()
            # Inspect rendered evidence through the same native disclosure a player opens.
            page.locator("#uncertainty-title").click()
            check(label + ": missing required metadata abstains", "Uncharted Hollow: required filter evidence is unknown." in page.locator("#partition-list").inner_text()
                  and page.locator('[data-game-id="pilot:unknown"]').count() == 0)
            page.locator("#share").click()
            link = page.locator("#share-link").input_value()
            saved_hash = "#" + urlsplit(link).fragment
            state = json.loads(unquote(saved_hash.split("#basket=", 1)[1]))
            check(label + ": share retains snapshot, canonical order, weights and exclusions", state["catalog"] == "synthetic-pilot-1"
                  and [seed["id"] for seed in state["seeds"]] == ["pilot:aurora", "pilot:cove", "pilot:aurora-deluxe"]
                  and state["seeds"][0]["weight"] == 2 and state["excluded"] == ["pilot:relay"]
                  and state["mode"] == "blend" and state["platform"] == "windows"
                  and state["bridge"]["startId"] == "pilot:aurora" and state["bridge"]["endId"] == "pilot:cove")
            route = page.locator("#bridge-steps").inner_text()
            restored = context.new_page()
            restored.on("pageerror", lambda error: errors.append(str(error)))
            restored.on("request", lambda request: requests.append(request.url))
            restored.set_content(HTML, wait_until="load")
            restored.evaluate("hash => { location.hash = hash; }", saved_hash)
            restored.wait_for_function("document.getElementById('bridge-start').value === 'pilot:aurora'")
            check(label + ": fresh-page restoration is reproducible", restored.locator("#bridge-steps").inner_text() == route
                  and restored.locator("#seeds > li").count() == 3 and restored.locator("#mode").input_value() == "blend")
            page.bring_to_front()
            page.locator("#intro-bridge").click()
            page.screenshot(path=str(ARTIFACTS / ("catalog-route-" + label + ".png")))
            incompatible = {**state, "catalog": "synthetic-demo-1"}
            page.evaluate("state => { location.hash = '#basket=' + encodeURIComponent(JSON.stringify(state)); }", incompatible)
            page.wait_for_function("!document.getElementById('error').hidden")
            check(label + ": unavailable snapshot fails visibly without substitution", "unavailable catalog" in page.locator("#error").inner_text()
                  and page.locator("#seeds > li").count() == 0 and page.locator("#bridge-steps li").count() == 0)
            stale = json.loads(json.dumps(state))
            stale["seeds"][0]["id"] = "pilot:missing"
            page.evaluate("state => { location.hash = '#basket=' + encodeURIComponent(JSON.stringify(state)); }", stale)
            page.wait_for_function("document.getElementById('error').textContent.includes('Unknown or duplicate')")
            check(label + ": stale canonical IDs are not replaced by aliases", page.locator("#seeds > li").count() == 0)
            page.locator("#intro-sample").click()
            check(label + ": explicit sample action recovers", page.locator("#error").is_hidden() and page.locator("#seeds > li").count() == 2)
            check(label + ": narrow reflow remains usable", page.evaluate("document.documentElement.scrollWidth <= innerWidth"))
            check(label + ": no runtime requests or JavaScript exceptions", not requests and not errors)
            context.close()
        browser.close()
finally:
    (ARTIFACTS / "catalog-acceptance.json").write_text(json.dumps({
        "revision": os.environ.get("GITHUB_SHA", "unpublished"),
        "snapshot": "synthetic-pilot-1",
        "scope": "offline built-document Chromium; not public Pages or real-catalog quality",
        "checks": results,
    }, indent=2) + "\n")
print(json.dumps({"passed": len(results), "failed": 0}))
