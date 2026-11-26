"""Exact reviewed links, real HTTP/hosted search, keyboard and versioned replay."""
import json
import os
from hosted_validation import validate_hosted_identity
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import subprocess
import tempfile
import threading
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BATCH = ROOT / "examples/reviewed-mixed-batch-2026-11-26.json"
ARTIFACTS = ROOT / ".test-artifacts"
ARTIFACTS.mkdir(exist_ok=True)

with tempfile.TemporaryDirectory(prefix="playmancer-mixed-") as directory:
    work = Path(directory)
    snapshot = work / "candidate.json"
    site = work / "site"
    subprocess.run(["node","scripts/import-reviewed-mixed.mjs",
                    "examples/catalog.multistore-51.real.json",str(BATCH),str(snapshot)],cwd=ROOT,check=True)
    assert snapshot.read_bytes() == (ROOT / "examples/catalog.multistore-54.real.json").read_bytes()
    subprocess.run(["node","scripts/build-release.mjs",str(site)],cwd=ROOT,check=True)
    subprocess.run(["python3","scripts/release-preflight.py",str(site)],cwd=ROOT,check=True)
    historical = work / "historical51"
    subprocess.run(["node","scripts/build-release.mjs",str(historical),"--candidate-51"],cwd=ROOT,check=True)
    subprocess.run(["python3","scripts/release-preflight.py",str(historical),"--candidate-51"],cwd=ROOT,check=True)
    rows = json.loads(BATCH.read_text())["games"]
    server = ThreadingHTTPServer(("127.0.0.1",0),partial(SimpleHTTPRequestHandler,directory=str(work)))
    thread = threading.Thread(target=server.serve_forever,daemon=True)
    thread.start()
    local = f"http://127.0.0.1:{server.server_port}/"
    hosted = os.environ.get("PLAYMANCER_HOSTED_URL")
    expected_sha = os.environ.get("PLAYMANCER_EXPECTED_SHA")
    if hosted or expected_sha:
        validate_hosted_identity(hosted, expected_sha)
    origin = hosted.rstrip("/") + "/" if hosted else local + "site/"
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            for width,height in ((390,844),(1280,800)):
                page = browser.new_page(viewport={"width":width,"height":height})
                errors, external = [], []
                page.on("pageerror",lambda e: errors.append(str(e)))
                page.on("request",lambda r: external.append(r.url) if not r.url.startswith(origin) else None)
                # Create a genuine historical fragment using the preserved exact 51 catalog.
                historical_page = page.context.new_page()
                assert historical_page.goto(local + "historical51/").ok
                assert historical_page.locator('meta[name="playmancer-catalog"]').get_attribute("content") == "multi-store-genre-pilot-51-2026-11-25"
                historical_page.locator("#intro-sample").click()
                old_hash = historical_page.evaluate("location.hash")
                old_weights = historical_page.locator('#seeds input[type="range"]').evaluate_all("(nodes)=>nodes.map(n=>[n.id,n.value])")
                assert old_hash.startswith("#basket=") and len(old_weights) == 2
                historical_page.close()
                assert page.goto(origin + old_hash).ok
                if hosted:
                    assert page.locator('meta[name="playmancer-revision"]').get_attribute("content") == expected_sha
                assert page.locator("#error").is_visible()
                assert "unavailable catalog" in page.locator("#error").inner_text().lower()
                assert page.locator("#seeds > li").count() == 0
                assert page.evaluate("location.hash") == old_hash
                historical_page = page.context.new_page()
                assert historical_page.goto(local + "historical51/" + old_hash).ok
                assert historical_page.locator("#error").is_hidden()
                assert historical_page.evaluate("location.hash") == old_hash
                assert historical_page.locator('#seeds input[type="range"]').evaluate_all("(nodes)=>nodes.map(n=>[n.id,n.value])") == old_weights
                historical_page.close()
                assert page.goto(origin).ok
                page.wait_for_function("document.querySelectorAll('#seeds > li').length === 2")
                # The initial implicit sample has no fragment. Serialize the
                # identical sample through the real action before testing round trips.
                weights = page.locator('#seeds input[type="range"]')
                implicit_sample = weights.evaluate_all("(nodes)=>nodes.map(n=>[n.id,n.value])")
                assert len(implicit_sample) == 2
                page.get_by_role("button", name="Try a sample", exact=True).click()
                assert weights.evaluate_all("(nodes)=>nodes.map(n=>[n.id,n.value])") == implicit_sample
                original_hash = page.evaluate("location.hash")
                assert original_hash.startswith("#basket=") and len(original_hash) > len("#basket=")
                search = page.locator("#search")
                results = page.locator("#search-results > li")
                for row in rows:
                    for query in [row["name"]] + [store["url"] for store in row["stores"]]:
                        search.fill(query)
                        assert results.count() == 1,(width,query,results.count())
                        assert results.get_by_role("button",name="Add "+row["name"],exact=True).count() == 1
                        assert set(results.locator(".storefront-links a").evaluate_all("(nodes)=>nodes.map(n=>n.href)")) == {s["url"] for s in row["stores"]}
                        assert page.evaluate("location.hash") == original_hash
                    for store in row["stores"]:
                        # Use the visible Browse games action; opening it resets search and scope.
                        selector = page.locator("#store-filter")
                        if not selector.is_visible():
                            page.locator("#intro-browse").click()
                        assert selector.is_visible(), (width, "Browse games did not expose store filter")
                        selector.select_option(store["store"])
                        assert selector.input_value() == store["store"]
                        search.fill(store["url"])
                        assert results.count() == 1
                        assert results.get_by_role("button",name="Add "+row["name"],exact=True).count() == 1
                        selector.select_option("all")
                        assert page.evaluate("location.hash") == original_hash
                assert page.locator('meta[name="playmancer-catalog"]').get_attribute("content") == "multi-store-identity-candidate-54-2026-11-26"
                entry = page.locator("#observation-explorer-entry")
                assert entry.get_attribute("data-observation-evidence") == "473884e85398c820c4453eafd1c932d56710b36c"
                receipt_paths = page.locator(".source-receipts a").evaluate_all("(nodes)=>nodes.map(n=>n.href)")
                assert any(h.endswith("/docs/REVIEWED_MIXED_54.md") for h in receipt_paths)
                assert any(h.endswith("/docs/REAL_EXPANSION_51.md") for h in receipt_paths)
                for row in rows:
                    search.fill(row["name"])
                    search.press("Enter")
                    favorite = page.locator("#seeds > li").filter(has=page.locator(".seed-name",has_text=row["name"]))
                    favorite.locator(".seed-options > summary").click()
                    evidence = favorite.locator(".basket-evidence")
                    evidence.locator("summary").click()
                    assert "no reviewed genre source" in evidence.inner_text()
                    assert "No separately reviewed gameplay facts" in evidence.inner_text()
                    links = evidence.locator("a").evaluate_all("(nodes)=>nodes.map(n=>n.href)")
                    assert row["identity"]["reference"] in links
                    assert row["releaseEvidence"] in links
                    assert any(h.endswith("/examples/reviewed-mixed-batch-2026-11-26.json") for h in links)
                    assert not any(h.endswith("/docs/STOREFRONTS.md") for h in links)
                    if row["identity"]["provider"] == "github":
                        assert not any("wikidata.org/wiki/" in h for h in links)
                    favorite.get_by_role("button",name="Remove "+row["name"],exact=True).click()
                    assert page.evaluate("location.hash") == original_hash
                search.fill("Mindustry")
                search.press("Enter")
                assert page.locator("#seeds > li").count() == 3
                assert "Mindustry" in page.locator("#seeds").inner_text()
                share = page.evaluate("location.hash")
                assert share != original_hash
                page.reload()
                page.wait_for_function("document.querySelectorAll('#seeds > li').length === 3")
                assert page.evaluate("location.hash") == share
                assert "Mindustry" in page.locator("#seeds").inner_text()
                assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
                assert not errors and not external,(errors,external)
                page.screenshot(path=str(ARTIFACTS / f"mixed-candidate-{width}.png"),full_page=True)
                page.close()
                print(f"Reviewed 54-profile {'HOSTED' if hosted else 'LOCAL_HTTP'}: exact title/7 URLs, store scope, keyboard, strict 51 rejection and recovery, and 54 replay PASS at {width}px")
            browser.close()
    finally:
        server.shutdown()
        server.server_close()
