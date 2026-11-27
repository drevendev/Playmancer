"""Opt-in 58-profile candidate: no observation binding or publication claim."""
import json
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import subprocess
import tempfile
import threading
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BATCH = ROOT / "examples/reviewed-mixed-batch-2026-11-27.json"
ARTIFACTS = ROOT / ".test-artifacts"
ARTIFACTS.mkdir(exist_ok=True)
with tempfile.TemporaryDirectory(prefix="playmancer-next-mixed-") as directory:
    work = Path(directory)
    snapshot = work / "candidate.json"
    site = work / "site"
    subprocess.run(["node","scripts/import-reviewed-mixed.mjs","examples/catalog.multistore-54.real.json",str(BATCH),str(snapshot)],cwd=ROOT,check=True)
    assert snapshot.read_bytes() == (ROOT / "examples/catalog.multistore-58.real.json").read_bytes()
    subprocess.run(["node","scripts/build-demo.mjs",str(site),"--catalog",str(snapshot)],cwd=ROOT,check=True)
    rows = json.loads(BATCH.read_text())["games"]
    server = ThreadingHTTPServer(("127.0.0.1",0),partial(SimpleHTTPRequestHandler,directory=str(work)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    url = f"http://127.0.0.1:{server.server_port}/site/"
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            for width,height in ((390,844),(1280,800)):
                context = browser.new_context(viewport={"width":width,"height":height})
                page = context.new_page()
                errors, external = [], []
                page.on("pageerror",lambda e: errors.append(str(e)))
                page.on("request",lambda r: external.append(r.url) if not r.url.startswith(url) else None)
                assert page.goto(url).ok
                assert page.locator('meta[name="playmancer-catalog"]').get_attribute("content") == "multi-store-identity-candidate-58-2026-11-27"
                page.get_by_role("button",name="Try a sample",exact=True).click()
                original_hash = page.evaluate("location.hash")
                assert original_hash.startswith("#basket=")
                search = page.locator("#search")
                results = page.locator("#search-results > li")
                assert any(h.endswith("/examples/reviewed-mixed-batch-2026-11-27.json") for h in page.locator(".source-receipts a").evaluate_all("(nodes)=>nodes.map(n=>n.href)"))
                assert any(h.endswith("/examples/reviewed-mixed-batch-2026-11-26.json") for h in page.locator(".source-receipts a").evaluate_all("(nodes)=>nodes.map(n=>n.href)"))
                for row in rows:
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
                    links = evidence.locator("a").evaluate_all("(nodes)=>nodes.map(n=>n.href)")
                    assert row["identity"]["reference"] in links and row["releaseEvidence"] in links
                    assert any(h.endswith("/examples/reviewed-mixed-batch-2026-11-27.json") for h in links)
                    assert not any(h.endswith("/docs/STOREFRONTS.md") for h in links)
                    favorite.get_by_role("button",name="Remove "+row["name"],exact=True).click()
                    assert page.evaluate("location.hash") == original_hash
                search.fill("Peglin")
                search.press("Enter")
                share = page.evaluate("location.hash")
                assert share != original_hash
                page.reload()
                assert "Peglin" in page.locator("#seeds").inner_text()
                assert page.evaluate("location.hash") == share
                assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
                assert not errors and not external,(errors,external)
                page.screenshot(path=str(ARTIFACTS / f"mixed-58-{width}.png"),full_page=True)
                context.close()
                print(f"58-profile unbound candidate: 12 exact store URLs, title, scope, evidence and replay PASS at {width}px")
            browser.close()
    finally:
        server.shutdown()
        server.server_close()
