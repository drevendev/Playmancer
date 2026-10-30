"""Cross-engine player acceptance over local HTTP or explicitly configured Pages HTTPS.

Default mode tests a real local server and is NOT live verification. Hosted mode
requires PLAYMANCER_HOSTED_URL (canonical Pages URL) and PLAYMANCER_EXPECTED_SHA;
it visits the public deployment with Chromium, Firefox and WebKit and saves actual
desktop/mobile screenshots and complete share/recovery assertion results.
Install playwright==1.55.0 plus all three browsers before running.
"""
import json
import os
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import re
import subprocess
from threading import Thread
from urllib.parse import quote, unquote, urlsplit

from playwright.sync_api import sync_playwright
from hosted_validation import validate_hosted_identity, verified_same_origin_worker

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / ".test-artifacts"
ARTIFACTS.mkdir(exist_ok=True)
OVERRIDE = os.environ.get("PLAYMANCER_HTTP_SITE")
HOSTED_URL = os.environ.get("PLAYMANCER_HOSTED_URL")
EXPECTED_SHA = os.environ.get("PLAYMANCER_EXPECTED_SHA")
# A missing deployment URL must fail, not silently execute the loopback test.
if EXPECTED_SHA and not HOSTED_URL:
    raise ValueError("Hosted acceptance expected a deployment URL but got none")
if HOSTED_URL:
    validate_hosted_identity(HOSTED_URL, EXPECTED_SHA, OVERRIDE)
    SITE = None
else:
    SITE = Path(OVERRIDE).resolve() if OVERRIDE else ROOT / "_site"
    if not OVERRIDE:
        subprocess.run(["npm", "run", "build"], cwd=ROOT, check=True)
        subprocess.run(["python3", "scripts/pages-preflight.py", str(SITE)], cwd=ROOT, check=True)
    if not (SITE / "index.html").is_file():
        raise FileNotFoundError(f"No built site at {SITE}")


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


CHECKS = []


def check(case, title, condition, details=None):
    result = {"case": case, "assertion": title, "passed": bool(condition)}
    if details is not None:
        result["observed"] = details
    CHECKS.append(result)
    if not result["passed"]:
        raise AssertionError(f"{case}: {title}; observed={details!r}")



def chromium_status_in_accessibility_tree(page, element_id, expected_text):
    """Verify Chromium exposes a live status and its dynamic text to the AX tree.

    CDP checks accessibility semantics, NOT actual spoken screen-reader output.
    """
    session = page.context.new_cdp_session(page)
    group = "playmancer-status-check"
    try:
        remote = session.send("Runtime.evaluate", {
            "expression": f"document.getElementById({json.dumps(element_id)})",
            "objectGroup": group,
        }).get("result", {})
        if not remote.get("objectId"):
            return False
        nodes = session.send("Accessibility.getPartialAXTree", {
            "objectId": remote["objectId"], "fetchRelatives": True,
        })["nodes"]
        if not nodes:
            return False
        status = nodes[0]
        properties = {
            item["name"]: item.get("value", {}).get("value")
            for item in status.get("properties", [])
        }
        by_id = {node["nodeId"]: node for node in nodes}
        pending = list(status.get("childIds", []))
        names = []
        while pending:
            child = by_id.get(pending.pop())
            if child is None:
                continue
            names.append(str(child.get("name", {}).get("value", "")))
            pending.extend(child.get("childIds", []))
        return (
            not status.get("ignored", True)
            and status.get("role", {}).get("value") == "status"
            and properties.get("live") == "polite"
            and properties.get("atomic") is True
            and expected_text in " ".join(names)
        )
    finally:
        session.send("Runtime.releaseObjectGroup", {"objectGroup": group})
        session.detach()


