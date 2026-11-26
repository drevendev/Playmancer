"""Compare exact pre-redesign and current real builds with identical share inputs."""
import json
import os
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / ".test-artifacts"
OUT.mkdir(exist_ok=True)
BASE = "a303d1379fee10c79e165fcdd2ce4438dd185677"
CURRENT = os.environ.get("GITHUB_SHA", os.environ.get("PLAYMANCER_REVISION", "unpublished"))
servers = []
report = []

def serve(path):
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(SimpleHTTPRequestHandler, directory=str(path)))
    Thread(target=server.serve_forever, daemon=True).start()
    servers.append(server)
    return f"http://127.0.0.1:{server.server_port}/"

def geometry(page, name):
    page.wait_for_function("document.querySelector('#results > li')")
    result = page.evaluate("""() => {
        const card = document.querySelector('#results > li');
        const rect = card.getBoundingClientRect();
        const action = card.querySelector('.storefront-links a, .explanation summary');
        return {cardY: rect.top + scrollY, cardScroll: Math.max(0, rect.top - innerHeight + 1),
                actionY: action ? action.getBoundingClientRect().top + scrollY : null,
                scrollY, overflow: document.documentElement.scrollWidth - innerWidth,
                ids: [...document.querySelectorAll('#results > li')].map(n => n.dataset.gameId),
                favorites: [...document.querySelectorAll('#seeds .seed-name')].map(n => n.textContent),
                hash: location.hash};
    }""")
    page.screenshot(path=str(OUT / f"compact-basket-{name}.png"), animations="disabled")
    page.locator("#results > li").first.scroll_into_view_if_needed()
    page.screenshot(path=str(OUT / f"compact-basket-{name}-result.png"), animations="disabled")
    return result

try:
    before, after = serve(Path(sys.argv[1]).resolve()), serve(ROOT / "_site")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        for width in (320, 390, 1280):
            ctx = browser.new_context(viewport={"width": width, "height": 844}, reduced_motion="reduce")
            builder = ctx.new_page()
            builder.goto(before)
            builder.wait_for_function("document.querySelectorAll('#seeds > li').length === 2")
            # Capture a versioned two-game basket, then add the same three real games.
            builder.locator("#share").click()
            two = builder.locator("#share-link").input_value().split("#", 1)[1]
            for title in ("Inscryption", "Dwarf Fortress", "FTL: Faster Than Light"):
                builder.locator("#search").fill(title)
                builder.get_by_role("button", name=f"Add {title}", exact=True).click()
            five = builder.evaluate("location.hash.slice(1)")
            for count, fragment in ((2, two), (5, five)):
                records = []
                for label, url, sha in (("before", before, BASE), ("after", after, CURRENT)):
                    page = ctx.new_page()
                    page.goto(url + "#" + fragment)
                    assert page.locator('meta[name="playmancer-revision"]').get_attribute("content") == sha
                    page.wait_for_function("(count) => document.querySelectorAll('#seeds > li').length === count", arg=count)
                    if label == "after":
                        assert page.locator("#seeds .seed-options").count() == count
                        assert all(page.locator("#seeds .seed-options").evaluate_all("nodes => nodes.map(n => !n.open)"))
                    records.append(geometry(page, f"{width}-{count}-{label}"))
                    page.close()
                old, new = records
                report.append({"width": width, "count": count, "before": old, "after": new})
                assert old["favorites"] == new["favorites"] and old["ids"] == new["ids"]
                assert old["hash"] == new["hash"] and old["scrollY"] == new["scrollY"] == 0
                assert new["overflow"] <= 1
                if width <= 390:
                    assert new["cardY"] < old["cardY"] - 100, report[-1]
                    assert new["cardScroll"] <= old["cardScroll"], report[-1]
            ctx.close()
        browser.close()
finally:
    for server in servers:
        server.shutdown()
        server.server_close()
    (OUT / "compact-basket-geometry.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))
