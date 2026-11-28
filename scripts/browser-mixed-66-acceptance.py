"""66-profile full release: exact local or hosted evidence binding and historical replay."""
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
BATCH = ROOT / "examples/reviewed-mixed-batch-2026-11-28.json"
ARTIFACTS = ROOT / ".test-artifacts"
ARTIFACTS.mkdir(exist_ok=True)
with tempfile.TemporaryDirectory(prefix="playmancer-next-mixed-") as directory:
    work = Path(directory)
    snapshot = work / "candidate.json"
    site = work / "site"
    subprocess.run(["node","scripts/import-reviewed-mixed.mjs","examples/catalog.multistore-62.real.json",str(BATCH),str(snapshot)],cwd=ROOT,check=True)
    assert snapshot.read_bytes() == (ROOT / "examples/catalog.multistore-66.real.json").read_bytes()
    subprocess.run(["node","scripts/build-release.mjs",str(site),"--candidate-66"],cwd=ROOT,check=True)
    subprocess.run(["python3","scripts/release-preflight.py",str(site),"--candidate-66"],cwd=ROOT,check=True)
    historical = work / "historical62"
    subprocess.run(["node","scripts/build-release.mjs",str(historical),"--candidate-62"],cwd=ROOT,check=True)
    subprocess.run(["python3","scripts/release-preflight.py",str(historical),"--candidate-62"],cwd=ROOT,check=True)
    rows = [(row, BATCH.name) for row in json.loads(BATCH.read_text())["games"]]
    assert len(rows) == 4 and sum(len(row["stores"]) for row, _ in rows) == 8
    new_rows = rows[:]
    for name in ("reviewed-mixed-batch-2026-11-27b.json", "reviewed-mixed-batch-2026-11-27.json", "reviewed-mixed-batch-2026-11-26.json"):
        rows += [(row, name) for row in json.loads((ROOT / "examples" / name).read_text())["games"]]
    assert len(rows) == 15 and sum(len(row["stores"]) for row, _ in rows) == 34
    server = ThreadingHTTPServer(("127.0.0.1",0),partial(SimpleHTTPRequestHandler,directory=str(work)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    hosted = os.environ.get("PLAYMANCER_HOSTED_URL")
    expected_sha = os.environ.get("PLAYMANCER_EXPECTED_SHA")
    if hosted or expected_sha:
        validate_hosted_identity(hosted, expected_sha)
    url = hosted.rstrip("/") + "/" if hosted else f"http://127.0.0.1:{server.server_port}/site/"
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            for width,height in ((390,844),(1280,800)):
                context = browser.new_context(viewport={"width":width,"height":height})
                page = context.new_page()
                errors, external = [], []
                page.on("pageerror",lambda e: errors.append(str(e)))
                page.on("request",lambda r: external.append(r.url) if not r.url.startswith(url) else None)
                historical_page = context.new_page()
                historical_url = f"http://127.0.0.1:{server.server_port}/historical62/"
                assert historical_page.goto(historical_url).ok
                historical_page.locator("#intro-sample").click()
                old_hash = historical_page.evaluate("location.hash")
                old_weights = historical_page.locator('#seeds input[type="range"]').evaluate_all("(nodes)=>nodes.map(n=>[n.id,n.value])")
                assert old_hash.startswith("#basket=") and len(old_weights) == 2
                # The rejection is a fresh document request, not a fragment transition.
                rejected = page.goto(url + old_hash)
                assert rejected is not None and rejected.ok
                if hosted:
                    assert page.locator('meta[name="playmancer-revision"]').get_attribute("content") == expected_sha
                assert page.locator("#error").is_visible()
                assert "unavailable catalog" in page.locator("#error").inner_text().lower()
                assert page.locator("#seeds > li").count() == 0
                assert page.evaluate("location.hash") == old_hash
                # Opening the same URL fragment on the original tab can return None.
                # Use a fresh tab in the same origin/context to exercise a real shared entry.
                historical_page.close()
                historical_page = context.new_page()
                restored = historical_page.goto(historical_url + old_hash)
                assert restored is not None and restored.ok
                assert historical_page.locator("#error").is_hidden()
                assert historical_page.evaluate("location.hash") == old_hash
                assert historical_page.locator('#seeds input[type="range"]').evaluate_all("(nodes)=>nodes.map(n=>[n.id,n.value])") == old_weights
                historical_page.close()
                # Start the candidate journey from a fresh document as well, retaining
                # the error/request observations collected during the rejected replay.
                page.close()
                page = context.new_page()
                page.on("pageerror",lambda e: errors.append(str(e)))
                page.on("request",lambda r: external.append(r.url) if not r.url.startswith(url) else None)
                assert page.goto(url).ok
                if hosted:
                    assert page.locator('meta[name="playmancer-revision"]').get_attribute("content") == expected_sha
                assert page.evaluate("location.hash") == ""
                assert page.locator('meta[name="playmancer-catalog"]').get_attribute("content") == "multi-store-identity-candidate-66-2026-11-28"
                assert page.locator("#observation-explorer-entry").get_attribute("data-observation-evidence") == "99cfc494fb1f5e6bffd5b57476d1259358f7651c"
                explore = context.new_page()
                assert explore.goto(url + "observations.html").ok
                if hosted:
                    assert explore.locator('meta[name="playmancer-revision"]').get_attribute("content") == expected_sha
                assert explore.locator('meta[name="playmancer-observations"]').get_attribute("content") == "99cfc494fb1f5e6bffd5b57476d1259358f7651c"
                # The real explorer switches to bounded pages above 64 profiles.
                expected_ids = {game["id"] for game in json.loads(snapshot.read_text())["games"]}
                assert len(expected_ids) == 66
                prev = explore.locator("#observation-prev")
                nxt = explore.locator("#observation-next")
                pages = []
                for index, size in enumerate((24, 24, 18)):
                    ids = explore.locator(".game-card").evaluate_all("(cards)=>cards.map(c=>c.dataset.gameId)")
                    assert len(ids) == size and len(set(ids)) == size, (width, index, ids)
                    assert prev.is_disabled() == (index == 0)
                    assert nxt.is_disabled() == (index == 2)
                    assert f"Showing {index * 24 + 1}–{index * 24 + size}" in explore.locator("#search-status").inner_text()
                    pages.append(ids)
                    if index < 2:
                        nxt.focus()
                        nxt.press("Enter")
                flattened = [game_id for batch in pages for game_id in batch]
                assert len(set(flattened)) == 66 and set(flattened) == expected_ids
                for index in (1, 0):
                    prev.focus()
                    prev.press("Enter")
                    assert explore.locator(".game-card").evaluate_all("(cards)=>cards.map(c=>c.dataset.gameId)") == pages[index]
                assert prev.is_disabled() and nxt.is_enabled()
                for side in ("left", "right"):
                    assert explore.locator(f"#{side}-filter").is_visible()
                    assert explore.locator(f"#{side} option").count() <= 25
                for row, _ in new_rows:
                    explore.locator("#query").fill(row["name"])
                    card = explore.locator(".game-card")
                    assert card.count() == 1 and row["name"] in card.inner_text()
                    assert card.locator(".fact-list a").count() == 0
                explore.locator("#query").fill("")
                explore.locator("#left-filter").fill("wikidata:q16972008")
                explore.locator("#left").select_option("wikidata:q16972008")
                explore.locator("#right-filter").fill("wikidata:q110726215")
                explore.locator("#right").select_option("wikidata:q110726215")
                assert explore.locator("#left").input_value() == "wikidata:q16972008"
                assert explore.locator("#right").input_value() == "wikidata:q110726215"
                explore.locator("#right-filter").fill("")
                assert explore.locator("#right").input_value() == "wikidata:q110726215"
                assert explore.locator("#right option").count() <= 26
                explore.locator("#query").fill("Vampire Survivors")
                explore.locator('.game-card[data-game-id="wikidata:q110726215"]').get_by_role("button", name="Compare Vampire Survivors on right").click()
                assert explore.locator("#right").input_value() == "wikidata:q110726215"
                assert "not a zero match" in explore.locator("#comparison").inner_text()
                explore.close()
                page.get_by_role("button",name="Try a sample",exact=True).click()
                original_hash = page.evaluate("location.hash")
                assert original_hash.startswith("#basket=")
                search = page.locator("#search")
                results = page.locator("#search-results > li")
                assert any(h.endswith("/examples/reviewed-mixed-batch-2026-11-27b.json") for h in page.locator(".source-receipts a").evaluate_all("(nodes)=>nodes.map(n=>n.href)"))
                assert any(h.endswith("/examples/reviewed-mixed-batch-2026-11-26.json") for h in page.locator(".source-receipts a").evaluate_all("(nodes)=>nodes.map(n=>n.href)"))
                assert any(h.endswith("/examples/reviewed-mixed-batch-2026-11-27.json") for h in page.locator(".source-receipts a").evaluate_all("(nodes)=>nodes.map(n=>n.href)"))
                assert any(h.endswith("/examples/reviewed-mixed-batch-2026-11-28.json") for h in page.locator(".source-receipts a").evaluate_all("(nodes)=>nodes.map(n=>n.href)"))
                for row, receipt_name in rows:
                    for query in [row["name"]] + [s["url"] for s in row["stores"]]:
                        search.fill(query)
                        assert results.count() == 1,(width,query,results.count())
                        assert results.get_by_role("button",name="Add "+row["name"],exact=True).count() == 1
                        assert set(results.locator(".storefront-links a").evaluate_all("(nodes)=>nodes.map(n=>n.href)")) == {s["url"] for s in row["stores"]}
                    for store in row["stores"]:
                        selector = page.locator("#store-filter")
                        if not selector.is_visible():
                            page.locator("#intro-browse").click()
                        selector.select_option(store["store"])
                        search.fill(store["url"])
                        assert results.count() == 1
                        assert results.get_by_role("button",name="Add "+row["name"],exact=True).count() == 1
                        selector.select_option("all")
                        assert page.evaluate("location.hash") == original_hash
                    search.fill(row["name"])
                    search.press("Enter")
                    favorite = page.locator("#seeds > li").filter(has=page.locator(".seed-name",has_text=row["name"]))
                    favorite.locator(".seed-options > summary").click()
                    evidence = favorite.locator(".basket-evidence")
                    evidence.locator("summary").click()
                    assert "no reviewed genre source" in evidence.inner_text()
                    assert "Catalog mechanics: unknown. Co-op: unknown." in evidence.inner_text()
                    assert "No separately reviewed gameplay facts" in evidence.inner_text()
                    links = evidence.locator("a").evaluate_all("(nodes)=>nodes.map(n=>n.href)")
                    assert row["identity"]["reference"] in links and row["releaseEvidence"] in links
                    assert any(h.endswith("/examples/" + receipt_name) for h in links)
                    if row["identity"]["provider"] == "github":
                        assert not any("wikidata.org/wiki/" in h for h in links)
                    assert not any(h.endswith("/docs/STOREFRONTS.md") for h in links)
                    favorite.get_by_role("button",name="Remove "+row["name"],exact=True).click()
                    assert page.evaluate("location.hash") == original_hash
                search.fill("Vampire Survivors")
                search.press("Enter")
                share = page.evaluate("location.hash")
                assert share != original_hash
                page.reload()
                if hosted:
                    assert page.locator('meta[name="playmancer-revision"]').get_attribute("content") == expected_sha
                assert "Vampire Survivors" in page.locator("#seeds").inner_text()
                assert page.evaluate("location.hash") == share
                assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
                assert not errors and not external,(errors,external)
                page.screenshot(path=str(ARTIFACTS / f"mixed-66-{width}.png"),full_page=True)
                context.close()
                print(f"66-profile {'HOSTED' if hosted else 'LOCAL_HTTP'} bound release: 34 exact store URLs, title, scope, evidence and replay PASS at {width}px")
            browser.close()
    finally:
        server.shutdown()
        server.server_close()