def exercise(browser, base_url, engine, label, width, height):
    case = f"{engine}/{label}"
    context = browser.new_context(viewport={"width": width, "height": height}, reduced_motion="reduce")
    errors, external_requests = [], []
    context.on("page", lambda pg: pg.on("pageerror", lambda error: errors.append(str(error))))
    origin = (urlsplit(base_url).scheme, urlsplit(base_url).netloc)
    context.on("request", lambda request: external_requests.append(request.url)
               if (urlsplit(request.url).scheme, urlsplit(request.url).netloc) != origin else None)
    try:
        page = context.new_page()
        response = page.goto(base_url + "/", wait_until="load")
        expected_scheme = "https:" if HOSTED_URL else "http:"
        check(case, "real navigation serves HTTP 200 over the required protocol",
              response is not None and response.status == 200
              and page.evaluate("location.protocol") == expected_scheme)
        if HOSTED_URL:
            served_sha = page.locator('meta[name="playmancer-revision"]').get_attribute("content")
            check(case, "hosted HTML matches the exact deployed master SHA",
                  served_sha == EXPECTED_SHA, details=served_sha)
            check(case, "same-origin hosted Bridge worker is served over HTTPS",
                  verified_same_origin_worker(context.request, base_url))
        page.wait_for_function("document.querySelectorAll('#seeds > li').length >= 2")
        catalog_id = page.locator('meta[name="playmancer-catalog"]').get_attribute("content")
        is_real_pilot = catalog_id == "multi-store-genre-pilot-30-2026-10-28"
        check(case, "real catalog sample and honest data provenance",
              is_real_pilot and page.locator("#seeds > li").count() >= 2
              and "real games" in page.locator(".badge").inner_text().lower()
              and "Stardew Valley" in page.locator("#seeds").inner_text()
              and "Terraria" in page.locator("#seeds").inner_text()
              and page.locator("#intro-sample").is_visible())
        receipts = page.locator(".source-receipts a")
        expected_receipt_paths = (
            "docs/REAL_PILOT.md",
            "docs/REAL_EXPANSION.md",
            "docs/REAL_EXPANSION_30.md",
            "docs/STOREFRONTS.md",
        )
        receipt_prefix = "https://github.com/drevendev/Playmancer/blob/master/"
        check(case, "30-game footer links all three Wikidata batches and publisher receipts",
              receipts.count() == len(expected_receipt_paths)
              and all(
                  receipts.nth(i).get_attribute("href") == receipt_prefix + path
                  and receipts.nth(i).get_attribute("target") == "_blank"
                  and "noopener" in (receipts.nth(i).get_attribute("rel") or "")
                  and "noreferrer" in (receipts.nth(i).get_attribute("rel") or "")
                  for i, path in enumerate(expected_receipt_paths)
              ))
        check(case, "native touch-sized sample action", page.locator("#intro-sample").evaluate(
            "el => el.tagName === 'BUTTON' && el.getBoundingClientRect().height >= 44"))
        check(case, "list-first results and explanatory evidence",
              page.locator("#results > li").count() > 0
              and "Evidence coverage" in page.locator("#results > li").first.inner_text())
        # A visual preference changes only the displayed slice, never ranking or share state.
        view = page.locator("#results-view")
        all_ids = page.locator("#results > li").evaluate_all(
            "cards => cards.map(card => card.dataset.gameId)")
        before_hash = page.evaluate("location.hash")
        check(case, "full eligible ranking remains the default",
              len(all_ids) > 5 and view.is_visible()
              and view.get_attribute("aria-pressed") == "false")
        view.focus()
        view.press("Enter")
        compact_ids = page.locator("#results > li").evaluate_all(
            "cards => cards.map(card => card.dataset.gameId)")
        check(case, "keyboard toggles top five without hiding evidence or changing basket",
              compact_ids == all_ids[:5]
              and view.get_attribute("aria-pressed") == "true"
              and page.locator("#status").inner_text().startswith("5 of ")
              and page.locator("#results > li").first.locator(".affinity").count() >= 2
              and page.evaluate("document.activeElement.id") == "results-view"
              and page.evaluate("location.hash") == before_hash)
        view.press("Enter")
        check(case, "keyboard restores every result in original order",
              page.locator("#results > li").evaluate_all(
                  "cards => cards.map(card => card.dataset.gameId)") == all_ids
              and view.get_attribute("aria-pressed") == "false"
              and page.evaluate("document.activeElement.id") == "results-view")
        labels = page.locator("#results > li").evaluate_all(
            "nodes => nodes.map(card => ({game: card.querySelector('h3')?.textContent, "
            "summary: card.querySelector('summary')?.textContent}))")
        check(case, "each match explanation identifies its own game",
              len(labels) > 1
              and len({item["summary"] for item in labels}) == len(labels)
              and all(item["game"] and item["summary"] and item["game"] in item["summary"]
                      for item in labels))

        # Technical identifiers are discoverable but do not crowd the default
        # mobile result list; scores, seed evidence and coverage stay visible.
        first_card = page.locator("#results > li").first
        technical = first_card.locator(".explanation .metadata")
        why_summary = first_card.locator(".explanation summary")
        check(case, "compact result keeps visible seed support, fit and coverage",
              first_card.locator(".affinity").count() >= 2
              and first_card.locator(".fit strong").is_visible()
              and first_card.locator(".card-footer .hint").is_visible()
              and technical.count() == 1
              and not technical.is_visible())
        why_summary.focus()
        why_summary.press("Enter")
        check(case, "keyboard reveals technical details with named explanation",
              first_card.locator(".explanation").evaluate("el => el.open")
              and technical.is_visible()
              and "Entity:" in technical.inner_text()
              and "Platforms:" in technical.inner_text()
              and page.evaluate("document.activeElement.tagName") == "SUMMARY")
        why_summary.press("Enter")
        check(case, "keyboard closes details without removing evidence or focus",
              not first_card.locator(".explanation").evaluate("el => el.open")
              and not technical.is_visible()
              and first_card.locator(".affinity").first.is_visible()
              and page.evaluate("document.activeElement.tagName") == "SUMMARY")

        # From the hero, browse without discarding the sample basket or share state.
        share_before_browse = page.evaluate('location.hash')
        page.locator('#intro-browse').click()
        check(case, 'first-screen catalog browsing preserves favorites, share state and keyboard focus',
              page.locator('#catalog-browse').get_attribute('aria-expanded') == 'true'
              and page.locator('#seeds > li').count() == 2
              and page.locator('#search-results li > button').first.evaluate(
                  'node => document.activeElement === node')
              and page.evaluate('location.hash') == share_before_browse)
        page.locator('#catalog-browse').click()

        # Browse the actual catalog without guessing a title or genre first.
        browse = page.locator("#catalog-browse")
        browse.click()
        items = page.locator("#search-results li > button")
        check(case, "catalog browser starts with eight unselected games and observed genres",
              browse.get_attribute("aria-expanded") == "true"
              and items.count() == 9
              and page.locator("#search-results .hint").count() == 8
              and "Recorded genres:" in page.locator("#search-results").inner_text()
              and "8 of 28 available catalog profiles" in page.locator("#search-hint").inner_text()
              and page.locator("#seeds > li").count() == 2)
        more = page.get_by_role("button", name="Show 8 more games")
        more.focus()
        more.press("Enter")
        check(case, "show more preserves keyboard focus on the first new game",
              page.locator("#search-results li > button").count() == 17
              and page.locator("#search-results li > button").nth(8).evaluate(
                  "node => document.activeElement === node")
              and "16 of 28 available catalog profiles" in page.locator("#search-hint").inner_text())
        browse.click()
        check(case, "closing catalog browser restores compact search without altering basket",
              browse.get_attribute("aria-expanded") == "false"
              and page.locator("#search-results li").count() == 0
              and page.locator("#seeds > li").count() == 2)

        # Search suggestions change while focus stays in the input. Give assistive
        # technology a real polite status target; aria-describedby alone is not
        # a live announcement when the user types.
        hint = page.locator("#search-hint")
        check(case, "search suggestions expose an atomic polite live status",
              hint.get_attribute("role") == "status"
              and hint.get_attribute("aria-live") == "polite"
              and hint.get_attribute("aria-atomic") == "true"
              and page.locator("#search").get_attribute("aria-describedby") == "search-hint")
        page.locator("#search").fill("zzzz-no-such-profile-zzzz")
        check(case, "unmatched search is announced without losing typing focus",
              "No profiles match" in hint.inner_text()
              and page.locator("#search-results li").count() == 0
              and page.evaluate("document.activeElement.id") == "search")
        # Search for a real game outside the default Stardew/Terraria basket.
        if engine == "chromium":
            check(case, "Chromium accessibility tree exposes the unmatched-search status",
                  chromium_status_in_accessibility_tree(page, "search-hint", "No profiles match"))
        # The real catalog's genre-only evidence is searchable without making
        # unsupported co-op/feature claims or changing the selected basket.
        page.locator("#search").fill("roguelike")
        hades_hit = page.get_by_role("button", name="Add Hades", exact=True)
        hades_hint_id = hades_hit.get_attribute("aria-describedby") if hades_hit.count() else None
        check(case, "recorded genre search finds real games with explained evidence",
              hades_hit.count() == 1
              and page.get_by_role("button", name="Add Slay the Spire", exact=True).count() == 1
              and hades_hint_id is not None
              and page.locator("#" + hades_hint_id).inner_text() == "Recorded genre: roguelike"
              and "matching catalog profiles" in hint.inner_text()
              and page.locator("#seeds > li").count() == 2)
        page.locator("#search").fill("co-op")
        check(case, "unknown co-op is not manufactured into searchable genre data",
              page.locator("#search-results button").count() == 0
              and "No profiles match" in hint.inner_text())
        page.locator("#search").fill("Hades")
        check(case, "direct name matches do not pretend to be genre matches",
              page.get_by_role("button", name="Add Hades", exact=True).get_attribute("aria-describedby") is None)
        check(case, "matching search count updates while retaining keyboard access",
              "matching catalog profiles" in hint.inner_text()
              and page.locator("#search-results button").count() > 0
              and page.evaluate("document.activeElement.id") == "search")
        # Browse shortcuts must not interrupt the input -> first result Tab path.
        page.locator("#search").press("Tab")
        check(case, "Tab reaches the first real-catalog search result before browse actions",
              page.locator("#search-results button").first.evaluate(
                  "node => document.activeElement === node"))
        page.locator("#search").focus()
        # Search suggestions remain native buttons: Tab still works, while
        # Arrow Down/Up/Escape provide a keyboard-only fast path without
        # fabricating combobox or active-descendant semantics.
        page.locator("#search").fill("e")
        choices = page.locator("#search-results button:not([disabled])")
        check(case, "search exposes multiple keyboard-navigable suggestions",
              choices.count() >= 2)
        page.locator("#search").press("ArrowDown")
        check(case, "Arrow Down moves from search to first available suggestion",
              choices.first.evaluate("node => document.activeElement === node"))
        choices.first.press("ArrowDown")
        check(case, "Arrow Down advances to the next native suggestion",
              choices.nth(1).evaluate("node => document.activeElement === node"))
        choices.nth(1).press("ArrowUp")
        check(case, "Arrow Up returns to the previous suggestion",
              choices.first.evaluate("node => document.activeElement === node"))
        choices.first.press("ArrowUp")
        check(case, "Arrow Up from first suggestion restores search and its query",
              page.evaluate("document.activeElement.id") == "search"
              and page.locator("#search").input_value() == "e")
        page.locator("#search").press("ArrowDown")
        choices.first.press("Escape")
        check(case, "Escape restores search without adding a profile or deleting query",
              page.evaluate("document.activeElement.id") == "search"
              and page.locator("#search").input_value() == "e"
              and page.locator("#seeds > li").count() == 2)
        page.locator("#search").fill("Hades")

        # A keyboard-selected result and its removal must announce the actual
        # game name as well as the count, not just silently change the basket.
        feedback = page.locator("#basket-feedback")
        check(case, "basket changes use one atomic polite announcement",
              feedback.get_attribute("role") == "status"
              and feedback.get_attribute("aria-live") == "polite"
              and feedback.get_attribute("aria-atomic") == "true"
              and page.locator("#seed-count").get_attribute("aria-live") is None)
        add = page.locator("#search-results button").first
        added_name = add.get_attribute("aria-label")[len("Add "):]
        add.focus()
        add.press("Enter")
        check(case, "keyboard add announces the named favorite and preserves search focus",
              page.locator("#seeds > li").count() == 3
              and feedback.inner_text().startswith(f"Added {added_name}. 3 of 5 games selected.")
              and page.evaluate("document.activeElement.id") == "search")
        if engine == "chromium":
            check(case, "Chromium accessibility tree exposes the named added-game status",
                  chromium_status_in_accessibility_tree(page, "basket-feedback", f"Added {added_name}"))
        remove = page.get_by_role("button", name=f"Remove {added_name}")
        remove.focus()
        remove.press("Enter")
        check(case, "keyboard remove announces the named favorite and preserves search focus",
              page.locator("#seeds > li").count() == 2
              and feedback.inner_text().startswith(f"Removed {added_name}. 2 of 5 games selected.")
              and page.evaluate("document.activeElement.id") == "search")
        if engine == "chromium":
            check(case, "Chromium accessibility tree exposes the named removed-game status",
                  chromium_status_in_accessibility_tree(page, "basket-feedback", f"Removed {added_name}"))
        page.locator("#search").fill("")
        check(case, "clearing search restores the discoverable instruction",
              hint.inner_text() == "Search names, IDs, aliases or recorded genres to find catalog profiles."
              and page.locator("#search-results li").count() == 0
              and page.locator("#search").input_value() == "")

        page.locator("#mode").select_option("blend")
        weight = page.locator('#seeds input[type="range"]').first
        before = int(weight.input_value())
        weight.focus()
        weight.press("ArrowRight")
        after = int(weight.input_value())
        check(case, "keyboard edits seed weight", after == before + 1)
        page.locator("#platform").select_option("windows")
        page.locator("#coop").check()
        check(case, "hard-filter controls remain explicit",
              page.locator("#platform").input_value() == "windows"
              and page.locator("#coop").is_checked())
        page.locator("#coop").uncheck()
        page.locator("#platform").select_option("any")
        summary = page.locator("#results > li .explanation summary").first
        summary.focus()
        summary.press("Enter")
        check(case, "keyboard opens named explanation and retains focus",
              page.locator("#results > li .explanation").first.evaluate("el => el.open")
              and page.evaluate("document.activeElement.tagName") == "SUMMARY"
              and "shared:" in page.locator("#results > li .explanation").first.inner_text())

        page.locator("#intro-bridge").focus()
        page.locator("#intro-bridge").press("Enter")
        check(case, "keyboard Bridge jump preserves focus", page.evaluate("document.activeElement.id") == "bridge-title")
        # Native reverse navigation must work without scrolling for thousands
        # of pixels or replacing the versioned #basket= share fragment.
        before_back_hash = page.evaluate("location.hash")
        back_to_basket = page.locator("#bridge-back-to-basket")
        back_to_basket.focus()
        back_to_basket.press("Enter")
        check(case, "keyboard Bridge return focuses basket without mutating shared state",
              page.evaluate("document.activeElement.id") == "basket-title"
              and page.evaluate("location.hash") == before_back_hash
              and back_to_basket.evaluate("node => node.getBoundingClientRect().height") >= 44)
        page.locator("#intro-bridge").focus()
        page.locator("#intro-bridge").press("Enter")
        ids = page.locator("#bridge-start option").evaluate_all(
            "nodes => nodes.map(el => el.value).filter(Boolean)")
        check(case, "Bridge exposes explicit basket endpoints", len(ids) >= 2)
        page.locator("#bridge-start").select_option(ids[0])
        page.locator("#bridge-end").select_option(ids[1])
        page.locator("#bridge-threshold").select_option("0.05")
        check(case, "sample Bridge exposes supported steps and evidence",
              page.locator("#bridge-steps li").count() > 0
              and "comparable evidence" in page.locator("#bridge-steps").first.inner_text().lower())

        # The route is distinct from basket ranking. A polite announcement must
        # name the *current pair* so it makes sense without reading both selects.
        bridge_names = (
            page.locator("#bridge-start option:checked").text_content(),
            page.locator("#bridge-end option:checked").text_content(),
        )
        bridge_feedback = page.locator("#bridge-status")
        named_pair = f"Bridge from {bridge_names[0]} to {bridge_names[1]}:"
        check(case, "Bridge route live status identifies both selected favorites",
              bridge_feedback.get_attribute("role") == "status"
              and bridge_feedback.get_attribute("aria-live") == "polite"
              and bridge_feedback.inner_text().startswith(named_pair),
              details={"pair": bridge_names, "status": bridge_feedback.inner_text()})
        page.locator("#bridge-hops").select_option("1")
        check(case, "changed Bridge route still names its endpoints even if no route exists",
              bridge_feedback.inner_text().startswith(named_pair),
              details=bridge_feedback.inner_text())
        page.locator("#bridge-hops").select_option("3")
        hidden_id = page.locator("#results > li").first.get_attribute("data-game-id")
        hidden_name = page.locator("#results > li").first.locator("h3").inner_text()
        hide_button = page.locator("#results > li").first.get_by_role("button", name=re.compile("^Hide "))
        hide_button.focus()
        hide_button.press("Enter")
        check(case, "explicit exclusion removes result without relaxing filters",
              page.locator(f'[data-game-id="{hidden_id}"]').count() == 0
              and page.locator("#restore").is_visible())
        # Blend re-optimizes selection when a candidate is excluded. Focus must
        # follow the refreshed list position, not the former rank-two identity.
        first_remaining_id = page.locator("#results > li").first.get_attribute("data-game-id")
        focused_game_id = page.evaluate(
            "document.activeElement.closest('[data-game-id]')?.dataset.gameId")
        announcement = page.locator("#status").inner_text()
        check(case, "keyboard hide announces game and focuses refreshed first result",
              first_remaining_id is not None and first_remaining_id != hidden_id
              and focused_game_id == first_remaining_id
              and f"{hidden_name} hidden." in announcement,
              details={"first_remaining": first_remaining_id, "focused": focused_game_id,
                       "status": announcement})
        page.locator("#share").click()
        link = page.locator("#share-link").input_value()
        hash_fragment = "#" + urlsplit(link).fragment
        check(case, "real Share produces versioned basket URL",
              link.startswith(base_url + "/#basket=")
              and hash_fragment.startswith("#basket="))
        saved = json.loads(unquote(hash_fragment[len("#basket="):]))
        check(case, "share preserves ordered favorites, weights and hard filters",
              len(saved["seeds"]) >= 2 and saved["seeds"][0]["weight"] == after
              and saved["mode"] == "blend" and saved["platform"] == "any"
              and saved["coopOnly"] is False and hidden_id in saved["excluded"]
              and bool(saved["catalog"]) and bool(saved["method"]))
        check(case, "share preserves explicit Bridge endpoints and policy",
              saved["bridge"]["startId"] == ids[0]
              and saved["bridge"]["endId"] == ids[1]
              and saved["bridge"]["minSimilarity"] == 0.05)

        restored = context.new_page()
        replay = restored.goto(base_url + "/" + hash_fragment, wait_until="load")
        restored.wait_for_function("document.querySelector('#bridge-start').value !== ''")
        check(case, "fresh shared link announces restored basket count",
              restored.locator("#basket-feedback").inner_text().startswith(
                  "Shared basket restored. 2 of 5 games selected."))
        observed = {
            # A fresh Firefox tab may reuse a validated cached response (HTTP 304).
            # The first page must still load via 200 and every restored field is asserted.
            "response_status": None if replay is None else replay.status,
            "http_usable": replay is not None and replay.status in (200, 304),
            "error_hidden": restored.locator("#error").is_hidden(),
            "mode": restored.locator("#mode").input_value(),
            "weight": restored.locator('#seeds input[type="range"]').first.input_value(),
            "bridge_end": restored.locator("#bridge-end").input_value(),
            "restore_visible": restored.locator("#restore").is_visible(),
            "hidden_card_count": restored.locator(f'[data-game-id="{hidden_id}"]').count(),
        }
        restored.screenshot(path=str(ARTIFACTS / f"http-{engine}-{label}.png"), full_page=True, animations="disabled")
        check(case, "fresh HTTP navigation restores complete player state",
              observed["http_usable"] and observed["error_hidden"]
              and observed["mode"] == "blend"
              and observed["weight"] == str(after)
              and observed["bridge_end"] == ids[1]
              and observed["restore_visible"]
              and observed["hidden_card_count"] == 0, details=observed)
        check(case, "narrow layout does not overflow",
              restored.evaluate("document.documentElement.scrollWidth <= window.innerWidth"))


        # Test text-only enlargement separately from browser zoom and screen readers.
        # These checks use the restored journey after its baseline screenshot.
        motion = restored.evaluate("""() => {
            const button = getComputedStyle(document.querySelector('#intro-sample'));
            return {
                requested: matchMedia('(prefers-reduced-motion: reduce)').matches,
                animation: button.animationName,
                transition: button.transitionDuration,
                scroll: getComputedStyle(document.documentElement).scrollBehavior
            };
        }""")
        check(case, "reduced-motion preference removes animated transitions and scrolling",
              motion["requested"] and motion["animation"] == "none"
              and all(float(value.strip().removesuffix("s")) == 0
                      for value in motion["transition"].split(","))
              and motion["scroll"] == "auto", details=motion)
        original_copy = restored.locator(".intro p").evaluate(
            "node => parseFloat(getComputedStyle(node).fontSize)")
        original_button = restored.locator("#intro-sample").evaluate(
            "node => parseFloat(getComputedStyle(node).fontSize)")
        bridge_type_baseline = restored.locator("#bridge-lab").evaluate("""panel => {
            const size = selector => parseFloat(getComputedStyle(panel.querySelector(selector)).fontSize);
            return {
                heading: size("#bridge-title"),
                eyebrow: size(".eyebrow"),
                warning: size(".bridge-warning")
            };
        }""")
        # The primary heading and result hierarchy must scale too; fixed-pixel
        # titles otherwise become smaller than enlarged body copy at 400%.
        heading_type_baseline = restored.evaluate("""() => ({
            hero: parseFloat(getComputedStyle(document.querySelector('.intro h1')).fontSize),
            basket: parseFloat(getComputedStyle(document.querySelector('#basket-title')).fontSize),
            results: parseFloat(getComputedStyle(document.querySelector('#results-title')).fontSize),
            card: parseFloat(getComputedStyle(document.querySelector('#results h3')).fontSize)
        })""")
        result_type_baseline = restored.evaluate("""() => {
            const size = selector => parseFloat(getComputedStyle(document.querySelector(selector)).fontSize);
            return {
                score: size("#results > li .fit strong"),
                scoreLabel: size("#results > li .fit small"),
                affinity: size("#results > li .affinity"),
                metadata: size("#results > li .metadata"),
                explanation: size("#results > li .explanation p")
            };
        }""")
        for text_size in (200, 400):
            restored.evaluate("(size) => { document.documentElement.style.fontSize = size + '%'; }",
                              text_size)
            # WebKit may publish scroll geometry a frame after changing root text.
            # Inspect the settled layout, not the intermediate font-update frame.
            restored.evaluate("() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))")
            enlarged = restored.evaluate("""() => {
                const doc = document.documentElement;
                return {
                    root: parseFloat(getComputedStyle(doc).fontSize),
                    copy: parseFloat(getComputedStyle(document.querySelector('.intro p')).fontSize),
                    button: parseFloat(getComputedStyle(document.querySelector('#intro-sample')).fontSize),
                    heroLines: (() => {
                        const title = document.querySelector('.intro h1');
                        const line = parseFloat(getComputedStyle(title).lineHeight);
                        return Math.round(title.getBoundingClientRect().height / line);
                    })(),
                    headingType: {
                        hero: parseFloat(getComputedStyle(document.querySelector('.intro h1')).fontSize),
                        basket: parseFloat(getComputedStyle(document.querySelector('#basket-title')).fontSize),
                        results: parseFloat(getComputedStyle(document.querySelector('#results-title')).fontSize),
                        card: parseFloat(getComputedStyle(document.querySelector('#results h3')).fontSize)
                    },
                    resultType: (() => {
                        const size = selector => parseFloat(getComputedStyle(document.querySelector(selector)).fontSize);
                        return {
                            score: size("#results > li .fit strong"),
                            scoreLabel: size("#results > li .fit small"),
                            affinity: size("#results > li .affinity"),
                            metadata: size("#results > li .metadata"),
                            explanation: size("#results > li .explanation p")
                        };
                    })(),
                    bridgeType: (() => {
                        const panel = document.querySelector("#bridge-lab");
                        const size = selector => parseFloat(getComputedStyle(panel.querySelector(selector)).fontSize);
                        return {
                            heading: size("#bridge-title"),
                            eyebrow: size(".eyebrow"),
                            warning: size(".bridge-warning")
                        };
                    })(),
                    scrollWidth: doc.scrollWidth,
                    bodyScrollWidth: document.body.scrollWidth,
                    rootClientWidth: doc.clientWidth,
                    viewport: window.innerWidth,
                    innerOverflow: Array.from(document.querySelectorAll('body *'))
                        .map(node => {
                            const box = node.getBoundingClientRect();
                            return {tag: node.tagName.toLowerCase(), id: node.id || '',
                                    className: typeof node.className === 'string' ? node.className : '',
                                    over: node.scrollWidth - node.clientWidth,
                                    overflowX: getComputedStyle(node).overflowX,
                                    right: Math.round(box.right)};
                        }).filter(node => node.over > 8)
                          .sort((a, b) => b.over - a.over).slice(0, 12),
                    overflowNodes: Array.from(document.querySelectorAll('body *'))
                        .map(node => {
                            const box = node.getBoundingClientRect();
                            return {tag: node.tagName.toLowerCase(), id: node.id || '',
                                    className: typeof node.className === 'string' ? node.className : '',
                                    right: Math.round(box.right), left: Math.round(box.left),
                                    scroll: node.scrollWidth, width: node.clientWidth};
                        }).filter(node => node.right > innerWidth + 1 || node.left < -1)
                          .slice(0, 12),
                    firstAction: (() => {
                        const button = document.querySelector('#intro-sample');
                        const copy = document.querySelector('.intro p');
                        const bounds = button.getBoundingClientRect();
                        return {
                            top: bounds.top, bottom: bounds.bottom, height: bounds.height,
                            viewportHeight: innerHeight,
                            precedesCopy: !!(button.compareDocumentPosition(copy) &
                                             Node.DOCUMENT_POSITION_FOLLOWING)
                        };
                    })(),
                    actions: Array.from(document.querySelectorAll('.intro-actions button')).map(node => {
                        const box = node.getBoundingClientRect();
                        return {left: box.left, right: box.right,
                                inner: node.scrollWidth, width: node.clientWidth};
                    })
                };
            }""")
            factor = text_size / 100
            check(case, f"{text_size}% root text enlarges introduction and primary action",
                  enlarged["root"] >= 16 * factor - 1
                  and enlarged["copy"] >= original_copy * factor - 1
                  and enlarged["button"] >= original_button * factor - 1,
                  details=enlarged)
            # Except the mobile hero, headings continue to scale linearly. The
            # hero is bounded by the viewport at 400% to avoid splitting single
            # words into letter fragments, but must remain at least body-sized.
            hero_floor = (min(heading_type_baseline["hero"] * factor,
                              enlarged["viewport"] * 0.165)
                          if enlarged["viewport"] <= 640
                          else heading_type_baseline["hero"] * factor)
            check(case, f"{text_size}% root text retains player heading hierarchy",
                  all(enlarged["headingType"][name] >= baseline * factor - 1
                      for name, baseline in heading_type_baseline.items()
                      if name != "hero")
                  and enlarged["headingType"]["hero"] >= hero_floor - 1
                  and enlarged["headingType"]["hero"] >= enlarged["copy"]
                  and enlarged["headingType"]["basket"] >= enlarged["copy"]
                  and enlarged["headingType"]["results"] >= enlarged["copy"]
                  and enlarged["headingType"]["card"] >= enlarged["copy"],
                  details={"baseline": heading_type_baseline, "enlarged": enlarged["headingType"],
                           "hero_floor": hero_floor})
            if text_size == 400 and enlarged["viewport"] <= 640:
                check(case, "400% mobile hero reflows into at most five readable lines",
                      enlarged["heroLines"] <= 5,
                      details={"heroLines": enlarged["heroLines"],
                               "fontSize": enlarged["headingType"]["hero"],
                               "viewport": enlarged["viewport"]})
            if text_size == 400 and enlarged["viewport"] <= 640:
                # Large text must not bury the working start action below the
                # initial mobile viewport. This is root-font scaling, NOT browser zoom.
                first = enlarged["firstAction"]
                check(case, "400% mobile sample action is fully visible before lengthy copy",
                      first["precedesCopy"] and first["top"] >= 0
                      and first["height"] >= 44
                      and first["bottom"] <= first["viewportHeight"] + 1,
                      details=first)
            check(case, f"{text_size}% root text enlarges recommendation score and evidence text",
                  all(enlarged["resultType"][name] >= original * factor - 1
                      for name, original in result_type_baseline.items()),
                  details={"baseline": result_type_baseline, "enlarged": enlarged["resultType"]})
            check(case, f"{text_size}% root text enlarges Bridge experiment labels and warnings",
                  all(enlarged["bridgeType"][name] >= original * factor - 1
                      for name, original in bridge_type_baseline.items()),
                  details={"baseline": bridge_type_baseline, "enlarged": enlarged["bridgeType"]})
            check(case, f"{text_size}% root text reflows without horizontal action clipping",
                  enlarged["scrollWidth"] <= enlarged["viewport"] + 1
                  and len(enlarged["actions"]) == 3
                  and all(action["left"] >= -1
                          and action["right"] <= enlarged["viewport"] + 1
                          and action["inner"] <= action["width"] + 1
                          for action in enlarged["actions"]),
                  details=enlarged)
            if text_size == 400:
                restored.screenshot(
                    path=str(ARTIFACTS / f"http-{engine}-{label}-text400.png"),
                    full_page=False, animations="disabled")
                # First-screen shots do not show the below-the-fold Bridge controls.
                # Verify actual native select geometry, not page scrollWidth alone.
                bridge_geometry = restored.locator("#bridge-lab").evaluate("""panel => {
                    const section = panel.getBoundingClientRect();
                    return Array.from(panel.querySelectorAll(".bridge-controls select"), control => {
                        const bounds = control.getBoundingClientRect();
                        const label = control.closest("label").getBoundingClientRect();
                        return {
                            id: control.id, left: bounds.left, right: bounds.right,
                            labelLeft: label.left, labelRight: label.right,
                            sectionLeft: section.left, sectionRight: section.right,
                            height: bounds.height,
                            interiorOverflow: control.scrollWidth - control.clientWidth
                        };
                    });
                }""")
                check(case, "400% root text keeps Bridge native controls readable and touch-sized",
                      len(bridge_geometry) == 4
                      and all(item["left"] >= item["labelLeft"] - 1
                              and item["right"] <= item["labelRight"] + 1
                              and item["left"] >= item["sectionLeft"] - 1
                              and item["right"] <= item["sectionRight"] + 1
                              and item["height"] >= 44
                              and item["interiorOverflow"] <= 8
                              for item in bridge_geometry),
                      details=bridge_geometry)
                return_geometry = restored.locator("#bridge-back-to-basket").evaluate("""button => {
                    const bounds = button.getBoundingClientRect();
                    const panel = button.closest("#bridge-lab").getBoundingClientRect();
                    return {
                        left: bounds.left, right: bounds.right, height: bounds.height,
                        panelLeft: panel.left, panelRight: panel.right,
                        innerOverflow: button.scrollWidth - button.clientWidth
                    };
                }""")
                check(case, "400% text leaves an unclipped touch-sized return to basket",
                      return_geometry["left"] >= return_geometry["panelLeft"] - 1
                      and return_geometry["right"] <= return_geometry["panelRight"] + 1
                      and return_geometry["height"] >= 44
                      and return_geometry["innerOverflow"] <= 8,
                      details=return_geometry)
                restored.locator("#bridge-lab").screenshot(
                    path=str(ARTIFACTS / f"http-{engine}-{label}-bridge-text400.png"),
                    animations="disabled")

        stale = {**saved, "catalog": "unavailable-snapshot"}
        invalid_hash = "#basket=" + quote(json.dumps(stale, separators=(",", ":")), safe="")
        bad_page = context.new_page()
        bad_page.goto(base_url + "/" + invalid_hash, wait_until="load")
        bad_page.wait_for_function("document.querySelector('#error').hidden === false")
        check(case, "incompatible link fails visibly without substitute basket",
              "unavailable catalog" in bad_page.locator("#error").inner_text().lower()
              and bad_page.locator("#seeds > li").count() == 0)
        check(case, "invalid link focuses an announced, keyboard-accessible recovery",
              bad_page.locator("#error").get_attribute("role") == "alert"
              and bad_page.locator("#error").get_attribute("tabindex") == "-1"
              and bad_page.evaluate("document.activeElement.id") == "error"
              and bad_page.locator("#error-recover").is_visible())
        bad_page.keyboard.press("Tab")
        check(case, "recovery action is next in keyboard order",
              bad_page.evaluate("document.activeElement.id") == "error-recover")
        bad_page.keyboard.press("Enter")
        check(case, "keyboard recovery explicitly restores sample and results focus",
              bad_page.locator("#error").is_hidden()
              and bad_page.locator("#seeds > li").count() >= 2
              and bad_page.evaluate("document.activeElement.id") == "recommendations")
        # The original first-screen sample recovery remains a separate path.
        bad_page.goto(base_url + "/" + invalid_hash, wait_until="load")
        bad_page.wait_for_function("document.querySelector('#error').hidden === false")
        bad_page.locator("#intro-sample").click()
        check(case, "first-screen sample recovery also works after invalid navigation",
              bad_page.locator("#error").is_hidden()
              and bad_page.locator("#seeds > li").count() >= 2)
        # Real pilot has no verified co-op values. Exercising its unknown-only
        # empty state is more representative than asking for a fictional sparse ID;
        # synthetic sparse-seed removal stays covered by browser-smoke.py.
        sparse = context.new_page()
        sparse.goto(base_url + "/", wait_until="load")
        sparse.locator("#clear").click()
        sparse.locator("#search").fill("Hades")
        sparse_add = sparse.get_by_role("button", name="Add Hades")
        sparse_add.focus()
        sparse_add.press("Enter")
        sparse.locator("#coop").check()
        recovery = sparse.get_by_role("button", name="Remove co-op requirement")
        check(case, "unknown co-op source evidence exposes explicit accessible recovery",
              sparse.locator("#seeds > li").count() == 1
              and sparse.locator("#empty").is_visible()
              and sparse.locator("#results > li").count() == 0
              and recovery.is_visible()
              and sparse.locator("#coop").is_checked())
        recovery.focus()
        recovery.press("Enter")
        check(case, "keyboard recovery removes only the chosen requirement and restores results focus",
              sparse.locator("#seeds > li").count() == 1
              and not sparse.locator("#coop").is_checked()
              and sparse.locator("#results > li").count() > 0
              and sparse.evaluate("document.activeElement.id") == "recommendations")
        # CDP page scale exercises the actual Chromium visual viewport under
        # pinch-like magnification. It is *not* browser-menu zoom or a screen
        # reader test; those independent issue #14 gates remain open.
        if engine == "chromium" and label == "mobile":
            magnified = context.new_page()
            scale_session = None
            try:
                magnified.goto(base_url + "/", wait_until="load")
                magnified.wait_for_function("document.querySelectorAll('#seeds > li').length >= 2")
                scale_session = context.new_cdp_session(magnified)
                scale_session.send("Emulation.setPageScaleFactor", {"pageScaleFactor": 4})
                magnified.evaluate("() => new Promise(done => requestAnimationFrame(done))")
                metrics = magnified.evaluate("""() => ({
                    scale: visualViewport.scale,
                    visualWidth: visualViewport.width,
                    layoutWidth: innerWidth,
                    actionHeight: document.querySelector('#intro-sample').getBoundingClientRect().height
                })""")
                check(case, "Chromium 400% page scale produces a smaller visual viewport",
                      abs(metrics["scale"] - 4) < 0.05
                      and metrics["visualWidth"] < metrics["layoutWidth"] / 3
                      and metrics["actionHeight"] >= 44,
                      details=metrics)
                # Playwright locator.click() targets a layout-viewport point,
                # which can lie outside the 4x *visual* viewport. Send an
                # actual CDP touch at the visible, unobstructed intersection.
                magnified.locator("#intro-sample").scroll_into_view_if_needed()
                touch = magnified.evaluate("""() => {
                    const button = document.querySelector('#intro-sample');
                    const rect = button.getBoundingClientRect();
                    const viewport = visualViewport;
                    const left = Math.max(rect.left, viewport.offsetLeft);
                    const right = Math.min(rect.right, viewport.offsetLeft + viewport.width);
                    const top = Math.max(rect.top, viewport.offsetTop);
                    const bottom = Math.min(rect.bottom, viewport.offsetTop + viewport.height);
                    const x = (left + right) / 2;
                    const y = (top + bottom) / 2;
                    return {
                        visible: right > left && bottom > top,
                        unobstructed: button.contains(document.elementFromPoint(x, y)),
                        x: x - viewport.offsetLeft,
                        y: y - viewport.offsetTop
                    };
                }""")
                check(case, "magnified sample action has an unobstructed visible touch point",
                      touch["visible"] and touch["unobstructed"], details=touch)
                if touch["visible"] and touch["unobstructed"]:
                    scale_session.send("Input.dispatchTouchEvent", {
                        "type": "touchStart",
                        "touchPoints": [{"x": touch["x"], "y": touch["y"]}],
                    })
                    scale_session.send("Input.dispatchTouchEvent", {
                        "type": "touchEnd", "touchPoints": [],
                    })
                magnified.wait_for_function(
                    "document.activeElement.id === 'recommendations'", timeout=5000)
                check(case, "magnified sample action remains usable and transfers keyboard focus",
                      magnified.locator("#seeds > li").count() >= 2
                      and magnified.evaluate("document.activeElement.id") == "recommendations")
                magnified.screenshot(
                    path=str(ARTIFACTS / "http-chromium-mobile-page-scale400.png"),
                    animations="disabled")
            finally:
                if scale_session is not None:
                    scale_session.detach()
                magnified.close()
        check(case, "no external requests or JavaScript exceptions",
              not errors and not external_requests)
    finally:
        context.close()


