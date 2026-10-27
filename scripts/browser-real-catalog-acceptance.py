"""Real Chromium acceptance for an opt-in CC0 Wikidata pilot, never a Pages claim."""
from pathlib import Path
import json
import os
import subprocess
from urllib.parse import unquote, urlsplit
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / ".test-artifacts"
SITE = ARTIFACTS / "real-catalog-site"
ARTIFACTS.mkdir(exist_ok=True)
subprocess.run(["node", "scripts/build-demo.mjs", str(SITE), "--catalog",
                "examples/catalog.wikidata.real.json"], cwd=ROOT, check=True)
subprocess.run(["python3", "scripts/pages-preflight.py", str(SITE)], cwd=ROOT, check=True)
HTML = (SITE / "index.html").read_text()
SNAPSHOT = "wikidata-genre-pilot-2026-10-27"
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
        for label, width, height in (("desktop", 1280, 800), ("mobile", 390, 844)):
            ctx = browser.new_context(viewport={"width": width, "height": height}, reduced_motion="reduce")
            page = ctx.new_page()
            errors, requests = [], []
            page.on("pageerror", lambda err: errors.append(str(err)))
            page.on("request", lambda request: requests.append(request.url))
            page.set_content(HTML, wait_until="load")
            page.wait_for_function("document.querySelectorAll('#seeds > li').length === 2")
            observed = {
                "version": page.locator("#versions").inner_text(),
                "intro": page.locator(".intro").inner_text(),
                "badge": page.locator(".badge").inner_text(),
                "seeds": page.locator("#seeds").inner_text(),
            }
            print("REAL_PILOT_INITIAL_STATE " + json.dumps(observed), flush=True)
            check(label + ": real catalog provenance, two real basket games",
                  SNAPSHOT in observed["version"]
                  and "12 real games" in observed["intro"]
                  and "wikidata cc0" in observed["badge"].lower()
                  and "Stardew Valley" in observed["seeds"]
                  and "Terraria" in observed["seeds"])
            evidence = {
                "ranked_ids": page.locator("#results > li").evaluate_all(
                    "cards => cards.map(card => card.dataset.gameId)"),
                "mortal_shell_visible": page.locator('[data-game-id="wikidata:q96991833"]').count(),
                "footer_note": page.locator(".footer-note").inner_text(),
                "first_explanation": page.locator("#results .explanation").first.inner_text()
                if page.locator("#results .explanation").count() else "",
                "first_score": page.locator("#results .fit strong").first.inner_text()
                if page.locator("#results .fit strong").count() else "",
            }
            print("REAL_PILOT_RANKING " + json.dumps(evidence), flush=True)
            check(label + ": genre-only nonzero ranking with truthful coverage",
                  len(evidence["ranked_ids"]) > 0
                  and evidence["mortal_shell_visible"] > 0
                  and "30%" in evidence["footer_note"]
                  and "30% of the full model" in evidence["first_explanation"])
            check(label + ": per-result source links and no artwork",
                  page.locator('#results a[href^="https://www.wikidata.org/wiki/Q"]').count() > 0
                  and page.locator("img").count() == 0)
            page.screenshot(path=str(ARTIFACTS / f"real-catalog-{label}.png"), full_page=True)
            page.locator("#search").fill("Hades")
            page.get_by_role("button", name="Add Hades").click()
            check(label + ": player can add a third actual game",
                  page.locator("#seeds > li").count() == 3 and "Hades" in page.locator("#seeds").inner_text())
            page.locator("#mode").select_option("blend")
            page.locator("#bridge-start").select_option("wikidata:q23013817")
            page.locator("#bridge-end").select_option("wikidata:q332697")
            page.locator("#bridge-threshold").select_option("0.05")
            check(label + ": Bridge routes are supported by P136 overlap",
                  page.locator("#bridge-steps li").count() > 0
                  and "Stardew Valley" in page.locator("#bridge-steps").inner_text()
                  and "Terraria" in page.locator("#bridge-steps").inner_text())
            page.locator("#platform").select_option("windows")
            check(label + ": unknown source platform does not satisfy required filter",
                  page.locator('[data-game-id="wikidata:q24300"]').count() == 0)
            page.locator("#coop").check()
            check(label + ": missing co-op does not pass hard requirements",
                  page.locator("#results > li").count() == 0)
            page.locator("#coop").uncheck()
            page.locator("#share").click()
            link = page.locator("#share-link").input_value()
            saved_hash = "#" + urlsplit(link).fragment
            state = json.loads(unquote(saved_hash.split("#basket=", 1)[1]))
            check(label + ": share keeps exact real snapshot, ordered basket and filters",
                  state["catalog"] == SNAPSHOT and state["mode"] == "blend"
                  and [item["id"] for item in state["seeds"]] ==
                  ["wikidata:q23013817", "wikidata:q332697", "wikidata:q59756366"]
                  and state["platform"] == "windows")
            restored = ctx.new_page()
            restored.on("pageerror", lambda err: errors.append(str(err)))
            restored.on("request", lambda request: requests.append(request.url))
            restored.set_content(HTML, wait_until="load")
            restored.evaluate("hash => { location.hash = hash; }", saved_hash)
            restored.wait_for_function("document.querySelectorAll('#seeds > li').length === 3")
            check(label + ": fresh-page replays real snapshot and Bridge settings",
                  restored.locator("#mode").input_value() == "blend"
                  and restored.locator("#platform").input_value() == "windows"
                  and restored.locator("#bridge-end").input_value() == "wikidata:q332697")
            incompatible = {**state, "catalog": "synthetic-demo-1"}
            restored.evaluate("value => { location.hash = '#basket=' + encodeURIComponent(JSON.stringify(value)); }", incompatible)
            restored.wait_for_function("!document.getElementById('error').hidden")
            check(label + ": incompatible synthetic link is rejected",
                  "unavailable catalog" in restored.locator("#error").inner_text()
                  and restored.locator("#seeds > li").count() == 0)
            check(label + ": page reflows without overflow or remote requests/errors",
                  page.evaluate("document.documentElement.scrollWidth <= innerWidth")
                  and not requests and not errors)
            ctx.close()
        browser.close()
finally:
    (ARTIFACTS / "real-catalog-acceptance.json").write_text(json.dumps({
        "revision": os.environ.get("GITHUB_SHA", "unpublished"),
        "snapshot": SNAPSHOT,
        "scope": "opt-in offline built HTML / Chromium; NOT Pages or measured usefulness",
        "checks": results,
    }, indent=2) + "\n")
print(json.dumps({"passed": len(results), "failed": 0}))
