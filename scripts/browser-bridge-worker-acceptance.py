"""HTTP-only regression for cancellable Bridge workers on a 250-game fictional catalog.

This exercises a real Blob Worker and latest-input-wins in Chromium, not public
Pages or a physical-device responsiveness SLA. The smaller offline harnesses keep
testing synchronous fallback/algorithm parity.
"""
import json
import os
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import subprocess
from time import perf_counter
import tempfile
from threading import Thread
from urllib.parse import unquote, urlsplit

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / ".test-artifacts"
ARTIFACTS.mkdir(exist_ok=True)


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


fields = ["id", "kind", "name", "description", "aliases", "externalIds", "sourceId",
          "parentId", "mechanics", "themes", "platforms", "coop"]
catalog = {
    "schemaVersion": 1,
    "snapshotId": "synthetic-bridge-worker-250-v1",
    "kind": "synthetic",
    "sources": [{
        "id": "worker-fixture", "kind": "synthetic",
        "attribution": "Playmancer authored deterministic worker acceptance fixture",
        "rights": {"status": "synthetic", "reference": "docs/BRIDGE.md", "fields": fields},
    }],
    "games": [{
        "id": f"worker:game{i:03d}", "kind": "game",
        "name": f"Synthetic worker profile {i:03d}",
        "description": "Authored fictional profile for responsive route testing.",
        "aliases": [], "externalIds": [], "sourceId": "worker-fixture", "parentId": None,
        "mechanics": ["shared-mechanic", f"unique-{i:03d}"],
        "themes": ["shared-theme"], "platforms": ["windows"], "coop": True,
    } for i in range(250)],
}
report = {
    "revision": os.environ.get("GITHUB_SHA", os.environ.get("PLAYMANCER_REVISION", "unpublished")),
    "scope": "synthetic 250-profile Chromium over local HTTP, not a public Pages/device measurement",
    "checks": [],
    "error": None,
}


def check(name, okay, observed=None):
    report["checks"].append({"name": name, "pass": bool(okay), "observed": observed})
    if not okay:
        raise AssertionError(f"{name}: {observed!r}")


