"""Nonpublished candidate: exact reviewed links, real HTTP search, keyboard and replay."""
import json
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
    subprocess.run(["node","scripts/build-demo.mjs",str(site),"--catalog",str(snapshot)],cwd=ROOT,check=True)
    subprocess.run(["python3","scripts/pages-preflight.py",str(site)],cwd=ROOT,check=True)
    rows = json.loads(BATCH.read_text())["games"]
    server = ThreadingHTTPServer(("127.0.0.1",0),partial(SimpleHTTPRequestHandler,directory=str(site)))
    thread = threading.Thread(target=server.serve_forever,daemon=True)
    thread.start()
    origin = f"http://127.0.0.1:{server.server_port}/"
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            for width,height in ((390,844),(1280,800)):
                page = browser.new_page(viewport={"width":width,"height":height})
                errors, external = [], []
                page.on("pageerror",lambda e: errors.append(str(e)))
                page.on("request",lambda r: external.append(r.url) if not r.url.startswith(origin) else None)
                assert page.goto(origin).ok
                page.wait_for_function("document.querySelectorAll('#seeds > li').length === 2")
                original_hash = page.evaluate("location.hash")
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
                        # Open the native disclosure containing the real store selector.
                        selector = page.locator("#store-filter")
                        if not selector.is_visible():
                            selector.locator("xpath=ancestor::details[1]/summary").click()
                        selector.select_option(store["store"])
                        search.fill(store["url"])
                        assert results.count() == 1
                        assert results.get_by_role("button",name="Add "+row["name"],exact=True).count() == 1
                        selector.select_option("all")
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
                print(f"Reviewed 54-profile nonpublished candidate: exact title/7 URLs, store scope, keyboard and replay PASS at {width}px")
            browser.close()
    finally:
        server.shutdown()
        server.server_close()
