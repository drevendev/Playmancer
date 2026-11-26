"""Isolated, nonpublished collision fixture exercising the real-player URL lookup."""
import json
from pathlib import Path
import subprocess
import tempfile
from playwright.sync_api import sync_playwright
from browser_test_html import offline_html

ROOT = Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix="playmancer-itch-test-") as directory:
    work = Path(directory)
    snapshot = json.loads((ROOT / "examples/catalog.multistore-51.real.json").read_text())
    snapshot["snapshotId"] = "test-only-itch-collision"
    # No new real catalog claims: replace two fixture rows only in this temporary build.
    # Never navigate to these test-only URLs or publish the resulting artifact.
    urls = ["https://playmancer-fixture-a.itch.io/echoes", "https://playmancer-fixture-b.itch.io/echoes"]
    names = ["Test-only Echoes A", "Test-only Echoes B"]
    for i, game_id in enumerate(("dreven:devmatch", "dreven:hunter-adventure")):
        row = next(g for g in snapshot["games"] if g["id"] == game_id)
        row["name"] = names[i]
        row["externalIds"] = [{"provider": "itch", "id": "echoes" if i == 0 else "playmancer-fixture-b.itch.io/echoes"}]
        row["storeLinks"] = [{"store": "itch", "url": urls[i]}]
    fixture = work / "fixture.json"
    fixture.write_text(json.dumps(snapshot))
    site = work / "site"
    subprocess.run(["node", "scripts/build-demo.mjs", str(site), "--catalog", str(fixture)], cwd=ROOT, check=True)
    subprocess.run(["python3", "scripts/pages-preflight.py", str(site)], cwd=ROOT, check=True)
    html = offline_html(site)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for width, height in ((390, 844), (1280, 800)):
            page = browser.new_page(viewport={"width": width, "height": height})
            errors, requests = [], []
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.on("request", lambda r: requests.append(r.url))
            page.set_content(html, wait_until="load")
            page.wait_for_function("document.querySelectorAll('#seeds > li').length === 2")
            original_hash = page.evaluate("location.hash")
            for name, url in zip(names, urls):
                page.locator("#search").fill(url)
                rows = page.locator("#search-results > li")
                assert rows.count() == 1, (width, url, rows.count())
                assert rows.get_by_role("button", name="Add " + name, exact=True).count() == 1
                assert rows.locator(".storefront-links a").get_attribute("href") == url
                assert page.evaluate("location.hash") == original_hash
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
            assert not errors and not requests, (errors, requests)
            print(f"Publisher-qualified itch lookup: PASS at {width}px")
            page.close()
        browser.close()
