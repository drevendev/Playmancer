"""Deterministic synthetic Bridge latency evidence in Chromium, never an SLA.

Each sample changes a supported threshold before selecting the second endpoint, so
Bridge's one-entry cache cannot turn repeated measurements into cache hits. The
synchronous change-handler duration and a queued timer's delay are recorded
separately; neither substitutes for input-event latency on a real player device.
"""
import json
import math
import os
from pathlib import Path
import statistics
import subprocess
import tempfile

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / ".test-artifacts"
ARTIFACTS.mkdir(exist_ok=True)
REPORT = ARTIFACTS / "bridge-performance.json"
SIZES = (12, 50, 250)
TOPOLOGIES = ("dense", "sparse", "disconnected")
REPETITIONS = 7
REVISION = os.environ.get("GITHUB_SHA", os.environ.get("PLAYMANCER_REVISION", "unpublished"))
RIGHTS_FIELDS = ["id", "kind", "name", "description", "aliases", "externalIds",
                 "sourceId", "parentId", "mechanics", "themes", "platforms", "coop"]


def synthetic_catalog(size, topology):
    games = []
    for i in range(size):
        if topology == "dense":
            group = "all"
        elif topology == "sparse":
            group = "g0" if i < 2 else f"g{i % 8}"
        elif topology == "disconnected":
            group = f"g{i % 2}"
        else:
            raise ValueError(topology)
        games.append({
            "id": f"perf:game{i:03d}", "kind": "game",
            "name": f"Synthetic {topology} {i:03d}", "description": "Authored benchmark-only profile.",
            "aliases": [], "externalIds": [], "sourceId": "perf-author", "parentId": None,
            "mechanics": [f"mechanic-{group}", f"unique-{i:03d}"],
            "themes": [f"theme-{group}"], "platforms": ["windows"], "coop": True,
        })
    return {
        "schemaVersion": 1,
        "snapshotId": f"synthetic-bridge-perf-v1-{topology}-{size}",
        "kind": "synthetic",
        "sources": [{
            "id": "perf-author", "kind": "synthetic",
            "attribution": "Playmancer authored deterministic performance fixture",
            "rights": {"status": "synthetic", "reference": "docs/BRIDGE.md",
                       "fields": RIGHTS_FIELDS},
        }],
        "games": games,
    }


def percentile_nearest_rank(values, fraction):
    ordered = sorted(values)
    return round(ordered[max(0, math.ceil(fraction * len(ordered)) - 1)], 3)


def statistics_for(samples, key):
    values = [sample[key] for sample in samples]
    return {"median_ms": round(statistics.median(values), 3),
            "p95_ms": percentile_nearest_rank(values, 0.95),
            "min_ms": round(min(values), 3), "max_ms": round(max(values), 3)}


def exercise(page, topology, size, throttle):
    start_id, end_id = "perf:game000", "perf:game001"
    page.locator("#bridge-start").select_option(start_id)
    page.locator("#bridge-end").select_option(end_id)
    expected_route = topology != "disconnected"
    samples = []
    for repetition in range(REPETITIONS):
        # The change event is the real UI binding. With end unset, changing the
        # threshold does not run the solver. Alternating values ensures that the
        # next complete route input differs from the cache's previous input.
        sample = page.evaluate("""async ({ endId, threshold }) => {
            const end = document.getElementById('bridge-end');
            const minimum = document.getElementById('bridge-threshold');
            end.value = '';
            end.dispatchEvent(new Event('change', { bubbles: true }));
            minimum.value = threshold;
            minimum.dispatchEvent(new Event('change', { bubbles: true }));
            const begun = performance.now();
            const nextTurn = new Promise(resolve => setTimeout(() => resolve(performance.now() - begun), 0));
            end.value = endId;
            end.dispatchEvent(new Event('change', { bubbles: true }));
            const handler = performance.now() - begun;
            const timer = await nextTurn;
            return {
                handler_ms: handler,
                queued_timer_delay_ms: timer,
                steps: document.querySelectorAll('#bridge-steps li').length,
                status: document.getElementById('bridge-status').textContent,
                end: document.getElementById('bridge-end').value
            };
        }""", {"endId": end_id, "threshold": "0.05" if repetition % 2 == 0 else "0.31"})
        assert sample["end"] == end_id, (topology, size, throttle, sample)
        if expected_route:
            assert sample["steps"] >= 1 and "connection(s)" in sample["status"], sample
        else:
            assert sample["steps"] == 0 and "No supported route" in sample["status"], sample
        samples.append(sample)
    return {
        "size": size, "topology": topology, "cpu_throttle": throttle,
        "route_expected": expected_route,
        "samples": [{"handler_ms": round(s["handler_ms"], 3),
                     "queued_timer_delay_ms": round(s["queued_timer_delay_ms"], 3)} for s in samples],
        "handler": statistics_for(samples, "handler_ms"),
        "queued_timer_delay": statistics_for(samples, "queued_timer_delay_ms"),
        "result": "route" if expected_route else "no-route",
    }


results = []
error = None
browser_version = 'not-run'
try:
    with tempfile.TemporaryDirectory(prefix="playmancer-bridge-perf-") as temporary:
        temporary = Path(temporary)
        sites = {}
        for size in SIZES:
            for topology in TOPOLOGIES:
                stem = f"{topology}-{size}"
                catalog = temporary / f"{stem}.json"
                catalog.write_text(json.dumps(synthetic_catalog(size, topology)))
                site = temporary / f"site-{stem}"
                subprocess.run(["node", "scripts/build-demo.mjs", str(site),
                                "--catalog", str(catalog)], cwd=ROOT, check=True,
                               stdout=subprocess.DEVNULL)
                sites[(size, topology)] = site
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            browser_version = browser.version
            try:
                for throttle in (1, 4):
                    for size in SIZES:
                        for topology in TOPOLOGIES:
                            # All fixtures are static self-contained HTML artifacts.
                            # set_content executes the actual built UI with no network.
                            context = browser.new_context(viewport={"width": 390, "height": 844},
                                                          reduced_motion="reduce")
                            try:
                                page = context.new_page()
                                cdp = context.new_cdp_session(page)
                                cdp.send("Emulation.setCPUThrottlingRate", {"rate": throttle})
                                errors = []
                                page.on("pageerror", lambda e: errors.append(str(e)))
                                page.set_content((sites[(size, topology)] / "index.html").read_text(),
                                                 wait_until="load")
                                page.wait_for_function("document.querySelectorAll('#seeds > li').length === 2")
                                result = exercise(page, topology, size, throttle)
                                assert not errors, errors
                                results.append(result)
                                if size == 250:
                                    page.screenshot(path=str(ARTIFACTS / f"bridge-perf-{topology}-{throttle}x.png"),
                                                    animations="disabled")
                            finally:
                                context.close()
            finally:
                browser.close()
except Exception as exception:
    error = f"{type(exception).__name__}: {exception}"
finally:
    REPORT.write_text(json.dumps({
        "schema_version": 1, "revision": REVISION,
        "fixture_version": "synthetic-bridge-perf-v1", "engine": "Playwright Chromium",
        "browser_version": browser_version,
        "viewport": {"width": 390, "height": 844},
        "repetitions_per_case": REPETITIONS,
        "scope": "Synthetic, local built HTML under headless Chromium; 4x CPU throttling is emulated, not a real mobile device",
        "metrics": "Change-handler duration and queued timer delay are main-thread blocking proxies; not measured user-input latency",
        "results": results, "error": error,
    }, indent=2) + "\n")
    print(json.dumps({"case_count": len(results), "error": error, "report": str(REPORT)}))
if error:
    raise SystemExit(1)