server = None
thread = None
if HOSTED_URL:
    base_url = HOSTED_URL.rstrip("/")
else:
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=str(SITE)))
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base_url = f"http://127.0.0.1:{server.server_port}"
failed = None
try:
    with sync_playwright() as p:
        # CI installs all three engine binaries. A partial local run is diagnostic only.
        requested = os.environ.get("PLAYMANCER_BROWSERS", "chromium,firefox,webkit").split(",")
        for engine in requested:
            if engine not in ("chromium", "firefox", "webkit"):
                raise ValueError(f"Unsupported Playwright engine: {engine}")
            launch = {"headless": True}
            if engine == "chromium" and os.environ.get("PLAYWRIGHT_CHROMIUM_EXECUTABLE"):
                launch["executable_path"] = os.environ["PLAYWRIGHT_CHROMIUM_EXECUTABLE"]
            browser = getattr(p, engine).launch(**launch)
            try:
                for label, width, height in (("desktop", 1280, 800), ("mobile", 390, 844)):
                    exercise(browser, base_url, engine, label, width, height)
            finally:
                browser.close()
except Exception as error:
    failed = f"{type(error).__name__}: {error}"
finally:
    if server is not None:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
    report = {
        "scope": ("public Pages HTTPS browser journey; not assistive-technology certification"
                  if HOSTED_URL else
                  "local HTTP over loopback, real browser engines; not public Pages or assistive-technology certification"),
        "revision": EXPECTED_SHA if HOSTED_URL else os.environ.get("GITHUB_SHA", os.environ.get("PLAYMANCER_REVISION", "unpublished")),
        "site": base_url if HOSTED_URL else ("build artifact; local override" if OVERRIDE else "exact-checkout build"),
        "hosted": bool(HOSTED_URL),
        "engines": os.environ.get("PLAYMANCER_BROWSERS", "chromium,firefox,webkit").split(","),
        "checks": CHECKS,
        "error": failed,
    }
    (ARTIFACTS / "http-cross-browser.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"passed": sum(x["passed"] for x in CHECKS), "checks": len(CHECKS), "error": failed}))
if failed:
    raise SystemExit(1)
