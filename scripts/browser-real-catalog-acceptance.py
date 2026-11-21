"""Real Chromium acceptance for multistore and legacy Wikidata snapshots, not Pages."""
from pathlib import Path
import json
import os
import re
import subprocess
from urllib.parse import unquote, urlsplit
from playwright.sync_api import sync_playwright
from browser_test_html import offline_html

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / ".test-artifacts"
SITE = ARTIFACTS / "real-catalog-site"
ARTIFACTS.mkdir(exist_ok=True)
subprocess.run(["node", "scripts/build-demo.mjs", str(SITE), "--catalog",
                "examples/catalog.multistore-30.real.json"], cwd=ROOT, check=True)
subprocess.run(["python3", "scripts/pages-preflight.py", str(SITE)], cwd=ROOT, check=True)
HTML = offline_html(SITE)
# Gameplay Facts are embedded only in the production release; the lightweight
# optional-catalog preview above deliberately has no observation inventory.
FACTS_SITE = ARTIFACTS / "real-catalog-facts-release"
subprocess.run(["node", "scripts/build-release.mjs", str(FACTS_SITE)], cwd=ROOT, check=True)
FACTS_HTML = offline_html(FACTS_SITE)
SNAPSHOT = "multi-store-genre-pilot-30-2026-10-28"
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
                  and "30 real games" in observed["intro"]
                  and all(store in observed["badge"].casefold() for store in ("steam", "google play", "itch.io"))
                  and "wikidata" not in observed["badge"].casefold()
                  and "dreven games" not in observed["badge"].casefold()
                  and "Stardew Valley" in observed["seeds"]
                  and "Terraria" in observed["seeds"])
            # Player can inspect a recorded store before adding a discovery
            # result, with no network request, favorite mutation or ranking change.
            browse_hash = page.evaluate("location.hash")
            page.locator("#intro-browse").click()
            first_browse = page.locator("#search-results > li").first
            first_link = first_browse.locator(".storefront-links a")
            check(label + ": first browsed game has its recorded, touch-sized Steam link",
                  first_browse.get_by_role("button", name="Add Mortal Shell").count() == 1
                  and first_link.count() == 1
                  and first_link.inner_text() == "Steam"
                  and first_link.get_attribute("href") == "https://store.steampowered.com/app/1110910"
                  and first_link.get_attribute("target") == "_blank"
                  and "noopener" in (first_link.get_attribute("rel") or "")
                  and "noreferrer" in (first_link.get_attribute("rel") or "")
                  and first_link.evaluate("el => el.getBoundingClientRect().height >= 44"))
            page.locator("#search").fill("DevMatch")
            owner_link = page.locator("#search-results > li .storefront-links a")
            check(label + ": searched owner game exposes only its recorded itch.io store",
                  page.get_by_role("button", name="Add DevMatch").count() == 1
                  and owner_link.count() == 1
                  and owner_link.inner_text() == "itch.io"
                  and owner_link.get_attribute("href") == "https://drevengames.itch.io/devmatch"
                  and page.evaluate("location.hash") == browse_hash
                  and page.locator("#seeds > li").count() == 2
                  and not requests)
            page.locator("#search").fill("")
            # Let players inspect original per-favorite evidence before assigning
            # more weight; browsing to source receipts is not a ranking feature.
            check(label + ": selected real favorites have on-demand source disclosures",
                  page.locator("#seeds .basket-evidence").count() == 2
                  and not page.locator("#seeds .basket-evidence").first.evaluate("node => node.open"))
            page.locator("#seeds .basket-evidence summary").first.click()
            check(label + ": inspected favorite distinguishes genres, unknowns and exact QID",
                  "farming simulation game" in page.locator("#seeds .basket-evidence").first.inner_text()
                  and "Catalog mechanics: unknown. Co-op: unknown." in page.locator("#seeds .basket-evidence").first.inner_text()
                  and "not an exhaustive support list" in page.locator("#seeds .basket-evidence").first.inner_text()
                  and page.locator('#seeds .basket-evidence a[href="https://www.wikidata.org/wiki/Q23013817"]').count() == 1)
            # A real favorite without source-backed genre labels must not
            # look equivalent to a richly tagged seed: disclose the gap before
            # selection, keep the warning while weights change, then clear it.
            check(label + ": sourced sample favorites have no missing-genre warning",
                  page.locator("#seeds .seed-evidence-warning").count() == 0)
            gap = ctx.new_page()
            gap.set_content(HTML, wait_until="load")
            gap.locator("#clear").click()
            gap.locator("#search").fill("DevMatch")
            missing_hint = gap.locator("#search-results .seed-evidence-warning")
            add_devmatch = gap.get_by_role("button", name="Add DevMatch")
            check(label + ": missing genre evidence is visible before selection and described to AT",
                  missing_hint.count() == 1
                  and "No recorded genres" in missing_hint.inner_text()
                  and add_devmatch.get_attribute("aria-describedby") == missing_hint.get_attribute("id"))
            add_devmatch.click()
            gap.locator("#search").fill("Stardew")
            gap.get_by_role("button", name="Add Stardew Valley").click()
            check(label + ": only the genre-sparse selected favorite is flagged",
                  gap.locator("#seeds > li").count() == 2
                  and gap.locator("#seeds .seed-evidence-warning").count() == 1
                  and "Its weight cannot create source-backed genre similarity"
                      in gap.locator("#seeds .seed-evidence-warning").inner_text())
            check(label + ": sparse owner-game explanation does not claim missing Wikidata data",
                  gap.locator("#empty").is_visible()
                  and "DevMatch has no recorded genre evidence for this pilot"
                      in gap.locator("#empty").inner_text()
                  and "DevMatch has no Wikidata" not in gap.locator("#empty").inner_text())
            check(label + ": no-ranked state explains abstention rather than falsely claiming no eligible games",
                  "No rankable recommendations for this basket" in gap.locator("#empty").inner_text()
                  and "Missing comparable feature evidence means unknown similarity" in gap.locator("#empty").inner_text()
                  and "No eligible results" not in gap.locator("#empty").inner_text()
                  and "0 of 0 ranked shown" in gap.locator("#status").inner_text()
                  and gap.get_by_role("button", name="Remove DevMatch from basket").count() == 1)
            gap.locator("#seeds .basket-evidence summary").first.click()
            built_revision = gap.locator('meta[name="playmancer-revision"]').get_attribute("content")
            expected_ref = built_revision if built_revision and re.fullmatch(r"[0-9a-f]{40}", built_revision) else "master"
            publisher_receipt = f"https://github.com/drevendev/Playmancer/blob/{expected_ref}/docs/STOREFRONTS.md"
            check(label + ": sparse owner game explicitly exposes unknown evidence and publisher receipts",
                  "Recorded genres (publisher-authored tags): unknown." in gap.locator("#seeds .basket-evidence").first.inner_text()
                  and "Catalog mechanics: unknown. Co-op: unknown." in gap.locator("#seeds .basket-evidence").first.inner_text()
                  and gap.locator("#seeds .basket-evidence a").first.get_attribute("href") == publisher_receipt)
            gap.locator("#seeds input[type=range]").first.evaluate(
                "(slider) => { slider.value = '9'; slider.dispatchEvent(new Event('input', {bubbles: true})); }")
            gap.locator("#share").click()
            shared = json.loads(unquote(gap.locator("#share-link").input_value().split("#basket=", 1)[1]))
            check(label + ": missing-genre warning survives weight edits and shares exact favorites",
                  gap.locator("#seeds .seed-evidence-warning").count() == 1
                  and shared["catalog"] == SNAPSHOT
                  and shared["seeds"] == [
                      {"id": "dreven:devmatch", "weight": 9},
                      {"id": "wikidata:q23013817", "weight": 1}])
            gap.screenshot(path=str(ARTIFACTS / f"real-catalog-seed-evidence-gap-{label}.png"),
                           full_page=True)
            gap.get_by_role("button", name="Remove DevMatch", exact=True).click()
            check(label + ": removing the sparse favorite clears its warning",
                  gap.locator("#seeds > li").count() == 1
                  and gap.locator("#seeds .seed-evidence-warning").count() == 0
                  and gap.locator("#results .card").count() > 0)
            gap.close()
            # Enter on search should help with one clear match without silently
            # choosing the first game from an ambiguous set. IME confirmation
            # must remain text input, and focus remains predictable on mobile.
            key_search = ctx.new_page()
            key_errors = []
            key_search.on("pageerror", lambda err: key_errors.append(str(err)))
            key_search.set_content(HTML, wait_until="load")
            key_search.locator("#clear").click()
            key_search.locator("#search").fill("DevMatch")
            check(label + ": unique search exposes exactly one enabled add action",
                  key_search.locator("#search-results li > button:not(:disabled)").count() == 1)
            key_search.locator("#search").press("Enter")
            check(label + ": Enter adds sole match with focus and basket share preserved",
                  key_search.locator("#seeds > li").count() == 1
                  and "DevMatch" in key_search.locator("#seeds").inner_text()
                  and key_search.locator("#search").input_value() == ""
                  and key_search.locator("#search").evaluate(
                      "node => document.activeElement === node")
                  and "dreven%3Adevmatch" in key_search.evaluate("location.hash"))
            selected_hash = key_search.evaluate("location.hash")
            key_search.locator("#search").fill("DevMatch")
            check(label + ": selected title search explains why no second Add action is offered",
                  key_search.locator("#search-results > li").count() == 0
                  and "Already in basket: DevMatch" in key_search.locator("#search-hint").inner_text()
                  and key_search.locator("#seeds > li").count() == 1
                  and key_search.evaluate("location.hash") == selected_hash)
            key_search.locator("#search").fill("dreven:devmatch")
            check(label + ": selected canonical ID search also reports basket membership",
                  key_search.locator("#search-results > li").count() == 0
                  and "Already in basket: DevMatch" in key_search.locator("#search-hint").inner_text()
                  and key_search.evaluate("location.hash") == selected_hash)
            key_search.locator("#search").fill("unlisted favorite")
            check(label + ": unmatched title is not mislabeled as already selected",
                  "Already in basket:" not in key_search.locator("#search-hint").inner_text()
                  and "No profiles match" in key_search.locator("#search-hint").inner_text()
                  and key_search.evaluate("location.hash") == selected_hash)
            key_search.locator("#search").fill("a")
            choice_buttons = key_search.locator("#search-results li > button:not(:disabled)")
            check(label + ": broad search has multiple independently selectable results",
                  choice_buttons.count() > 1)
            key_search.locator("#search").evaluate(
                "node => node.dispatchEvent(new KeyboardEvent('keydown', "
                "{key:'Enter', isComposing:true, bubbles:true, cancelable:true}))")
            check(label + ": IME Enter does not select or move search focus",
                  key_search.locator("#seeds > li").count() == 1
                  and key_search.locator("#search").evaluate(
                      "node => document.activeElement === node"))
            # A composing Escape belongs to the IME; do not dismiss text.
            key_search.locator("#search").evaluate(
                "node => node.dispatchEvent(new KeyboardEvent('keydown', "
                "{key:'Escape', isComposing:true, bubbles:true, cancelable:true}))")
            check(label + ": composing Escape preserves the query and catalog choices",
                  key_search.locator("#search").input_value() == "a"
                  and choice_buttons.count() > 1)
            first_choice = choice_buttons.first
            first_label = first_choice.get_attribute("aria-label")
            key_search.locator("#search").press("Enter")
            check(label + ": ambiguous Enter focuses first choice without adding a game",
                  key_search.locator("#seeds > li").count() == 1
                  and first_choice.evaluate("node => document.activeElement === node"))
            first_choice.press("Escape")
            check(label + ": choice Escape returns focus without deleting the query",
                  key_search.locator("#search").input_value() == "a"
                  and key_search.locator("#search").evaluate(
                      "node => document.activeElement === node")
                  and key_search.locator("#seeds > li").count() == 1)
            before_dismiss_hash = key_search.evaluate("location.hash")
            key_search.locator("#search").press("Escape")
            check(label + ": second Escape clears ambiguous matches but preserves shared basket",
                  key_search.locator("#search").input_value() == ""
                  and key_search.locator("#search-results li").count() == 0
                  and key_search.locator("#catalog-browse").get_attribute("aria-expanded") == "false"
                  and key_search.evaluate("location.hash") == before_dismiss_hash
                  and key_search.locator("#seeds > li").count() == 1)
            # Dismissing a search must not change the next explicit choice.
            key_search.locator("#search").fill("a")
            key_search.locator("#search").press("Enter")
            first_choice.press("Enter")
            check(label + ": explicit focused Enter still adds chosen game without script errors",
                  key_search.locator("#seeds > li").count() == 2
                  and first_label.removeprefix("Add ") in key_search.locator("#seeds").inner_text()
                  and key_search.locator("#search").evaluate(
                      "node => document.activeElement === node")
                  and not key_errors)
            key_search.locator("#catalog-browse").click()
            check(label + ": Browse games shows remaining catalog games",
                  key_search.locator("#search-results li > button:not(:disabled)").count() > 0
                  and key_search.locator("#catalog-browse").get_attribute("aria-expanded") == "true")
            before_browse_dismiss = key_search.evaluate("location.hash")
            key_search.locator("#search").focus()
            key_search.locator("#search").press("Escape")
            check(label + ": Escape closes Browse while preserving basket, store and share",
                  key_search.locator("#search-results li").count() == 0
                  and key_search.locator("#catalog-browse").get_attribute("aria-expanded") == "false"
                  and key_search.locator("#store-filter").input_value() == "all"
                  and key_search.evaluate("location.hash") == before_browse_dismiss
                  and key_search.locator("#seeds > li").count() == 2
                  and not key_errors)
            key_search.screenshot(path=str(ARTIFACTS / f"real-catalog-search-escape-{label}.png"),
                                  full_page=True)
            key_search.close()
            # Mobile section navigation must not change the state-bearing URL fragment.
            nav = page.get_by_role("navigation", name="Page sections")
            check(label + ": section shortcuts are shown only on narrow screens",
                  nav.is_visible() == (label == "mobile"))
            if label == "mobile":
                initial_hash = page.evaluate("location.hash")
                check(label + ": shortcuts stay sticky", nav.evaluate(
                    "element => getComputedStyle(element).position === 'sticky'"))
                for button, destination in (("jump-bridge", "bridge-title"),
                                            ("jump-results", "recommendations"),
                                            ("jump-basket", "basket-title")):
                    page.locator("#" + button).click()
                    check(label + ": " + button + " focuses its section without rewriting the share URL",
                          page.locator("#" + destination).evaluate(
                              "element => document.activeElement === element")
                          and page.evaluate("location.hash") == initial_hash)
            # Storefront discovery is an editorial catalog view, not ranking or
            # a platform requirement. Exercise both viewports with real link data.
            initial_ranks = page.locator("#results > li").evaluate_all(
                "cards => cards.map(card => card.dataset.gameId)")
            # A hidden result needs a reversible per-game action. Undoing one
            # exclusion must not reset any other exclusion or required filter.
            hidden_pair = page.locator("#results > li").evaluate_all(
                "cards => cards.slice(0, 2).map(card => ({id: card.dataset.gameId, name: card.querySelector('h3').textContent}))")
            check(label + ": individual undo has at least two real recommendations",
                  len(hidden_pair) == 2)
            for item in hidden_pair:
                page.locator(f'#results > li[data-game-id="{item["id"]}"] button[aria-label^="Hide "]').click()
            page.locator("#uncertainty-title").click()
            check(label + ": both hidden games offer separate restore actions",
                  all(page.get_by_role("button", name=f'Restore {item["name"]}').is_visible()
                      for item in hidden_pair))
            page.get_by_role("button", name=f'Restore {hidden_pair[1]["name"]}').click()
            one_restored = page.locator("#results > li").evaluate_all(
                "cards => cards.map(card => card.dataset.gameId)")
            check(label + ": single undo restores only the selected game and preserves focus",
                  hidden_pair[1]["id"] in one_restored
                  and hidden_pair[0]["id"] not in one_restored
                  and page.get_by_role("button", name=f'Restore {hidden_pair[0]["name"]}').count() == 1
                  and page.get_by_role("button", name=f'Restore {hidden_pair[1]["name"]}').count() == 0
                  and page.locator("#uncertainty-title").evaluate(
                      "element => document.activeElement === element")
                  and "Required filters are unchanged" in page.locator("#status").inner_text())
            page.locator("#share").click()
            one_restored_state = json.loads(unquote(page.locator("#share-link").input_value().split("#basket=", 1)[1]))
            check(label + ": sharing retains only the still-hidden game",
                  one_restored_state["excluded"] == [hidden_pair[0]["id"]]
                  and one_restored_state["catalog"] == SNAPSHOT)
            page.screenshot(path=str(ARTIFACTS / f"real-catalog-single-restore-{label}.png"), full_page=True)
            page.locator("#restore").click()
            page.locator("#uncertainty-title").click()
            check(label + ": bulk restore still returns the identical ordering",
                  page.locator("#results > li").evaluate_all(
                      "cards => cards.map(card => card.dataset.gameId)") == initial_ranks
                  and page.locator("#restore").is_hidden())
            # Partial, source-backed gameplay facts assist game discovery but
            # never act as negative evidence or change the recommendation mode.
            fact_lookup = ctx.new_page()
            fact_lookup.set_content(FACTS_HTML, wait_until="load")
            browse_facts_hash = fact_lookup.evaluate("location.hash")
            fact_lookup.locator("#intro-browse").click()
            first_fact_row = fact_lookup.locator("#search-results > li").first
            inspect_before_add = first_fact_row.get_by_role(
                "link", name="Inspect Mortal Shell gameplay evidence (new tab)")
            inspect_state = json.loads(unquote(urlsplit(inspect_before_add.get_attribute("href")).fragment.split("facts=", 1)[1]))
            facts_entry = fact_lookup.locator("#observation-explorer-entry")
            check(label + ": browsed real game discloses partial selected-fact coverage before adding",
                  first_fact_row.get_by_role("button", name="Add Mortal Shell").count() == 1
                  and "selected gameplay facts (partial evidence" in first_fact_row.inner_text()
                  and inspect_before_add.get_attribute("target") == "_blank"
                  and "noopener" in (inspect_before_add.get_attribute("rel") or "")
                  and "noreferrer" in (inspect_before_add.get_attribute("rel") or "")
                  and inspect_state["query"] == "wikidata:q96991833"
                  and inspect_state["pair"] == [] and inspect_state["tag"] == ""
                  and inspect_state["catalog"] == facts_entry.get_attribute("data-observation-catalog")
                  and inspect_state["version"] == facts_entry.get_attribute("data-observation-version")
                  and inspect_state["evidence"] == facts_entry.get_attribute("data-observation-evidence")
                  and fact_lookup.evaluate("location.hash") == browse_facts_hash)
            fact_lookup.locator("#search").fill("DevMatch")
            unreviewed_row = fact_lookup.locator("#search-results > li").first
            check(label + ": unreviewed owner game stays unknown and can open a pinned lookup",
                  unreviewed_row.get_by_role("button", name="Add DevMatch").count() == 1
                  and "No reviewed gameplay facts yet (unknown, not absent)" in unreviewed_row.inner_text()
                  and unreviewed_row.get_by_role(
                      "link", name="Inspect DevMatch gameplay evidence (new tab)").count() == 1
                  and fact_lookup.evaluate("location.hash") == browse_facts_hash)
            fact_lookup.locator("#clear").click()
            fact_lookup.locator("#search").fill("Automating production")
            fact_result = fact_lookup.locator("#search-results li")
            fact_button = fact_lookup.get_by_role("button", name="Add Factorio")
            check(label + ": main catalog searches reviewed non-genre facts with accessible provenance",
                  fact_result.count() == 1
                  and fact_button.count() == 1
                  and "Recorded gameplay fact (partial evidence): Automating production" in fact_result.inner_text()
                  and fact_button.get_attribute("aria-describedby") ==
                      fact_result.locator(".hint").get_attribute("id"))
            # Favorite disclosures distinguish absent catalog mechanics from
            # separately reviewed positive facts, and deep-link to that exact
            # observation revision without changing player ranking or filters.
            fact_button.click()
            fact_lookup.locator("#seeds .basket-evidence summary").first.click()
            favorite_evidence = fact_lookup.locator("#seeds .basket-evidence").first
            source_jump = favorite_evidence.get_by_role("link", name="Inspect gameplay fact sources for Factorio (new tab)")
            jump_url = source_jump.get_attribute("href")
            jump_state = json.loads(unquote(urlsplit(jump_url).fragment.split("facts=", 1)[1]))
            entry = fact_lookup.locator("#observation-explorer-entry")
            check(label + ": favorite exposes separate partial facts and exact-version source search",
                  "Catalog mechanics: unknown" in favorite_evidence.inner_text()
                  and "Separately reviewed gameplay facts (4 selected, partial)" in favorite_evidence.inner_text()
                  and "Automating production" in favorite_evidence.inner_text()
                  and "not used for ranking" in favorite_evidence.inner_text()
                  and jump_state["query"] == "Factorio" and jump_state["pair"] == []
                  and jump_state["tag"] == ""
                  and jump_state["catalog"] == entry.get_attribute("data-observation-catalog")
                  and jump_state["version"] == entry.get_attribute("data-observation-version")
                  and jump_state["evidence"] == entry.get_attribute("data-observation-evidence")
                  and source_jump.get_attribute("target") == "_blank"
                  and source_jump.get_attribute("rel") == "noopener noreferrer"
                  and source_jump.get_attribute("class") == "basket-fact-link"
                  and source_jump.evaluate("node => node.getBoundingClientRect().height >= 44"))
            fact_lookup.locator("#search").fill("unrecorded fictitious mechanic")
            check(label + ": missing gameplay observation is unknown, never evidence of absence",
                  fact_lookup.locator("#search-results li").count() == 0
                  and "unrecorded facts remain unknown" in fact_lookup.locator("#search-hint").inner_text())
            fact_lookup.locator("#search").fill("DevMatch")
            check(label + ": unreviewed game remains findable by its name",
                  fact_lookup.get_by_role("button", name="Add DevMatch").count() == 1)
            fact_lookup.get_by_role("button", name="Add DevMatch").click()
            devmatch_evidence = fact_lookup.locator("#seeds .basket-evidence").last
            devmatch_evidence.locator("summary").click()
            check(label + ": unreviewed favorite does not invent absent mechanics",
                  "No separately reviewed gameplay facts for this game" in devmatch_evidence.inner_text()
                  and "Unrecorded features remain unknown" in devmatch_evidence.inner_text()
                  and devmatch_evidence.get_by_role("link", name="Inspect gameplay fact sources for DevMatch (new tab)").count() == 1)
            # Source-backed evidence inspection is available even when a strict
            # required platform is unknown, without ever relaxing eligibility.
            fact_lookup.locator("#platform").select_option("android")
            uncertain_hash = fact_lookup.evaluate("location.hash")
            # Playwright role locators intentionally exclude links inside closed
            # <details>. Open the disclosure as a player would before inspecting it.
            fact_lookup.locator("#uncertainty-title").click()
            check(label + ": uncertainty disclosure opens without rewriting the basket",
                  fact_lookup.locator("#uncertainty").evaluate("node => node.open")
                  and fact_lookup.evaluate("location.hash") == uncertain_hash)
            uncertain_hades = fact_lookup.locator("#partition-list > li").filter(has_text="Uncertain · Hades:")
            inspect = uncertain_hades.get_by_role("link", name="Inspect available gameplay evidence for Hades (new tab)")
            evidence_href = inspect.get_attribute("href") if inspect.count() == 1 else ""
            evidence_state = (json.loads(unquote(evidence_href.split("#facts=", 1)[1]))
                              if "#facts=" in evidence_href else {})
            check(label + ": uncertain game links to exact-version gameplay evidence without passing platform filters",
                  uncertain_hades.count() == 1
                  and inspect.count() == 1
                  and "partial or unknown; not compatibility proof" in uncertain_hades.inner_text()
                  and evidence_href.startswith("./observations.html#facts=")
                  and evidence_state.get("query") == "wikidata:q59756366"
                  and evidence_state.get("pair") == []
                  and evidence_state.get("tag") == ""
                  and evidence_state.get("catalog") == entry.get_attribute("data-observation-catalog")
                  and evidence_state.get("version") == entry.get_attribute("data-observation-version")
                  and evidence_state.get("evidence") == entry.get_attribute("data-observation-evidence")
                  and inspect.get_attribute("target") == "_blank"
                  and inspect.get_attribute("rel") == "noopener noreferrer"
                  and fact_lookup.evaluate("location.hash") == uncertain_hash
                  and fact_lookup.locator("#platform").input_value() == "android"
                  and fact_lookup.locator('#results > li[data-game-id="wikidata:q59756366"]').count() == 0)
            fact_lookup.close()
            check(label + ": real catalog exposes only recorded store options",
                  not page.locator("#store-filter-wrap").is_hidden()
                  and page.locator("#store-filter option").evaluate_all(
                      "options => options.map(option => option.value)") == ["all", "steam", "googleplay", "itch"])
            page.locator("#store-filter").select_option("googleplay")
            check(label + ": Google Play discovery shows exactly its linked titles",
                  page.locator("#search-results li > button").count() == 2
                  and all(name in page.locator("#search-results").inner_text()
                          for name in ("Shadow Runner", "Circlanoid"))
                  and "Google Play link" in page.locator("#search-hint").inner_text())
            page.locator("#search").fill("Shadow")
            check(label + ": store filter combines with text search",
                  page.locator("#search-results li > button").count() == 1
                  and "Shadow Runner" in page.locator("#search-results").inner_text())
            page.locator("#search").fill("Hades")
            check(label + ": a title hidden by the store filter exposes an actionable recovery",
                  page.locator("#search-results li > button").count() == 0
                  and "hidden by the Google Play store filter" in page.locator("#search-hint").inner_text()
                  and page.get_by_role("button", name="Search all stores").is_visible())
            page.get_by_role("button", name="Search all stores").click()
            check(label + ": title recovery reveals the real game without changing ranking or basket",
                  page.locator("#store-filter").input_value() == "all"
                  and page.get_by_role("button", name="Add Hades", exact=True).count() == 1
                  and page.locator("#seeds > li").count() == 2
                  and page.locator("#results > li").evaluate_all(
                      "cards => cards.map(card => card.dataset.gameId)") == initial_ranks)
            # Store recovery must not promise an actionable Add at basket capacity.
            # Exercise the full-to-available transition on a separate real player.
            full_basket = ctx.new_page()
            full_errors, full_requests = [], []
            full_basket.on("pageerror", lambda error: full_errors.append(str(error)))
            full_basket.on("request", lambda request: full_requests.append(request.url))
            full_basket.set_content(HTML, wait_until="load")
            full_basket.wait_for_function("document.querySelectorAll('#seeds > li').length === 2")
            for name in ("Factorio", "Shadow Runner", "Circlanoid"):
                full_basket.locator("#search").fill(name)
                full_basket.get_by_role("button", name=f"Add {name}", exact=True).click()
            check(label + ": five favorites fill the real basket",
                  full_basket.locator("#seeds > li").count() == 5
                  and "5 / 5 games" in full_basket.locator("#seed-count").inner_text())
            full_basket.locator("#store-filter").select_option("googleplay")
            full_basket.locator("#search").fill("Hades")
            check(label + ": full basket hides non-actionable store recovery",
                  full_basket.locator("#search-results li > button").count() == 0
                  and full_basket.locator("#search-recovery").is_hidden()
                  and "Remove one before adding another" in
                      full_basket.locator("#search-hint").inner_text()
                  and full_basket.locator("#store-filter").input_value() == "googleplay")
            full_basket.get_by_role("button", name="Remove Factorio", exact=True).click()
            check(label + ": removing a favorite restores the store recovery option",
                  full_basket.locator("#seeds > li").count() == 4
                  and full_basket.get_by_role("button", name="Search all stores").is_visible())
            full_basket.get_by_role("button", name="Search all stores").click()
            add_hades = full_basket.get_by_role("button", name="Add Hades", exact=True)
            check(label + ": recovered result is enabled and keyboard-focused",
                  full_basket.locator("#store-filter").input_value() == "all"
                  and add_hades.is_enabled()
                  and add_hades.evaluate("node => document.activeElement === node")
                  and full_basket.locator("#seeds > li").count() == 4
                  and not full_requests and not full_errors)
            full_basket.close()
            page.locator("#store-filter").select_option("googleplay")
            # A pasted official store link must find its exact recorded game,
            # but the explicit discovery store filter is never weakened.
            page.locator("#search").fill(
                "https://play.google.com/store/apps/details?id=com.TrilobytesStudio.ShadowRunner&hl=en")
            check(label + ": pasted Google Play link finds the recorded title",
                  page.get_by_role("button", name="Add Shadow Runner", exact=True).count() == 1
                  and page.locator("#search-results li > button").count() == 1)
            page.locator("#search").fill(
                "https://store.steampowered.com/app/1145360/Hades/?utm_source=friend")
            check(label + ": pasted Steam link cannot bypass Google Play discovery filter",
                  page.locator("#search-results li > button").count() == 0
                  and "Hades is in the catalog, but the Google Play store filter hides it." in
                      page.locator("#search-hint").inner_text()
                  and page.get_by_role("button", name="Search all stores").is_visible())
            page.get_by_role("button", name="Search all stores").click()
            check(label + ": pasted Steam link resolves Hades without changing the basket",
                  page.get_by_role("button", name="Add Hades", exact=True).count() == 1
                  and page.locator("#search-results li > button").count() == 1
                  and page.locator("#seeds > li").count() == 2
                  and page.locator("#results > li").evaluate_all(
                      "cards => cards.map(card => card.dataset.gameId)") == initial_ranks)
            page.get_by_role("button", name="Add Hades", exact=True).click()
            page.locator("#search").fill(
                "https://store.steampowered.com/app/1145360/Hades/?utm_source=friend")
            check(label + ": selected game store link explains why no add button is shown",
                  page.locator("#search-results li > button").count() == 0
                  and "Hades is already in your basket." in page.locator("#search-hint").inner_text()
                  and page.locator("#seeds > li").count() == 3)
            page.get_by_role("button", name="Remove Hades", exact=True).click()
            check(label + ": link-based basket add and remove restores initial ranks",
                  page.locator("#seeds > li").count() == 2
                  and page.locator("#results > li").evaluate_all(
                      "cards => cards.map(card => card.dataset.gameId)") == initial_ranks)
            page.locator("#search").fill("https://store.steampowered.com.evil.test/app/1145360")
            check(label + ": lookalike store URL matches nothing",
                  page.locator("#search-results li > button").count() == 0
                  and not requests)
            page.locator("#search").fill("https://store.steampowered.com/app/999999999/Unlisted")
            check(label + ": unrecorded legitimate store URL has explicit no-fetch recovery",
                  page.locator("#search-results li > button").count() == 0
                  and "not a recorded HTTPS store link" in page.locator("#search-hint").inner_text()
                  and "Browse games" in page.locator("#search-hint").inner_text()
                  and page.locator("#search-recovery").is_hidden()
                  and not requests)
            page.locator("#search").fill("http://store.steampowered.com/app/1145360/Hades")
            check(label + ": insecure store URL cannot resolve a recorded game",
                  page.locator("#search-results li > button").count() == 0
                  and "not a recorded HTTPS store link" in page.locator("#search-hint").inner_text()
                  and not requests)
            page.locator("#search").fill("https://drevengames.itch.io/shadow-runner/?ref=friend")
            check(label + ": pasted itch.io link finds the recorded title",
                  page.get_by_role("button", name="Add Shadow Runner", exact=True).count() == 1
                  and page.locator("#search-results li > button").count() == 1
                  and not requests)
            page.screenshot(path=str(ARTIFACTS / f"real-store-url-search-{label}.png"), full_page=True)
            page.locator("#search").fill("")
            page.locator("#store-filter").select_option("itch")
            check(label + ": itch.io discovery preserves real multi-store memberships",
                  page.locator("#search-results li > button").count() == 4
                  and "Shadow Runner" in page.locator("#search-results").inner_text())
            page.locator("#store-filter").select_option("steam")
            check(label + ": Steam discovery paginates rather than dropping entries",
                  page.locator("#search-results li > button").count() == 9
                  and page.get_by_role("button", name="Show 8 more games").count() == 1)
            page.locator("#catalog-browse").click()
            check(label + ": storefront discovery never changes basket or ranking",
                  page.locator("#store-filter").input_value() == "all"
                  and page.locator("#seeds > li").count() == 2
                  and page.locator("#results > li").evaluate_all(
                      "cards => cards.map(card => card.dataset.gameId)") == initial_ranks
                  and not requests)
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
                  and "zero demonstrated basket fit" in sparse.locator("#status").inner_text().lower()
                  and "No recorded genre overlap with any favorite" in sparse.locator("#results .fit-warning").first.inner_text()
                  and "appears in this list" in sparse.locator("#results .explanation summary").first.inner_text())
            # A zero on the positive-only genre snapshot is not proof that
            # unreviewed mechanics or other gameplay features are disjoint.
            sparse.locator("#results .explanation summary").first.click()
            zero_explanation = sparse.locator("#results .explanation").first.inner_text()
            check(label + ": zero genre overlap is explicitly limited to recorded evidence",
                  "Recorded genre score vs" in sparse.locator("#results .affinity").first.inner_text()
                  and "No recorded genre overlap with at least one favorite" in zero_explanation
                  and "not a demonstrated whole-basket match" in zero_explanation
                  and "Unrecorded mechanics and other facts remain unknown" in zero_explanation
                  and "No shared genres with any favorite" not in zero_explanation)
            sparse.screenshot(path=str(ARTIFACTS / f"real-catalog-zero-overlap-{label}.png"), full_page=True)
            sparse.close()
            # Selected P400/platform listings prove observed support, not universal
            # incompatibility for every unlisted platform. Filters remain strict.
            page.locator("#platform").select_option("android")
            # The partition is a native <details>: closed content is not
            # visually exposed to players, nor returned by inner_text().
            page.locator("#uncertainty-title").click()
            partition = page.locator("#partition-list").inner_text()
            check(label + ": unlisted real platform abstains instead of being falsely excluded",
                  page.locator("#uncertainty").evaluate("details => details.open")
                  and "Uncertain · Hades: missing evidence: no recorded android support in this snapshot" in partition
                  and "not proof the game is unavailable there" in partition
                  and "Excluded · Hades" not in partition
                  and page.locator('#results > li[data-game-id="wikidata:q59756366"]').count() == 0)
            # Inspect a listed store without treating it as Android/co-op evidence.
            hades_row = page.locator("#partition-list li").filter(has_text="Uncertain · Hades:")
            hades_store = hades_row.locator(".storefront-links a")
            strict_hash = page.evaluate("location.hash")
            check(label + ": uncertain game exposes only recorded store navigation, not compatibility",
                  hades_row.count() == 1
                  and "Store listing (not compatibility proof)" in hades_row.inner_text()
                  and hades_store.count() == 1
                  and hades_store.get_attribute("href") == "https://store.steampowered.com/app/1145360"
                  and hades_store.get_attribute("aria-label") == "View Hades on Steam"
                  and hades_store.get_attribute("target") == "_blank"
                  and hades_row.locator('a[href^="./observations.html#facts="]').count() == 0
                  and "noopener" in (hades_store.get_attribute("rel") or "")
                  and "noreferrer" in (hades_store.get_attribute("rel") or "")
                  and hades_store.evaluate("el => el.getBoundingClientRect().height >= 44")
                  and page.evaluate("location.hash") == strict_hash
                  and page.locator("#platform").input_value() == "android"
                  and page.locator('#results > li[data-game-id="wikidata:q59756366"]').count() == 0)
            no_store_row = page.locator("#partition-list li").filter(has_text="Uncertain · Infamous 2:")
            check(label + ": missing storefront URLs remain unknown rather than fabricated",
                  no_store_row.count() == 1
                  and no_store_row.locator(".storefront-links a").count() == 0)
            # Unknown non-exhaustive platform receipts and unknown required
            # co-op evidence both abstain; neither is proven incompatible.
            page.locator("#coop").check()
            missing_both = page.locator("#partition-list").inner_text()
            check(label + ": unknown required platform and co-op are both named",
                  "Infamous 2: missing evidence: support for required platform android is unrecorded; required co-op support is unrecorded (not proof of incompatibility)" in missing_both
                  and "Uncertain · Hades: missing evidence: no recorded android support in this snapshot" in missing_both
                  and page.locator("#results > li").count() == 0)
            page.locator("#platform").select_option("any")
            coop_only_partition = page.locator("#partition-list").inner_text()
            check(label + ": co-op-only unknown does not invent missing platform support",
                  "Infamous 2: missing evidence: required co-op support is unrecorded" in coop_only_partition
                  and "required platform android" not in coop_only_partition
                  and page.locator("#results > li").count() == 0)
            page.locator("#coop").uncheck()
            page.locator("#uncertainty-title").click()
            # Blend at lambda=0 optimizes only *new* strand coverage. A game
            # may have genuine positive genre affinity yet add zero marginal
            # coverage after earlier picks: never call that no genre match.
            page.locator("#mode").select_option("blend")
            page.locator("#lambda").evaluate(
                "(slider) => { slider.value = '0'; slider.dispatchEvent(new Event('input', {bubbles: true})); }")
            shell = page.locator('[data-game-id="wikidata:q96991833"]')
            shell_affinities = [float(value) for value in shell.locator(".affinity b").all_inner_texts()]
            shell_warning = shell.locator(".fit-warning").inner_text().lower()
            zero_overlap_cards = page.locator("#results > li").evaluate_all(
                "cards => cards.filter(card => [...card.querySelectorAll('.affinity b')].every(value => Number(value.textContent) === 0)).length")
            blend_status = page.locator("#status").inner_text().lower()
            check(label + ": Blend lambda zero retains real affinities despite zero marginal objective",
                  shell.count() == 1
                  and shell.locator(".fit strong").inner_text() == "0.000"
                  and len(shell_affinities) == 2
                  and all(value > 0 for value in shell_affinities)
                  and "no additional uncovered-strand gain" in shell_warning
                  and "no recorded genre overlap" not in shell_warning
                  and "appears in this list" in shell.locator(".explanation summary").inner_text())
            check(label + ": Blend status counts source-backed zero overlaps, not zero objectives",
                  (f"{zero_overlap_cards} shown with zero demonstrated basket fit" in blend_status
                   if zero_overlap_cards else "shown with zero demonstrated basket fit" not in blend_status))
            page.screenshot(path=str(ARTIFACTS / f"real-catalog-blend-zero-marginal-{label}.png"), full_page=True)
            page.locator("#mode").select_option("intersection")
            page.locator("#lambda").evaluate(
                "(slider) => { slider.value = '0.3'; slider.dispatchEvent(new Event('input', {bubbles: true})); }")
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
        legacy_page.set_content(offline_html(legacy_site), wait_until="load")
        legacy_page.wait_for_function("document.querySelectorAll('#seeds > li').length === 2")
        check("legacy Wikidata-only pilot reports the selected 12-game provenance",
              "12 real games" in legacy_page.locator(".intro").inner_text()
              and legacy_page.locator(".badge").inner_text().strip().lower() == "real games"
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