failure = None
with tempfile.TemporaryDirectory(prefix="playmancer-bridge-worker-") as tmp:
    temporary = Path(tmp)
    snapshot = temporary / "worker-catalog.json"
    snapshot.write_text(json.dumps(catalog))
    site = temporary / "site"
    try:
        subprocess.run(["node", "scripts/build-demo.mjs", str(site), "--catalog", str(snapshot)],
                       cwd=ROOT, check=True)
        subprocess.run(["python3", "scripts/pages-preflight.py", str(site)],
                       cwd=ROOT, check=True)
        server = ThreadingHTTPServer(
            ("127.0.0.1", 0), partial(QuietHandler, directory=str(site)))
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            url = f"http://127.0.0.1:{server.server_port}/"
            with sync_playwright() as p:
                launch = {"headless": True}
                if os.environ.get("PLAYWRIGHT_CHROMIUM_EXECUTABLE"):
                    launch["executable_path"] = os.environ["PLAYWRIGHT_CHROMIUM_EXECUTABLE"]
                browser = p.chromium.launch(**launch)
                try:
                    context = browser.new_context(viewport={"width": 390, "height": 844},
                                                  reduced_motion="reduce")
                    page = context.new_page()
                    errors = []
                    page.on("pageerror", lambda error: errors.append(str(error)))
                    page.add_init_script("""
                      (() => {
                        const NativeWorker = window.Worker;
                        window.__workerEvents = { started: 0, terminated: 0 };
                        // Test-only delay of actual Worker replies, not a CPU benchmark.
                        // It holds the real asynchronous computation in the busy state
                        // long enough to exercise actual keyboard/Share interactions.
                        window.__workerReplyDelayMs = 0;
                        window.Worker = class TrackedWorker extends NativeWorker {
                          constructor(...args) {
                            super(...args);
                            window.__workerEvents.started++;
                          }
                          set onmessage(callback) {
                            super.onmessage = event => {
                              const delay = window.__workerReplyDelayMs;
                              if (delay > 0) setTimeout(() => callback(event), delay);
                              else callback(event);
                            };
                          }
                          terminate() {
                            window.__workerEvents.terminated++;
                            return super.terminate();
                          }
                        };
                      })();
                    """)
                    response = page.goto(url, wait_until="load")
                    check("HTTP preview served", response is not None and response.status == 200)
                    page.wait_for_function("document.querySelectorAll('#seeds > li').length === 2")
                    check("large synthetic catalog explicitly identified",
                          "250 invented profiles" in page.locator(".intro").inner_text())
                    page.locator("#bridge-start").select_option("worker:game000")
                    page.locator("#bridge-end").select_option("worker:game001")
                    page.wait_for_function(
                        "document.querySelectorAll('#bridge-steps > li').length > 0", timeout=30000)
                    check("real worker computes equivalent supported route",
                          "connection(s)" in page.locator("#bridge-status").inner_text()
                          and page.evaluate("window.__workerEvents.started") >= 1)
                    check("worker finishes and leaves no busy state",
                          page.locator("#bridge-steps").get_attribute("aria-busy") is None)
                    # Change a route control three times within one JS task. Earlier
                    # workers must be terminated; only the final .54 result may render.
                    duration = page.evaluate("""() => {
                      const input = document.querySelector('#bridge-threshold');
                      const start = performance.now();
                      for (const value of ['0.54', '0.05', '0.54']) {
                        input.value = value;
                        input.dispatchEvent(new Event('change', { bubbles: true }));
                      }
                      return performance.now() - start;
                    }""")
                    page.wait_for_function(
                        "document.querySelector('#bridge-status').textContent.startsWith('No supported route')",
                        timeout=30000)
                    counters = page.evaluate("window.__workerEvents")
                    check("latest input wins after rapid cancellation",
                          page.locator("#bridge-threshold").input_value() == "0.54"
                          and page.locator("#bridge-steps li").count() == 0
                          and counters["started"] >= 4 and counters["terminated"] >= 4,
                          counters)
                    check("cancellation clears busy state",
                          page.locator("#bridge-steps").get_attribute("aria-busy") is None)
                    page.locator("#bridge-threshold").select_option("0.05")
                    page.wait_for_function(
                        "document.querySelectorAll('#bridge-steps > li').length > 0", timeout=30000)
                    check("route recovers without stale result",
                          "connection(s)" in page.locator("#bridge-status").inner_text())
                    # A completed .05 route is cached. Start a different .54
                    # worker and return to .05 before its message can be delivered.
                    # The cached result must cancel the superseded job, rather
                    # than allow a late result to overwrite the current controls.
                    cached_switch = page.evaluate("""() => {
                      const input = document.querySelector('#bridge-threshold');
                      const events = window.__workerEvents;
                      const before = { ...events };
                      const change = value => {
                        input.value = value;
                        input.dispatchEvent(new Event('change', { bubbles: true }));
                      };
                      change('0.54');
                      const pending = { ...events };
                      change('0.05');
                      return { before, pending, after: { ...events } };
                    }""")
                    check("cached route cancels superseded worker",
                          cached_switch["pending"]["started"] ==
                            cached_switch["before"]["started"] + 1
                          and cached_switch["after"]["terminated"] ==
                            cached_switch["pending"]["terminated"] + 1
                          and page.locator("#bridge-threshold").input_value() == "0.05"
                          and page.locator("#bridge-steps").get_attribute("aria-busy") is None
                          and "connection(s)" in page.locator("#bridge-status").inner_text(),
                          cached_switch)
                    # Exercise real keyboard and Share actions while the HTTP Worker
                    # is pending. Artificially delay only its reply callback: this
                    # creates a deterministic pending window without blocking the UI
                    # thread or pretending to measure real-device keyboard latency.
                    page.evaluate("window.__workerReplyDelayMs = 5000")
                    page.locator("#bridge-threshold").select_option("0.31")
                    page.wait_for_function(
                        "document.querySelector('#bridge-steps').getAttribute('aria-busy') === 'true'")
                    page.locator("#search").focus()
                    typing_start = perf_counter()
                    page.keyboard.type("profile 173")
                    typing_wall_ms = round((perf_counter() - typing_start) * 1000, 3)
                    check("keyboard typing filters during a pending worker",
                          page.locator("#search").input_value() == "profile 173"
                          and page.locator("#search-results li").count() == 1
                          and page.locator("#bridge-steps").get_attribute("aria-busy") == "true",
                          {"typing_wall_ms": typing_wall_ms})
                    weight = page.locator('#seeds input[type="range"]').first
                    previous_weight = int(weight.input_value())
                    delta = 1 if previous_weight < 10 else -1
                    weight.focus()
                    weight.press("ArrowRight" if delta == 1 else "ArrowLeft")
                    new_weight = int(weight.input_value())
                    check("keyboard weight change preserves pending route",
                          new_weight == previous_weight + delta
                          and page.locator("#bridge-steps").get_attribute("aria-busy") == "true",
                          {"previous": previous_weight, "updated": new_weight})
                    page.locator("#share").click()
                    pending_share = page.locator("#share-link").input_value()
                    pending_payload = json.loads(unquote(urlsplit(pending_share).fragment[len("basket="):]))
                    check("Share responds before pending worker finishes",
                          urlsplit(pending_share).fragment.startswith("basket=")
                          and pending_payload["seeds"][0]["weight"] == new_weight
                          and pending_payload["bridge"]["minSimilarity"] == 0.31
                          and page.locator("#bridge-steps").get_attribute("aria-busy") == "true")
                    page.wait_for_function(
                        "document.querySelector('#bridge-steps').getAttribute('aria-busy') === null "
                        "&& document.querySelectorAll('#bridge-steps > li').length > 0",
                        timeout=30000)
                    check("pending worker completes without losing keyboard state",
                          page.locator("#search").input_value() == "profile 173"
                          and int(weight.input_value()) == new_weight
                          and page.locator("#bridge-threshold").input_value() == "0.31")
                    page.evaluate("window.__workerReplyDelayMs = 0")
                    page.locator("#search").fill("")
                    page.locator("#bridge-threshold").select_option("0.05")
                    page.wait_for_function(
                        "document.querySelectorAll('#bridge-steps > li').length > 0", timeout=30000)
                    page.locator("#share").click()
                    share = page.locator("#share-link").input_value()
                    check("share remains usable during worker lifecycle",
                          urlsplit(share).fragment.startswith("basket="))
                    restored = context.new_page()
                    restored.goto(share, wait_until="load")
                    restored.wait_for_function(
                        "document.querySelectorAll('#bridge-steps > li').length > 0", timeout=30000)
                    check("fresh HTTP share restores route controls and result",
                          restored.locator("#bridge-threshold").input_value() == "0.05"
                          and restored.locator("#bridge-start").input_value() == "worker:game000"
                          and restored.locator("#bridge-end").input_value() == "worker:game001")
                    check("no main-page exceptions and no horizontal overflow",
                          not errors and
                          restored.evaluate("document.documentElement.scrollWidth <= innerWidth"),
                          errors)
                    restored.screenshot(
                        path=str(ARTIFACTS / "bridge-worker-mobile-250.png"),
                        full_page=True, animations="disabled")
                    report.update({"rapid_change_handler_ms": round(duration, 3),
                                   "workers": counters, "keyboard_typing_wall_ms": typing_wall_ms,
                                   "chromium_version": browser.version})
                    context.close()
                finally:
                    browser.close()
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=5)
    except Exception as error:
        failure = f"{type(error).__name__}: {error}"
report["error"] = failure
(ARTIFACTS / "bridge-worker-http.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps({"passed": sum(c["pass"] for c in report["checks"]),
                  "checks": len(report["checks"]), "error": failure}))
if failure:
    raise SystemExit(1)
