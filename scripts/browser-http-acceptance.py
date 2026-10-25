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
        subprocess.run(["node", "scripts/build-demo.mjs"], cwd=ROOT, check=True)
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
        check(case, "working first-screen sample and fictional label",
              page.locator("#seeds > li").count() >= 2 and "fictional" in page.locator(".badge").inner_text().lower()
              and page.locator("#intro-sample").is_visible())
        check(case, "native touch-sized sample action", page.locator("#intro-sample").evaluate(
            "el => el.tagName === 'BUTTON' && el.getBoundingClientRect().height >= 44"))
        check(case, "list-first results and explanatory evidence",
              page.locator("#results > li").count() > 0
              and "Evidence coverage" in page.locator("#results > li").first.inner_text())
        labels = page.locator("#results > li").evaluate_all(
            "nodes => nodes.map(card => ({game: card.querySelector('h3')?.textContent, "
            "summary: card.querySelector('summary')?.textContent}))")
        check(case, "each match explanation identifies its own game",
              len(labels) > 1
              and len({item["summary"] for item in labels}) == len(labels)
              and all(item["game"] and item["summary"] and item["game"] in item["summary"]
                      for item in labels))

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
        # Ember Circuit is already in the initial basket and deliberately
        # excluded from suggestions; exercise a different catalog game.
        page.locator("#search").fill("Grove")
        check(case, "matching search count updates while retaining keyboard access",
              "matching fictional profiles" in hint.inner_text()
              and page.locator("#search-results button").count() > 0
              and page.evaluate("document.activeElement.id") == "search")
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
        remove = page.get_by_role("button", name=f"Remove {added_name}")
        remove.focus()
        remove.press("Enter")
        check(case, "keyboard remove announces the named favorite and preserves search focus",
              page.locator("#seeds > li").count() == 2
              and feedback.inner_text().startswith(f"Removed {added_name}. 2 of 5 games selected.")
              and page.evaluate("document.activeElement.id") == "search")
        page.locator("#search").fill("")
        check(case, "clearing search restores the discoverable instruction",
              "Type a game name" in hint.inner_text()
              and page.locator("#search-results li").count() == 0)

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
        ids = page.locator("#bridge-start option").evaluate_all(
            "nodes => nodes.map(el => el.value).filter(Boolean)")
        check(case, "Bridge exposes explicit basket endpoints", len(ids) >= 2)
        page.locator("#bridge-start").select_option(ids[0])
        page.locator("#bridge-end").select_option(ids[1])
        page.locator("#bridge-threshold").select_option("0.05")
        check(case, "sample Bridge exposes supported steps and evidence",
              page.locator("#bridge-steps li").count() > 0
              and "comparable evidence" in page.locator("#bridge-steps").first.inner_text().lower())

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
