"""Real Chromium acceptance for multistore and legacy Wikidata snapshots, not Pages."""
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
                "examples/catalog.multistore-24.real.json"], cwd=ROOT, check=True)
subprocess.run(["python3", "scripts/pages-preflight.py", str(SITE)], cwd=ROOT, check=True)
HTML = (SITE / "index.html").read_text()
SNAPSHOT = "multi-store-genre-pilot-2026-10-28"
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
                  and "24 real games" in observed["intro"]
                  and "wikidata + dreven games" in observed["badge"].lower()
                  and "Stardew Valley" in observed["seeds"]
                  and "Terraria" in observed["seeds"])
            # Native <details> content is correctly hidden until the player opens
            # the explanation. Expand it before assessing the visible evidence.
            page.locator("#results .explanation summary").first.click()
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
                  and "30% of the full model" in evidence["first_explanation"]
                  and float(evidence["first_score"]) > 0)
            # All other catalog entries have no exact P136 tag in common
            # with these two explicit favorites. Keep zero-ranked candidates
            # visible as exploratory, but never advertise them as matches.
            sparse = ctx.new_page()
            sparse.set_content(HTML, wait_until="load")
            sparse.locator("#clear").click()
            sparse.locator("#search").fill("Factorio")
            sparse.get_by_role("button", name="Add Factorio").click()
            sparse.locator("#search").fill("Into the Breach")
            sparse.get_by_role("button", name="Add Into the Breach").click()
            zero_scores = sparse.locator("#results .fit strong").all_inner_texts()
            check(label + ": zero-overlap real basket openly discloses unsupported suggestions",
                  len(zero_scores) > 0
                  and all(score == "0.000" for score in zero_scores)
                  and sparse.locator("#results .fit .fit-warning").count() == len(zero_scores)
                  and "zero demonstrated basket fit" in sparse.locator("#status").inner_text().lower())
            sparse.screenshot(path=str(ARTIFACTS / f"real-catalog-zero-overlap-{label}.png"), full_page=True)
            sparse.close()
            check(label + ": per-result source links and no artwork",
                  page.locator('#results a[href^="https://www.wikidata.org/wiki/Q"]').count() > 0
                  and page.locator("img").count() == 0)
            check(label + ": real results link to Steam without making external requests",
                  page.locator('#results a[href^="https://store.steampowered.com/app/"]').count() > 0
                  and not requests)
            owner_page = ctx.new_page()
            owner_requests, owner_errors = [], []
            owner_page.on("request", lambda request: owner_requests.append(request.url))
            owner_page.on("pageerror", lambda error: owner_errors.append(str(error)))
            owner_page.set_content(HTML, wait_until="load")
            owner_page.locator("#dreven-browse").click()
            check(label + ": all five Dreven Games titles are discoverable without ranking promotion",
                  owner_page.locator("#search-results button").count() == 5
                  and all(name in owner_page.locator("#search-results").inner_text()
                          for name in ("Idle Fantasy Shop", "Shadow Runner", "Hunter Adventure", "DevMatch", "Circlanoid")))
            owner_page.locator("#clear").click()
            owner_page.locator("#search").fill("Shadow Runner")
            owner_page.get_by_role("button", name="Add Shadow Runner").click()
            check(label + ": owner Shadow Runner links to itch.io and Google Play",
                  owner_page.locator('#seeds a[href="https://drevengames.itch.io/shadow-runner"]').count() == 1
                  and owner_page.locator('#seeds a[href="https://play.google.com/store/apps/details?id=com.TrilobytesStudio.ShadowRunner"]').count() == 1
                  and owner_page.locator('#seeds a[href^="https://drevengames.itch.io/"]').first.get_attribute("rel") == "noopener noreferrer")
            owner_page.locator("#search").fill("Circlanoid")
            owner_page.get_by_role("button", name="Add Circlanoid").click()
            owner_page.locator("#platform").select_option("android")
            owner_page.locator("#share").click()
            owner_state = json.loads(unquote(owner_page.locator("#share-link").input_value().split("#basket=", 1)[1]))
            check(label + ": Android game and two owner IDs restore with catalog version",
                  "Circlanoid" in owner_page.locator("#seeds").inner_text()
                  and owner_state["catalog"] == SNAPSHOT and owner_state["platform"] == "android"
                  and [x["id"] for x in owner_state["seeds"]] == ["dreven:shadow-runner", "dreven:circlanoid"]
                  and "promotion" not in owner_state)
            owner_page.screenshot(path=str(ARTIFACTS / f"real-storefronts-{label}.png"), full_page=True)
            owner_page.locator("#clear").click()
            owner_page.locator("#search").fill("DevMatch")
            owner_page.get_by_role("button", name="Add DevMatch").click()
            check(label + ": missing DevMatch genre abstains rather than becoming a false match",
                  owner_page.locator("#seeds > li").count() == 1
                  and owner_page.locator("#results > li").count() == 0
                  and owner_page.locator("#empty").is_visible()
                  and not owner_requests and not owner_errors)
            owner_page.close()
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
        # Historical Wikidata-only snapshots must not advertise creator games or a
        # browse action that cannot find any games in the selected catalog.
        legacy_site = ARTIFACTS / "wikidata-only-site"
        subprocess.run(["node", "scripts/build-demo.mjs", str(legacy_site), "--catalog",
                        "examples/catalog.wikidata.real.json"], cwd=ROOT, check=True)
        subprocess.run(["python3", "scripts/pages-preflight.py", str(legacy_site)], cwd=ROOT, check=True)
        legacy_ctx = browser.new_context(viewport={"width": 390, "height": 844}, reduced_motion="reduce")
        legacy_page = legacy_ctx.new_page()
        legacy_errors = []
        legacy_page.on("pageerror", lambda err: legacy_errors.append(str(err)))
        legacy_page.set_content((legacy_site / "index.html").read_text(), wait_until="load")
        legacy_page.wait_for_function("document.querySelectorAll('#seeds > li').length === 2")
        check("legacy Wikidata-only pilot reports the selected 12-game provenance",
              "12 real games" in legacy_page.locator(".intro").inner_text()
              and "wikidata cc0 genre pilot" in legacy_page.locator(".badge").inner_text().lower()
              and "dreven games" not in legacy_page.locator(".footer-note").inner_text().lower()
              and not legacy_errors)
        check("legacy Wikidata-only pilot does not expose nonfunctional creator browse or store links",
              legacy_page.locator("#dreven-browse").is_hidden()
              and legacy_page.locator("#results .storefront-links a").count() == 0
              and legacy_page.locator("#seeds .storefront-links a").count() == 0)
        legacy_page.screenshot(path=str(ARTIFACTS / "wikidata-only-mobile.png"), full_page=True)
        legacy_ctx.close()
        browser.close()
finally:
    (ARTIFACTS / "real-catalog-acceptance.json").write_text(json.dumps({
        "revision": os.environ.get("GITHUB_SHA", "unpublished"),
        "snapshot": SNAPSHOT,
        "scope": "multistore and legacy real HTML / Chromium; NOT Pages or measured usefulness",
        "checks": results,
    }, indent=2) + "\n")
print(json.dumps({"passed": len(results), "failed": 0}))
