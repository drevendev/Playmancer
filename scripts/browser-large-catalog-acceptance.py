"""Synthetic scale acceptance of the actual built player, not real catalog coverage."""
import json
from pathlib import Path
import subprocess
import tempfile

from playwright.sync_api import sync_playwright
from browser_test_html import offline_html

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / ".test-artifacts"
ARTIFACTS.mkdir(exist_ok=True)
fixture = json.loads((ROOT / "examples/catalog.alternative.synthetic.json").read_text())
fixture["snapshotId"] = "synthetic-scale-1000-v1"
fixture["games"] = [
    dict(fixture["games"][0], id=f"scale:game{i:04d}", name=f"Synthetic scale {i:04d}",
         aliases=[], externalIds=[], parentId=None, kind="game")
    for i in range(1000)
]
with tempfile.TemporaryDirectory(prefix="playmancer-scale-") as tmp:
    path = Path(tmp) / "catalog.json"
    path.write_text(json.dumps(fixture))
    site = Path(tmp) / "site"
    subprocess.run(["node", "scripts/build-demo.mjs", str(site), "--catalog", str(path)],
                   cwd=ROOT, check=True)
    subprocess.run(["python3", "scripts/pages-preflight.py", str(site)], cwd=ROOT, check=True)
    html = offline_html(site)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for label, width, height in [("desktop", 1280, 900), ("mobile", 390, 844)]:
            ctx = browser.new_context(viewport={"width": width, "height": height}, reduced_motion="reduce")
            page = ctx.new_page()
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.set_content(html, wait_until="load")
            page.wait_for_function("document.querySelectorAll('#seeds > li').length === 2")
            assert "1000 invented profiles" in page.locator(".intro").inner_text()
            assert "250-profile route limit" in page.locator("#bridge-status").inner_text()
            assert page.locator("#bridge-steps li").count() == 0
            search = page.locator("#search")
            search.fill("Synthetic scale")
            assert page.locator("#search-results li > button").count() == 8
            assert "998" in page.locator("#search-hint").inner_text()
            page.get_by_role("button", name="Next page", exact=True).press("Enter")
            assert page.locator("#search-results li > button").count() == 8
            search.fill("scale:game0999")
            search.press("Enter")
            assert page.locator("#seeds > li").count() == 3
            assert "Synthetic scale 0999" in page.locator("#seeds").inner_text()
            page.locator("#mode").select_option("blend")
            page.locator("#seeds input").first.press("ArrowRight")
            page.locator("#platform").select_option("windows")
            page.locator("#share").click()
            link = page.locator("#share-link").input_value()
            restored = ctx.new_page()
            restored.on("pageerror", lambda error: errors.append(str(error)))
            restored.set_content(html, wait_until="load")
            restored.evaluate("(link) => { location.hash = link.slice(link.indexOf('#basket=')); }", link)
            restored.wait_for_function("document.querySelectorAll('#seeds > li').length === 3")
            assert restored.locator("#mode").input_value() == "blend"
            assert restored.locator("#platform").input_value() == "windows"
            assert restored.locator("#seeds").inner_text() == page.locator("#seeds").inner_text()
            assert "250-profile route limit" in restored.locator("#bridge-status").inner_text()
            assert restored.locator("#bridge-steps li").count() == 0
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
            assert not errors, errors
            page.screenshot(path=str(ARTIFACTS / f"large-catalog-{label}.png"))
            ctx.close()
        browser.close()
print("PASS: 1,000 synthetic profiles, desktop/mobile search, ranking controls and share replay; Bridge abstains")
