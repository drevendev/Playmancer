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
ARTIFACTS = Path(os.environ.get("PLAYMANCER_HTTP_ARTIFACTS", str(ROOT / ".test-artifacts"))).resolve()
ARTIFACTS.mkdir(parents=True, exist_ok=True)
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
        subprocess.run(["python3", "scripts/release-preflight.py", str(SITE)], cwd=ROOT, check=True)
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



def search_focus_snapshot(page):
    return page.evaluate("""() => {
        const list = document.querySelector('#search-results');
        const active = document.activeElement;
        const row = active.closest('#search-results > li');
        return {tag: active.tagName, id: active.id, label: active.getAttribute('aria-label'),
                row: row ? [...list.children].indexOf(row) : null,
                scrollHeight: list.scrollHeight, clientHeight: list.clientHeight,
                scrollTop: list.scrollTop, listTabindex: list.getAttribute('tabindex')};
    }""")


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
        served_sha = page.locator('meta[name="playmancer-revision"]').get_attribute("content")
        if HOSTED_URL:
            check(case, "hosted HTML matches the exact deployed master SHA",
                  served_sha == EXPECTED_SHA, details=served_sha)
            check(case, "same-origin hosted Bridge worker is served over HTTPS",
                  verified_same_origin_worker(context.request, base_url))
        page.wait_for_function("document.querySelectorAll('#seeds > li').length >= 2")
        catalog_id = page.locator('meta[name="playmancer-catalog"]').get_attribute("content")
        expected_count = int(os.environ.get("PLAYMANCER_EXPECTED_CATALOG_COUNT", "51"))
        expected_catalog = {35: "multi-store-genre-pilot-35-2026-11-24",
                            51: "multi-store-genre-pilot-51-2026-11-25"}[expected_count]
        is_real_pilot = catalog_id == expected_catalog
        check(case, "real catalog sample and honest data provenance",
              is_real_pilot and page.locator("#seeds > li").count() >= 2
              and "real games" in page.locator(".badge").inner_text().lower()
              and "Stardew Valley" in page.locator("#seeds").inner_text()
              and "Terraria" in page.locator("#seeds").inner_text()
              and page.locator("#intro-sample").is_visible())
        def initial_picker(probe, name):
            probe.wait_for_function("document.querySelector('#seed-count').textContent.includes('/ 5')")
            geometry = probe.locator("#search").evaluate("""el => {
                const b = el.getBoundingClientRect();
                return {top: b.top, bottom: b.bottom, width: b.width,
                        viewport: innerHeight, scrollY, overflow: document.documentElement.scrollWidth - innerWidth};
            }""")
            check(case, name + " search visible before any scrolling",
                  geometry["scrollY"] == 0 and geometry["top"] >= 0
                  and geometry["bottom"] <= geometry["viewport"]
                  and geometry["width"] > 0 and geometry["overflow"] <= 1,
                  details=geometry)
            probe.screenshot(path=str(ARTIFACTS / f"http-{engine}-{label}-{name}-first-screen.png"),
                             full_page=False, animations="disabled")

        initial_picker(page, "default")
        check(case, "search precedes secondary actions, recommendations precede advanced tools",
              page.evaluate("""() => {
                  const before = (a,b) => !!(document.querySelector(a).compareDocumentPosition(
                      document.querySelector(b)) & Node.DOCUMENT_POSITION_FOLLOWING);
                  return before('#search','#intro-sample') && before('#search','#seeds')
                      && before('#recommendations','#player-tools')
                      && before('#recommendations','#observation-explorer-entry');
              }"""))
        receipts = page.locator(".source-receipts a")
        expected_receipt_paths = (
            "docs/REAL_PILOT.md",
            "docs/REAL_EXPANSION.md",
            "docs/REAL_EXPANSION_30.md",
            "docs/REAL_EXPANSION_31.md",
            "examples/reviewed-steam-batch-2026-11-24.json",
            *(("docs/REAL_EXPANSION_51.md", "examples/reviewed-steam-batch-2026-11-25.json") if expected_count == 51 else ()),
            "docs/STOREFRONTS.md",
        )
        # A published player's receipts must not drift when master advances.
        # Unpublished local fixture builds intentionally retain master navigation.
        receipt_ref = served_sha if served_sha and re.fullmatch(r"[0-9a-f]{40}", served_sha) else "master"
        receipt_prefix = "https://github.com/drevendev/Playmancer/blob/" + receipt_ref + "/"
        check(case, f"{expected_count}-game footer links every catalog expansion and publisher receipt",
              receipts.count() == len(expected_receipt_paths)
              and all(
                  receipts.nth(i).get_attribute("href") == receipt_prefix + path
                  and receipts.nth(i).get_attribute("target") == "_blank"
                  and "noopener" in (receipts.nth(i).get_attribute("rel") or "")
                  and "noreferrer" in (receipts.nth(i).get_attribute("rel") or "")
                  for i, path in enumerate(expected_receipt_paths)
              ))
        # Pre-selection store navigation is optional and must never rewrite
        # the pinned basket, load third-party data, or force a favorite choice.
        browse_hash = page.evaluate("location.hash")
        page.locator("#intro-browse").click()
        first_browse = page.locator("#search-results > li").first
        store_link = first_browse.locator(".storefront-links a")
        check(case, "real browse exposes a safe, touch-sized recorded store link",
              first_browse.get_by_role("button", name="Add Mortal Shell").count() == 1
              and store_link.count() == 1
              and store_link.inner_text() == "Steam"
              and store_link.get_attribute("href") == "https://store.steampowered.com/app/1110910"
              and store_link.get_attribute("target") == "_blank"
              and "noopener" in (store_link.get_attribute("rel") or "")
              and "noreferrer" in (store_link.get_attribute("rel") or "")
              and store_link.evaluate("el => el.getBoundingClientRect().height >= 44")
              and page.locator("#seeds > li").count() == 2
              and page.evaluate("location.hash") == browse_hash)
        # Review partial observation coverage before adding a favorite; a
        # versioned evidence lookup is not a ranking or compatibility claim.
        evidence_link = first_browse.get_by_role(
            "link", name="Inspect Mortal Shell gameplay evidence (new tab)")
        evidence_state = json.loads(unquote(urlsplit(evidence_link.get_attribute("href")).fragment.split("facts=", 1)[1]))
        facts_entry = page.locator("#observation-explorer-entry")
        check(case, "real browse shows partial fact inventory and safe revision-pinned inspection",
              "selected gameplay facts (partial evidence" in first_browse.inner_text()
              and evidence_link.get_attribute("target") == "_blank"
              and "noopener" in (evidence_link.get_attribute("rel") or "")
              and "noreferrer" in (evidence_link.get_attribute("rel") or "")
              and evidence_state["query"] == "wikidata:q96991833"
              and evidence_state["pair"] == [] and evidence_state["tag"] == ""
              and evidence_state["catalog"] == facts_entry.get_attribute("data-observation-catalog")
              and evidence_state["version"] == facts_entry.get_attribute("data-observation-version")
              and evidence_state["evidence"] == facts_entry.get_attribute("data-observation-evidence")
              and page.evaluate("location.hash") == browse_hash
              and not external_requests)
        page.locator("#search").focus()
        page.locator("#search").press("Escape")
        check(case, "closing store discovery preserves exact ordered favorites and share",
              page.locator("#search-results > li").count() == 0
              and page.locator("#catalog-browse").get_attribute("aria-expanded") == "false"
              and page.evaluate("location.hash") == browse_hash)
        check(case, "native touch-sized sample action", page.locator("#intro-sample").evaluate(
            "el => el.tagName === 'BUTTON' && el.getBoundingClientRect().height >= 44"))
        # A fresh real-player entry shows the deterministic prefix, with an explicit expansion.
        view = page.locator("#results-view")
        compact_ids = page.locator("#results > li").evaluate_all(
            "cards => cards.map(card => card.dataset.gameId)")
        before_hash = page.evaluate("location.hash")
        check(case, "five recommendations by default with visible match reason and store",
              len(compact_ids) == 5 and view.is_visible()
              and view.get_attribute("aria-pressed") == "true"
              and page.locator("#status").inner_text().startswith("5 of ")
              and "Recorded genre overlap" in page.locator("#results > li").first.inner_text()
              and page.locator("#results > li .storefront-links a").first.is_visible())
        page.screenshot(path=str(ARTIFACTS / f"http-{engine}-{label}-top-five.png"),
                        full_page=True, animations="disabled")
        view.focus()
        view.press("Enter")
        all_ids = page.locator("#results > li").evaluate_all(
            "cards => cards.map(card => card.dataset.gameId)")
        check(case, "keyboard expands complete ranking with unchanged prefix and basket",
              len(all_ids) > 5 and compact_ids == all_ids[:5]
              and view.get_attribute("aria-pressed") == "false"
              and page.evaluate("document.activeElement.id") == "results-view"
              and page.evaluate("location.hash") == before_hash)
        view.press("Enter")
        check(case, "keyboard returns to identical five without changing basket",
              page.locator("#results > li").evaluate_all(
                  "cards => cards.map(card => card.dataset.gameId)") == compact_ids
              and view.get_attribute("aria-pressed") == "true"
              and page.evaluate("location.hash") == before_hash)
        view.press("Enter")
        check(case, "keyboard restores every result in original order",
              page.locator("#results > li").evaluate_all(
                  "cards => cards.map(card => card.dataset.gameId)") == all_ids
              and view.get_attribute("aria-pressed") == "false"
              and page.evaluate("document.activeElement.id") == "results-view"
              and page.evaluate("location.hash") == before_hash)
        labels = page.locator("#results > li").evaluate_all(
            "nodes => nodes.map(card => ({game: card.querySelector('h3')?.textContent, "
            "summary: card.querySelector('summary')?.textContent}))")
        check(case, "each match explanation identifies its own game",
              len(labels) > 1
              and len({item["summary"] for item in labels}) == len(labels)
              and all(item["game"] and item["summary"] and item["game"] in item["summary"]
                      for item in labels))

        # Quantitative evidence remains reachable but is not visible until requested.
        first_card = page.locator("#results > li").first
        technical = first_card.locator(".explanation .metadata")
        why_summary = first_card.locator(".explanation summary")
        check(case, "compact result keeps seed support, fit and coverage behind details",
              first_card.locator(".affinity").count() >= 2
              and not first_card.locator(".fit strong").is_visible()
              and not first_card.locator(".affinity").first.is_visible()
              and not first_card.locator(".explanation > span.hint").is_visible()
              and technical.count() == 1
              and not technical.is_visible())
        why_summary.focus()
        why_summary.press("Enter")
        check(case, "keyboard reveals technical details with named explanation",
              first_card.locator(".explanation").evaluate("el => el.open")
              and technical.is_visible()
              and first_card.locator(".fit strong").is_visible()
              and first_card.locator(".affinity").first.is_visible()
              and first_card.locator(".explanation > span.hint").is_visible()
              and "Entity:" in technical.inner_text()
              and "Recorded platforms (not exhaustive):" in technical.inner_text()
              and page.evaluate("document.activeElement.tagName") == "SUMMARY")
        why_summary.press("Enter")
        check(case, "keyboard closes details without removing evidence or focus",
              not first_card.locator(".explanation").evaluate("el => el.open")
              and not technical.is_visible()
              and not first_card.locator(".affinity").first.is_visible()
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

        # Explicit first-screen empty start must clear starter favorites but keep
        # intentional hard filters, keyboard focus and versioned share semantics.
        page.locator('#platform').select_option('linux')
        page.locator('#coop').check()
        page.locator('#intro-empty').click()
        check(case, 'first-screen empty start keeps filters, focus and a shareable empty basket',
              page.locator('#seeds > li').count() == 0
              and page.locator('#results > li').count() == 0
              and page.locator('#platform').input_value() == 'linux'
              and page.locator('#coop').is_checked()
              and page.evaluate('document.activeElement.id') == 'search'
              and page.locator('#intro-empty').evaluate('el => el.getBoundingClientRect().height >= 44')
              and page.evaluate("JSON.parse(decodeURIComponent(location.hash.slice(8))).seeds.length === 0"))
        empty_share = page.evaluate('location.hash')
        # Use a fresh document so an interaction cannot scroll the picker into view
        # before measuring. Do not modify the main journey's shared state.
        probe = context.new_page()
        try:
            probe.goto(base_url + "/" + empty_share, wait_until="load")
            initial_picker(probe, "empty")
            probe.locator("#search").focus()
            probe.keyboard.type("Stardew Valley")
            probe.keyboard.press("Enter")
            # The deliberate empty basket retained hard filters; explicitly remove
            # those for this standalone positive journey rather than relaxing them in ranking.
            check(case, "native keyboard adds the named favorite from the empty basket",
                  probe.locator("#seeds .seed-name").all_text_contents() == ["Stardew Valley"])
            probe.locator("#platform").select_option("any")
            probe.locator("#coop").uncheck()
            check(case, "named favorite yields an actionable recommendation",
                  probe.locator("#results > li").count() > 0
                  and probe.locator("#results > li .storefront-links a").first.is_visible())
            restored_url = probe.url
            fresh = context.new_page()
            try:
                fresh.goto(restored_url, wait_until="load")
                initial_picker(fresh, "restored")
                check(case, "fresh restored picker retains the favorite and compact view",
                      fresh.locator("#seeds .seed-name").all_text_contents() == ["Stardew Valley"]
                      and fresh.locator("#results > li").count() <= 5
                      and fresh.locator("#results-view").get_attribute("aria-pressed") == "true")
            finally:
                fresh.close()
        finally:
            probe.close()
        empty_browse = page.get_by_role('button', name='Browse available games')
        check(case, 'empty results includes a native touch-sized browse recovery',
              empty_browse.is_visible()
              and empty_browse.evaluate('el => el.getBoundingClientRect().height >= 44'))
        empty_browse.click()
        check(case, 'empty recommendation recovery preserves filters and share and focuses first catalog game',
              page.locator('#catalog-browse').get_attribute('aria-expanded') == 'true'
              and page.locator('#search-results li > button').first.evaluate('el => document.activeElement === el')
              and page.locator('#platform').input_value() == 'linux'
              and page.locator('#coop').is_checked()
              and page.locator('#seeds > li').count() == 0
              and page.evaluate('location.hash') == empty_share)
        page.locator('#catalog-browse').click()
        page.locator('#intro-sample').click()
        check(case, 'sample after empty start restores default filters and results',
              page.locator('#seeds > li').count() == 2
              and page.locator('#platform').input_value() == 'any'
              and not page.locator('#coop').is_checked()
              and page.locator('#results > li').count() > 0)

        # Ordered favorites can be moved with native keyboard buttons, without
        # removing/re-adding a game (which would lose its chosen weight).
        # The share contract preserves ordered IDs, weights, mode, constraints
        # and exclusions; explicit Bridge endpoints use stable IDs.
        page.locator('#mode').select_option('blend')
        page.locator('#platform').select_option('windows')
        page.locator('#coop').check()
        first_weight = page.locator('#seeds input[type="range"]').first
        first_weight.focus()
        first_weight.press('ArrowRight')
        before_order = json.loads(unquote(page.url.split('#basket=', 1)[1]))
        down = page.get_by_role('button', name='Move Stardew Valley down', exact=True)
        up_edge = page.get_by_role('button', name='Move Stardew Valley up', exact=True)
        check(case, 'favorite order exposes edge-aware touch-sized native controls',
              page.locator('#seeds > li .seed-name').all_text_contents() == ['Stardew Valley', 'Terraria']
              and before_order['seeds'][0]['weight'] == 2
              and down.is_enabled() and not up_edge.is_enabled()
              and down.evaluate('node => node.getBoundingClientRect().height >= 44'))
        down.focus()
        down.press('Enter')
        moved_order = json.loads(unquote(page.url.split('#basket=', 1)[1]))
        moved_up = page.get_by_role('button', name='Move Stardew Valley up', exact=True)
        check(case, 'keyboard moves a favorite without altering weights or constraints',
              page.locator('#seeds > li .seed-name').all_text_contents() == ['Terraria', 'Stardew Valley']
              and moved_order == {**before_order, 'seeds': list(reversed(before_order['seeds']))}
              and page.locator('#mode').input_value() == 'blend'
              and page.locator('#platform').input_value() == 'windows'
              and page.locator('#coop').is_checked()
              and moved_up.is_enabled()
              and not page.get_by_role('button', name='Move Stardew Valley down', exact=True).is_enabled()
              and moved_up.evaluate('node => document.activeElement === node')
              and page.locator('#basket-feedback').inner_text().startswith(
                  'Moved Stardew Valley down. 2 of 5 games selected.'))
        moved_up.press('Enter')
        check(case, 'reverse move restores the exact versioned basket and stable keyboard focus',
              json.loads(unquote(page.url.split('#basket=', 1)[1])) == before_order
              and page.locator('#seeds > li .seed-name').all_text_contents() == ['Stardew Valley', 'Terraria']
              and page.get_by_role('button', name='Move Stardew Valley down', exact=True).evaluate(
                  'node => document.activeElement === node')
              and page.locator('#basket-feedback').inner_text().startswith('Moved Stardew Valley up.'))
        page.locator('#intro-sample').click()

        # Browse the actual catalog without guessing a title or genre first.
        browse = page.locator("#catalog-browse")
        browse.click()
        items = page.locator("#search-results li > button")
        check(case, "catalog browser starts with eight unselected games and observed genres",
              browse.get_attribute("aria-expanded") == "true"
              and items.count() == 8
              and page.locator("#search-results > li > span.hint").filter(has_text="Recorded genres:").count() == 8
              and page.locator("#search-results > li > span.hint").filter(
                  has_text=re.compile(r"selected gameplay facts|No reviewed gameplay facts yet")).count() == 8
              and "Recorded genres:" in page.locator("#search-results").inner_text()
              and f"1–8 of {expected_count - 2} available catalog profiles" in page.locator("#search-hint").inner_text()
              and page.locator("#seeds > li").count() == 2)
        first_page = items.all_text_contents()
        more = page.get_by_role("button", name="Next page", exact=True)
        more.focus()
        more.press("Enter")
        check(case, "next page bounds the DOM and focuses the first new game",
              items.count() == 8 and set(first_page).isdisjoint(items.all_text_contents())
              and items.first.evaluate("node => document.activeElement === node")
              and f"9–16 of {expected_count - 2} available catalog profiles" in page.locator("#search-hint").inner_text())
        page.get_by_role("button", name="Previous page", exact=True).click()
        check(case, "previous page restores original order without changing the basket",
              items.all_text_contents() == first_page
              and page.get_by_role("button", name="Previous page", exact=True).is_disabled()
              and page.locator("#seeds > li").count() == 2)
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
        # Verify each appended identity on the same default release, by exact store URL.
        late_hash = page.evaluate("location.hash")
        for name, app in (("Half-Life 2", 220), ("Portal", 400), ("Left 4 Dead", 500), ("Left 4 Dead 2", 550),
                          *([("Hades II", 1145350), ("Deep Rock Galactic", 548430)] if expected_count == 51 else [])):
            url = f"https://store.steampowered.com/app/{app}"
            page.locator("#search").fill(url)
            row = page.locator("#search-results > li")
            check(case, f"late-catalog store discovery: {name}",
                  row.count() == 1 and row.get_by_role("button", name=f"Add {name}", exact=True).count() == 1
                  and row.locator(f'a[href="{url}"]').count() == 1
                  and "No reviewed gameplay facts yet" in row.inner_text()
                  and page.evaluate("location.hash") == late_hash)
        page.locator("#search").fill("no-such-playmancer-title")
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
        # Search is for discovering a named favorite: an explicit title hit
        # must not be buried by earlier catalog entries matching only genres.
        # The ranker's scores, filters and versioned basket stay untouched.
        hash_before_identity_search = page.evaluate("location.hash")
        page.locator("#search").fill("adventure")
        ordered_hits = page.locator("#search-results li > button")
        check(case, "title identity match precedes genre-only matches on broad queries",
              ordered_hits.count() >= 3
              and ordered_hits.first.get_attribute("aria-label") == "Add Hunter Adventure"
              and ordered_hits.nth(1).get_attribute("aria-label") == "Add Infamous 2"
              and ordered_hits.first.get_attribute("aria-describedby") is None
              and ordered_hits.nth(1).get_attribute("aria-describedby") is not None
              and page.evaluate("location.hash") == hash_before_identity_search
              and page.locator("#seeds > li").count() == 2
              and page.evaluate("document.activeElement.id") == "search")
        # A selected identity match may coexist with other addable results.
        # Never report it as missing or add it twice; keep remaining matches.
        page.get_by_role("button", name="Add Hunter Adventure", exact=True).click()
        selected_hash = page.evaluate("location.hash")
        page.locator("#search").fill("adventure")
        check(case, "already-selected title stays disclosed among other addable matches",
              "Already in basket: Hunter Adventure." in hint.inner_text()
              and "matching catalog profiles" in hint.inner_text()
              and page.get_by_role("button", name="Add Hunter Adventure", exact=True).count() == 0
              and page.get_by_role("button", name="Add Infamous 2", exact=True).count() == 1
              and page.locator("#seeds > li").count() == 3
              and page.evaluate("location.hash") == selected_hash
              and page.evaluate("document.activeElement.id") == "search")
        page.get_by_role("button", name="Remove Hunter Adventure", exact=True).click()
        check(case, "removing selected search identity restores basket without hidden state change",
              page.locator("#seeds > li").count() == 2
              and page.get_by_role("button", name="Add Hunter Adventure", exact=True).count() == 1)
        # Guard the real deployed player, not merely the offline Gameplay Facts
        # explorer or synthetic fixture. Source-backed positives are partial
        # discovery evidence; a missing observation must never imply absence.
        # A player should find real titles even when omitting their punctuation.
        # Name matches are not gameplay-fact claims or inferred tag coverage.
        page.locator("#search").fill("Papers Please")
        papers = page.get_by_role("button", name="Add Papers, Please", exact=True)
        check(case, "punctuation-free title finds Papers, Please without fake evidence",
              papers.count() == 1 and page.locator("#search-results li").count() == 1
              and papers.get_attribute("aria-describedby") is None
              and page.locator("#seeds > li").count() == 2)
        page.locator("#search").fill("FTL Faster Than Light")
        ftl = page.get_by_role("button", name="Add FTL: Faster Than Light", exact=True)
        check(case, "colon-free title finds FTL: Faster Than Light without fake evidence",
              ftl.count() == 1 and page.locator("#search-results li").count() == 1
              and ftl.get_attribute("aria-describedby") is None
              and page.evaluate("document.activeElement.id") == "search")
        page.locator("#search").fill("Automating production")
        fact_matches = page.locator("#search-results li")
        factorio_hit = page.get_by_role("button", name="Add Factorio", exact=True)
        fact_hint = fact_matches.locator(".hint")
        fact_id = factorio_hit.get_attribute("aria-describedby") if factorio_hit.count() == 1 else None
        check(case, "production gameplay-fact search finds Factorio with accessible partial evidence",
              fact_matches.count() == 1
              and factorio_hit.count() == 1
              and fact_hint.count() == 1
              and fact_hint.inner_text().strip() ==
                  "Recorded gameplay fact (partial evidence): Automating production. Other facts may be unrecorded."
              and fact_id is not None
              and fact_id == fact_hint.get_attribute("id")
              and "matching catalog profiles" in hint.inner_text()
              and page.locator("#seeds > li").count() == 2
              and page.evaluate("document.activeElement.id") == "search")
        # A matched positive fact must lead to the exact version-pinned observation
        # and its public source, without adding a game or changing basket state.
        fact_source = fact_matches.locator("a.fact-compare-link")
        fact_href = fact_source.get_attribute("href") if fact_source.count() == 1 else ""
        fact_fragment = urlsplit(fact_href).fragment
        fact_state = (json.loads(unquote(fact_fragment[len("facts="):]))
                      if fact_fragment.startswith("facts=") else {})
        check(case, "matched fact has a source link with exact game/tag and evidence revision",
              fact_source.count() == 1
              and fact_source.get_attribute("target") == "_blank"
              and "noopener" in (fact_source.get_attribute("rel") or "")
              and "noreferrer" in (fact_source.get_attribute("rel") or "")
              and fact_state.get("pair") == []
              and fact_state.get("query") == "wikidata:q16972008"
              and fact_state.get("tag") == "mechanic:automation"
              and fact_state.get("catalog") == catalog_id
              and len(fact_state.get("evidence", "")) == 40)
        with context.expect_page() as source_popup:
            fact_source.click()
        source_page = source_popup.value
        source_page.wait_for_load_state("load")
        source_card = source_page.locator('#observation-games article[data-game-id="wikidata:q16972008"]')
        if source_card.count() == 1:
            source_card.get_by_text("Inspect sources for Factorio").click()
        check(case, "fact search opens Factorio's recorded source without changing the basket",
              source_page.url.startswith(base_url + "/observations.html#facts=")
              and source_page.locator("#link-error").is_hidden()
              and source_page.locator("#observation-games article").count() == 1
              and source_card.count() == 1
              and source_card.locator("details a[href^='https://']").count() >= 1
              and page.locator("#seeds > li").count() == 2)
        source_page.close()
        page.locator("#search").fill("unrecorded fictitious mechanic")
        check(case, "unrecorded gameplay facts remain unknown, not negative evidence",
              page.locator("#search-results li").count() == 0
              and "unrecorded facts remain unknown" in hint.inner_text()
              and page.locator("#seeds > li").count() == 2)
        # A real no-match query offers explicit catalog browsing, without
        # weakening required filters or changing the versioned basket URL.
        no_match_hash = page.evaluate("location.hash")
        no_match_filters = (page.locator("#mode").input_value(),
                            page.locator("#platform").input_value(),
                            page.locator("#coop").is_checked())
        browse_recovery = page.locator("#search-all-stores")
        check(case, "no-match search exposes a keyboard-accessible catalog recovery",
              browse_recovery.is_visible()
              and browse_recovery.inner_text() == "Browse available games"
              and browse_recovery.evaluate("node => node.getBoundingClientRect().height >= 44"))
        browse_recovery.focus()
        browse_recovery.press("Enter")
        check(case, "no-match recovery opens all games with first-result focus and unchanged basket",
              page.locator("#search").input_value() == ""
              and page.locator("#store-filter").input_value() == "all"
              and page.locator("#catalog-browse").get_attribute("aria-expanded") == "true"
              and page.locator("#search-results li > button").count() == 8
              and page.get_by_role("button", name="Next page", exact=True).is_enabled()
              and page.locator("#search-results li > button").first.evaluate(
                  "node => document.activeElement === node")
              and page.evaluate("location.hash") == no_match_hash
              and (page.locator("#mode").input_value(),
                   page.locator("#platform").input_value(),
                   page.locator("#coop").is_checked()) == no_match_filters
              and page.locator("#seeds > li").count() == 2)
        page.locator("#search").fill("Factorio")
        check(case, "direct game-name lookup does not claim a gameplay-fact match",
              page.get_by_role("button", name="Add Factorio", exact=True).count() == 1
              and page.get_by_role("button", name="Add Factorio", exact=True).get_attribute("aria-describedby") is None)
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
        # Native Tab, not a scripted focus shortcut, must enter the actionable row.
        # Compare the browser's default scroll-container behavior with the fix.
        # The temporary DOM mutation is diagnostic only; restore it before acceptance.
        search = page.locator("#search")
        result_list = page.locator("#search-results")
        check(case, "actionable catalog list is excluded from redundant sequential focus",
              result_list.get_attribute("tabindex") == "-1")
        if engine == "firefox" and not HOSTED_URL:
            result_list.evaluate("node => node.removeAttribute('tabindex')")
            try:
                search.focus()
                baseline_before = search_focus_snapshot(page)
                page.keyboard.press("Tab")
                print(json.dumps({"case": case, "catalog": expected_count, "query": "Hades",
                                  "native_container_control": {"before": baseline_before,
                                                               "after": search_focus_snapshot(page)}}))
            finally:
                result_list.evaluate("node => node.setAttribute('tabindex', '-1')")
        search.focus()
        before = search_focus_snapshot(page)
        page.keyboard.press("Tab")
        after = search_focus_snapshot(page)
        check(case, "Tab reaches the first real-catalog search result before browse actions",
              page.locator("#search-results button").first.evaluate(
                  "node => document.activeElement === node"), {"before": before, "after": after})
        if expected_count == 51:
            # Tab through actual links/buttons, including the later row in the scrollport.
            target = page.get_by_role("button", name="Add Hades II", exact=True)
            steps = 0
            while not target.evaluate("node => document.activeElement === node") and steps < 12:
                page.keyboard.press("Tab")
                steps += 1
            check(case, "native Tab reaches and scrolls the later Hades II action",
                  target.evaluate("""node => {
                      const r = node.getBoundingClientRect();
                      const list = node.closest('#search-results');
                      const box = list.getBoundingClientRect();
                      return document.activeElement === node && r.top >= box.top - 2
                             && r.bottom <= box.bottom + 2;
                  }"""), search_focus_snapshot(page))
            search.fill("https://store.steampowered.com/app/1145350")
            search.focus()
            before = search_focus_snapshot(page)
            page.keyboard.press("Tab")
            check(case, "single exact Hades II URL retains native first-result focus",
                  page.locator("#search-results li > button").count() == 1
                  and target.evaluate("node => document.activeElement === node"),
                  {"before": before, "after": search_focus_snapshot(page)})
        search.focus()
        # Search suggestions remain native buttons: Tab still works, while
        # Arrow Down/Up/Escape provide a keyboard-only fast path without
        # fabricating combobox or active-descendant semantics.
        page.locator("#search").fill("e")
        # Broad searches must not bury the basket under every matching game.
        # Paging is discovery-only: the shared basket must remain untouched.
        first_page = page.locator("#search-results li > button")
        hash_before_search_paging = page.evaluate("location.hash")
        next_page = page.get_by_role("button", name="Next page", exact=True)
        check(case, "broad search starts with eight options and an explicit next-page action",
              first_page.count() == 8
              and next_page.is_enabled()
              and "1–8 of " in page.locator("#search-hint").inner_text())
        first_labels = first_page.all_text_contents()
        next_page.click()
        check(case, "next search page preserves the query and focuses the first new game",
              0 < first_page.count() <= 8
              and set(first_labels).isdisjoint(first_page.all_text_contents())
              and first_page.first.evaluate("node => document.activeElement === node")
              and "9–" in page.locator("#search-hint").inner_text()
              and page.locator("#search").input_value() == "e"
              and page.evaluate("location.hash") == hash_before_search_paging)
        page.locator("#search").fill("Hades")
        check(case, "typing a new query resets pagination and preserves distinct title matches",
              page.locator("#search-results li > button").count() == (2 if expected_count == 51 else 1)
              and page.get_by_role("button", name="Add Hades", exact=True).count() == 1
              and (expected_count != 51 or page.get_by_role("button", name="Add Hades II", exact=True).count() == 1))
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
        # A suggested game can become a new favorite without retyping its
        # name. The clicked card disappears, but focus remains in the results.
        candidate = page.locator("#results > li").first
        candidate_id = candidate.get_attribute("data-game-id")
        candidate_name = candidate.locator("h3").inner_text()
        add_result = candidate.get_by_role("button", name=f"Add to favorites: {candidate_name}")
        check(case, "ranked result exposes a touch-sized named add-to-favorites action",
              add_result.is_visible() and add_result.is_enabled()
              and add_result.evaluate("node => node.getBoundingClientRect().height >= 44"))
        add_result.focus()
        add_result.press("Enter")
        refreshed = page.locator("#results > li").first
        refreshed_id = refreshed.get_attribute("data-game-id")
        check(case, "recommendation becomes a weighted favorite and retains keyboard focus",
              page.locator("#seeds > li").count() == 3
              and candidate_id not in page.locator("#results > li").evaluate_all(
                  "nodes => nodes.map(node => node.dataset.gameId)")
              and feedback.inner_text().startswith(f"Added {candidate_name}. 3 of 5 games selected.")
              and refreshed_id != candidate_id
              and page.evaluate("document.activeElement.closest('[data-game-id]')?.dataset.gameId") == refreshed_id)
        promoted = json.loads(unquote(page.url.split("#basket=", 1)[1]))
        check(case, "promoted favorite is appended once with weight one and unchanged filters",
              promoted["seeds"][-1] == {"id": candidate_id, "weight": 1}
              and promoted["platform"] == "any" and not promoted["coopOnly"]
              and candidate_id not in promoted["excluded"])
        page.get_by_role("button", name=f"Remove {candidate_name}").click()
        check(case, "removing promoted favorite restores the suggestion and search focus",
              page.locator("#seeds > li").count() == 2
              and page.locator(f'[data-game-id="{candidate_id}"]').count() == 1
              and page.evaluate("document.activeElement.id") == "search")
        # At capacity, suggestions remain inspectable/hideable but cannot
        # exceed the five-favorite limit or silently replace another favorite.
        original = json.loads(unquote(page.url.split("#basket=", 1)[1]))
        extra_ids = page.locator("#results > li").evaluate_all(
            "nodes => nodes.slice(0, 3).map(node => node.dataset.gameId)")
        check(case, "catalog has three distinct suggestions for the capacity regression",
              len(extra_ids) == 3 and len(set(extra_ids)) == 3)
        full = {**original, "seeds": original["seeds"] +
                [{"id": game_id, "weight": 1} for game_id in extra_ids]}
        page.evaluate("""s => {
            history.replaceState(null, '', '#basket=' + encodeURIComponent(JSON.stringify(s)));
            window.dispatchEvent(new Event('hashchange'));
        }""", full)
        check(case, "five-favorite basket disables all result promotions without hiding explanations",
              page.locator("#seeds > li").count() == 5
              and page.locator("#results > li").count() > 0
              and all(page.locator(".add-result").evaluate_all("nodes => nodes.map(n => n.disabled)"))
              and page.locator("#results > li .explanation summary").first.is_visible())
        # A full basket disables Add but must not strand native storefront/evidence links.
        page.locator("#search").fill("e")
        page.locator("#search").focus()
        active_link = page.locator("#search-results a[href]").first
        full_before = search_focus_snapshot(page)
        page.keyboard.press("Tab")
        check(case, "full basket Tab skips disabled Add actions and reaches a real link",
              active_link.count() == 1 and active_link.evaluate("node => document.activeElement === node")
              and page.locator("#search-results").get_attribute("tabindex") == "-1"
              and all(page.locator("#search-results li > button").evaluate_all("nodes => nodes.map(n => n.disabled)")),
              {"before": full_before, "after": search_focus_snapshot(page)})
        page.evaluate("""s => {
            history.replaceState(null, '', '#basket=' + encodeURIComponent(JSON.stringify(s)));
            window.dispatchEvent(new Event('hashchange'));
        }""", original)
        check(case, "capacity test restores original weighted basket without a fallback",
              page.locator("#seeds > li").count() == 2)
        page.locator("#search").fill("")
        check(case, "clearing search restores the discoverable instruction",
              hint.inner_text() == "Search titles, genres, gameplay facts or store links."
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
        # Missing co-op evidence must abstain, but players need a direct path
        # from the empty results panel to the named uncertainty explanations.
        review = page.locator("#empty").get_by_role(
            "button", name=re.compile(r"^Review [0-9]+ uncertain games$"))
        check(case, "strict co-op unknowns expose a keyboard-accessible explanation action",
              page.locator("#results > li").count() == 0
              and page.locator("#empty").is_visible()
              and review.is_visible()
              and review.get_attribute("aria-controls") == "uncertainty"
              and page.locator("#coop").is_checked()
              and page.locator("#platform").input_value() == "windows")
        strict_hash = page.evaluate("location.hash")
        review.focus()
        review.press("Enter")
        check(case, "empty-state evidence review opens uncertainty and keeps strict basket intact",
              page.locator("#uncertainty").evaluate("node => node.open")
              and page.evaluate("document.activeElement.id") == "uncertainty-title"
              and page.evaluate("location.hash") == strict_hash
              and page.locator("#coop").is_checked()
              and page.locator("#platform").input_value() == "windows")
        # Source-backed outbound navigation never converts an unknown filter
        # into a passing candidate or changes the exact shared basket.
        hades_row = page.locator("#partition-list li").filter(has_text="Uncertain · Hades:")
        hades_store = hades_row.locator(".storefront-links a")
        check(case, "strict-filter unknown Hades has a safe recorded store inspection link",
              hades_row.count() == 1
              and hades_store.count() == 1
              and hades_store.get_attribute("href") == "https://store.steampowered.com/app/1145360"
              and hades_store.get_attribute("target") == "_blank"
              and "noopener" in (hades_store.get_attribute("rel") or "")
              and "noreferrer" in (hades_store.get_attribute("rel") or "")
              and page.evaluate("location.hash") == strict_hash
              and page.locator("#results > li").count() == 0
              and page.locator("#coop").is_checked())
        # Hosted/loopback Chromium, Firefox and WebKit inspect the same
        # version-pinned evidence jump from an abstained game.
        fact_jump = hades_row.get_by_role("link", name="Inspect available gameplay evidence for Hades (new tab)")
        fact_href = fact_jump.get_attribute("href") if fact_jump.count() == 1 else ""
        fact_state = (json.loads(unquote(fact_href.split("#facts=", 1)[1]))
                      if "#facts=" in fact_href else {})
        fact_entry = page.locator("#observation-explorer-entry")
        check(case, "strict-filter unknown exposes pinned gameplay evidence without becoming eligible",
              fact_jump.count() == 1
              and "partial or unknown; not compatibility proof" in hades_row.inner_text()
              and fact_state.get("query") == "wikidata:q59756366"
              and fact_state.get("pair") == [] and fact_state.get("tag") == ""
              and fact_state.get("catalog") == fact_entry.get_attribute("data-observation-catalog")
              and fact_state.get("version") == fact_entry.get_attribute("data-observation-version")
              and fact_state.get("evidence") == fact_entry.get_attribute("data-observation-evidence")
              and fact_jump.get_attribute("target") == "_blank"
              and fact_jump.get_attribute("rel") == "noopener noreferrer"
              and page.evaluate("location.hash") == strict_hash
              and page.locator("#results > li").count() == 0)
        page.locator("#coop").uncheck()
        page.locator("#platform").select_option("any")
        summary = page.locator("#results > li .explanation summary").first
        summary.focus()
        summary.press("Enter")
        explanation = page.locator("#results > li .explanation").first
        check(case, "keyboard opens named explanation and retains focus",
              explanation.evaluate("el => el.open")
              and page.evaluate("document.activeElement.tagName") == "SUMMARY"
              and "equal-weight genre proxy (not used for ranking)" in explanation.inner_text()
              and "Residual genres:" in explanation.inner_text())

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
        # Native selects may truncate a label; the full selected option must
        # remain visible without duplicating its accessible name.
        bridge_controls = ("bridge-start", "bridge-end", "bridge-hops", "bridge-threshold")
        check(case, "Bridge selections show full wrap-capable text readback",
              all(page.locator(f"#{control}-readback").inner_text() ==
                  "Selected: " + (page.locator(f"#{control} option:checked").text_content() or "").strip()
                  and page.locator(f"#{control}-readback").get_attribute("aria-hidden") == "true"
                  for control in bridge_controls))
        # The 51-profile release uses the asynchronous same-origin Bridge worker.
        page.wait_for_function("document.querySelector('#bridge-steps').getAttribute('aria-busy') !== 'true'")
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
        check(case, "explicit exclusion offers a nearby, count-labelled 44px recovery action",
              page.locator(f'[data-game-id="{hidden_id}"]').count() == 0
              and page.locator("#restore").is_visible()
              and page.locator("#restore").inner_text() == "Restore 1 hidden game"
              and page.locator("#restore").evaluate(
                  "node => node.parentElement?.id === 'recommendations' && node.getBoundingClientRect().height >= 44"))
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
              and restored.locator("#restore").inner_text() == "Restore 1 hidden game"
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
        original_copy = restored.locator(".intro > p").evaluate(
            "node => parseFloat(getComputedStyle(node).fontSize)")
        original_button = restored.locator("#intro-sample").evaluate(
            "node => parseFloat(getComputedStyle(node).fontSize)")
        bridge_type_baseline = restored.locator("#bridge-lab").evaluate("""panel => {
            const size = selector => parseFloat(getComputedStyle(panel.querySelector(selector)).fontSize);
            return {
                heading: size("#bridge-title"),
                eyebrow: size(".eyebrow"),
                intro: size(":scope > .hint"),
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
                    copy: parseFloat(getComputedStyle(document.querySelector('.intro > p')).fontSize),
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
                            intro: size(":scope > .hint"),
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
                        const button = document.querySelector('#search');
                        const copy = document.querySelector('.intro > p');
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
                        return {id: node.id, left: box.left, right: box.right,
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
                check(case, "400% mobile search is fully visible before secondary copy",
                      first["precedesCopy"] and first["top"] >= 0
                      and first["height"] >= 44
                      and first["bottom"] <= first["viewportHeight"] + 1,
                      details=first)
            check(case, f"{text_size}% root text enlarges recommendation score and evidence text",
                  all(enlarged["resultType"][name] >= original * factor - 1
                      for name, original in result_type_baseline.items()),
                  details={"baseline": result_type_baseline, "enlarged": enlarged["resultType"]})
            # Bridge static copy is viewport-capped like the heading. At 400%
            # on narrow screens, a strict 4x font-size rule would break words
            # inside the label and warning, despite no page overflow.
            # This bounded rule retains text growth and whole-word reflow.
            bridge_heading_floor = min(bridge_type_baseline["heading"] * factor,
                                       enlarged["viewport"] * .17)
            bridge_copy_floors = {
                "eyebrow": min(bridge_type_baseline["eyebrow"] * factor,
                               enlarged["viewport"] * .07),
                "intro": min(bridge_type_baseline["intro"] * factor,
                             enlarged["viewport"] * .07),
                "warning": min(bridge_type_baseline["warning"] * factor,
                               enlarged["viewport"] * .09),
            }
            check(case, f"{text_size}% root text retains readable Bridge hierarchy and reflow",
                  enlarged["bridgeType"]["heading"] >= bridge_heading_floor - 1
                  and enlarged["bridgeType"]["heading"] >= enlarged["bridgeType"]["warning"]
                  and enlarged["bridgeType"]["warning"] >= enlarged["bridgeType"]["eyebrow"]
                  and all(enlarged["bridgeType"][name] >= minimum - 1
                          for name, minimum in bridge_copy_floors.items()),
                  details={"baseline": bridge_type_baseline, "enlarged": enlarged["bridgeType"],
                           "bridge_heading_floor": bridge_heading_floor,
                           "copy_floors": bridge_copy_floors})
            if text_size == 400 and enlarged["viewport"] <= 640:
                # Real Chromium/Firefox/WebKit root-text stress at 390 AND 320px.
                # Page overflow can be zero even when individual tab words
                # fracture. Check each character's rendered line position.
                for nav_width in (320, width):
                    restored.set_viewport_size({"width": nav_width, "height": height})
                    restored.evaluate(
                        "() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))")
                    nav = restored.locator("#quick-nav").evaluate("""panel => {
                        const box = panel.getBoundingClientRect();
                        const range = document.createRange();
                        const labels = [...panel.querySelectorAll("button")].map(node => {
                            const word = node.textContent.trim(), text = node.firstChild;
                            const tops = new Set();
                            for (let i = 0; i < word.length; i++) {
                                range.setStart(text, i);
                                range.setEnd(text, i + 1);
                                tops.add(Math.round(range.getBoundingClientRect().top));
                            }
                            const rect = node.getBoundingClientRect();
                            return {
                                word, broken: tops.size !== 1, height: rect.height,
                                left: rect.left, right: rect.right,
                                clipped: node.scrollWidth > node.clientWidth + 1,
                                selected: node.classList.contains("primary")
                            };
                        });
                        return {
                            visible: getComputedStyle(panel).display !== "none",
                            labels, left: box.left, right: box.right,
                            scrollWidth: document.documentElement.scrollWidth,
                            viewport: innerWidth,
                            rootSize: parseFloat(getComputedStyle(document.documentElement).fontSize)
                        };
                    }""")
                    check(case, f"400% section tabs retain whole words and touch targets at {nav_width}px",
                          nav["visible"] and nav["rootSize"] >= 63
                          and [item["word"] for item in nav["labels"]] ==
                              ["Basket", "Results", "Bridge"]
                          and all(not item["broken"] and not item["clipped"]
                                  and item["height"] >= 44
                                  and item["left"] >= nav["left"] - 1
                                  and item["right"] <= nav["right"] + 1
                                  for item in nav["labels"])
                          and sum(item["selected"] for item in nav["labels"]) == 1
                          and nav["scrollWidth"] <= nav["viewport"] + 1,
                          details=nav)
                restored.set_viewport_size({"width": width, "height": height})
                restored.evaluate(
                    "() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))")
                broken = restored.locator("#bridge-lab").evaluate("""panel => {
                    const results = {};
                    for (const [name, selector] of Object.entries({
                        eyebrow: ":scope > .eyebrow",
                        intro: ":scope > .hint",
                        warning: ":scope > .bridge-warning"
                    })) {
                        const text = panel.querySelector(selector).firstChild;
                        const value = text.textContent, range = document.createRange();
                        let cursor = 0;
                        const fragments = [];
                        for (const word of value.match(/\\S+/g) || []) {
                            const start = value.indexOf(word, cursor);
                            const tops = new Set();
                            for (let i = 0; i < word.length; i++) {
                                range.setStart(text, start + i);
                                range.setEnd(text, start + i + 1);
                                tops.add(Math.round(range.getBoundingClientRect().top));
                            }
                            if (tops.size > 1) fragments.push(word);
                            cursor = start + word.length;
                        }
                        results[name] = fragments;
                    }
                    return results;
                }""")
                check(case, "400% Bridge static label and explanation keep whole words",
                      all(not words for words in broken.values()), details=broken)
            check(case, f"{text_size}% root text reflows without horizontal action clipping",
                  enlarged["scrollWidth"] <= enlarged["viewport"] + 1
                  and len(enlarged["actions"]) == 5
                  and {action["id"] for action in enlarged["actions"]} ==
                      {"intro-sample", "intro-browse", "intro-empty", "intro-bridge", "intro-library"}
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
                readback_geometry = restored.locator("#bridge-lab .bridge-choice-readback").evaluate_all("""nodes =>
                    nodes.map(node => {
                        const box = node.getBoundingClientRect();
                        const parent = node.closest("label").getBoundingClientRect();
                        return {
                            text: node.textContent, left: box.left, right: box.right,
                            labelLeft: parent.left, labelRight: parent.right,
                            overflow: node.scrollWidth - node.clientWidth
                        };
                    })""")
                check(case, "400% Bridge shows unclipped selected labels, not just ellipsized options",
                      len(readback_geometry) == 4
                      and all(item["text"].startswith("Selected: ")
                              and item["left"] >= item["labelLeft"] - 1
                              and item["right"] <= item["labelRight"] + 1
                              and item["overflow"] <= 1
                              for item in readback_geometry),
                      details=readback_geometry)
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

        if label == "mobile":
            # Browser zoom can reduce the CSS viewport height to a few hundred
            # pixels. A tall multi-row sticky nav would cover the reading area.
            # Test real short-viewport geometry in addition to root-text reflow.
            original_hash = restored.evaluate("location.hash")
            restored.set_viewport_size({"width": 320, "height": 240})
            restored.evaluate(
                "() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))")
            short_nav = restored.locator("#quick-nav").evaluate("""panel => ({
                position: getComputedStyle(panel).position,
                visible: getComputedStyle(panel).display !== 'none',
                tabs: [...panel.querySelectorAll('button')].map(button => ({
                    label: button.textContent.trim(),
                    height: button.getBoundingClientRect().height,
                    clipped: button.scrollWidth > button.clientWidth + 1
                })),
                width: document.documentElement.scrollWidth,
                viewport: innerWidth
            })""")
            check(case, "400% text in a short zoomed viewport does not pin the navigation over content",
                  short_nav["visible"] and short_nav["position"] == "static"
                  and [tab["label"] for tab in short_nav["tabs"]] ==
                      ["Basket", "Results", "Bridge"]
                  and all(tab["height"] >= 44 and not tab["clipped"]
                          for tab in short_nav["tabs"])
                  and short_nav["width"] <= short_nav["viewport"] + 1,
                  details=short_nav)
            # Focus alone can pass even when a 6rem scroll-margin positions
            # the heading below the entire 240px viewport at 400% root text.
            for jump_id, heading_id in (
                ("jump-basket", "basket-title"),
                ("jump-results", "recommendations"),
                ("jump-bridge", "bridge-title"),
            ):
                restored.locator(f"#{jump_id}").click()
                heading_geometry = restored.locator(f"#{heading_id}").evaluate("""heading => {
                    const rect = heading.getBoundingClientRect();
                    return {
                        top: rect.top, bottom: rect.bottom,
                        viewportHeight: innerHeight,
                        scrollMarginTop: getComputedStyle(heading).scrollMarginTop
                    };
                }""")
                check(case, f"short-viewport {jump_id} keeps heading visible, focused and share unchanged",
                      restored.evaluate("document.activeElement.id") == heading_id
                      and heading_geometry["top"] >= -1
                      and heading_geometry["top"] < heading_geometry["viewportHeight"]
                      and heading_geometry["bottom"] > 0
                      and restored.evaluate("location.hash") == original_hash,
                      details=heading_geometry)
            restored.screenshot(
                path=str(ARTIFACTS / f"http-{engine}-{label}-short-height-text400.png"),
                animations="disabled")
            restored.set_viewport_size({"width": width, "height": height})

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
        sparse_add = sparse.get_by_role("button", name="Add Hades", exact=True)
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
            # A narrow desktop viewport is not a touchscreen. Use a separate
            # mobile-emulated context so this 4x probe can test actual touch
            # panning, not merely capture a clipped visual viewport.
            magnified_context = browser.new_context(
                viewport={"width": width, "height": height},
                reduced_motion="reduce", is_mobile=True, has_touch=True)
            magnified_context.on("page", lambda pg: pg.on(
                "pageerror", lambda error: errors.append(str(error))))
            magnified_context.on(
                "request", lambda request: external_requests.append(request.url)
                if (urlsplit(request.url).scheme, urlsplit(request.url).netloc) != origin else None)
            magnified = magnified_context.new_page()
            scale_session = None
            try:
                magnified.goto(base_url + "/", wait_until="load")
                magnified.wait_for_function("document.querySelectorAll('#seeds > li').length >= 2")
                scale_session = magnified_context.new_cdp_session(magnified)
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
                # A 4x pinch-like view intentionally shows only a quarter of
                # the layout width. Verify touch panning reveals the remainder;
                # clipping in this screenshot alone is not CSS overflow.
                pan_before = magnified.evaluate("""() => ({
                    left: visualViewport.offsetLeft,
                    width: visualViewport.width,
                    height: visualViewport.height
                })""")
                swipe_y = min(150, pan_before["height"] - 15)
                swipe_start = min(85, pan_before["width"] - 8)
                swipe_end = max(8, swipe_start - 76)
                for index in range(8):
                    swipe_x = swipe_start + (swipe_end - swipe_start) * index / 7
                    scale_session.send("Input.dispatchTouchEvent", {
                        "type": "touchStart" if index == 0 else "touchMove",
                        "touchPoints": [{"x": round(swipe_x), "y": round(swipe_y), "id": 1}],
                    })
                scale_session.send("Input.dispatchTouchEvent", {
                    "type": "touchEnd", "touchPoints": [],
                })
                magnified.wait_for_function(
                    "(left) => visualViewport.offsetLeft > left + 20",
                    arg=pan_before["left"], timeout=4000)
                pan_after = magnified.evaluate("""() => ({
                    left: visualViewport.offsetLeft,
                    scale: visualViewport.scale,
                    layoutOverflow: document.documentElement.scrollWidth - innerWidth,
                    layoutScrollX: scrollX
                })""")
                check(case, "400% mobile pinch view pans horizontally without page overflow",
                      pan_after["left"] > pan_before["left"] + 20
                      and abs(pan_after["scale"] - 4) < 0.05
                      and pan_after["layoutOverflow"] <= 1
                      and pan_after["layoutScrollX"] == 0,
                      details={"before": pan_before, "after": pan_after})
                magnified.screenshot(
                    path=str(ARTIFACTS / "http-chromium-mobile-page-scale400-panned.png"),
                    animations="disabled")
            finally:
                if scale_session is not None:
                    scale_session.detach()
                magnified_context.close()
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
