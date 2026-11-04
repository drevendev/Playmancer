"""Exercise the built Bridge journey offline; this is not Pages/live evidence."""
import json
import os
from pathlib import Path
import subprocess
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright
from browser_test_html import offline_html

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / ".test-artifacts"
ARTIFACTS.mkdir(exist_ok=True)
subprocess.run(["node", "scripts/build-demo.mjs"], cwd=ROOT, check=True)
HTML = offline_html(ROOT / "_site")
results = []


def check(name, condition):
    results.append({"name": name, "passed": bool(condition)})
    if not condition:
        raise AssertionError(name)


try:
    with sync_playwright() as p:
        options = {"headless": True}
        if os.environ.get("PLAYWRIGHT_CHROMIUM_EXECUTABLE"):
            options["executable_path"] = os.environ["PLAYWRIGHT_CHROMIUM_EXECUTABLE"]
        browser = p.chromium.launch(**options)
        # Include compact and high-contrast layouts, plus 400% root-text stress.
        # This is root-text scaling, not a claim about native browser zoom.
        cases = [("desktop", 1280, 800, "none", 1, 1),
                 ("mobile", 390, 844, "none", 1, 1),
                 ("compact", 320, 740, "none", 1, 1),
                 ("high-contrast", 390, 844, "active", 2, 1),
                 ("large-text-390", 390, 844, "none", 1, 4),
                 ("large-text-320", 320, 740, "none", 1, 4)]
        for label, width, height, colors, dpr, root_scale in cases:
            context = browser.new_context(viewport={"width": width, "height": height},
                                          reduced_motion="reduce", forced_colors=colors,
                                          device_scale_factor=dpr)
            page = context.new_page()
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.set_content(HTML, wait_until="load")
            page.evaluate("scale => document.documentElement.style.fontSize = (16 * scale) + 'px'", root_scale)
            button = page.locator("#intro-bridge")
            button.wait_for(state="visible")
            check(label + ": native first-screen Bridge action", button.evaluate("e => e.tagName === 'BUTTON' && e.type === 'button' && e.getBoundingClientRect().height >= 44"))
            page.screenshot(path=str(ARTIFACTS / ("bridge-discovery-" + label + ".png")))
            page.locator("#bridge-start").select_option("demo:ember")
            page.locator("#bridge-end").select_option("demo:harvest")
            page.locator("#bridge-threshold").select_option("0.05")
            check(label + ": route has supported steps", page.locator("#bridge-steps li").count() > 0)
            page.locator("#share").click()
            link = page.locator("#share-link").input_value()
            saved_hash = "#" + urlsplit(link).fragment
            check(label + ": saved basket includes a hash", saved_hash.startswith("#basket="))
            page.evaluate("hash => { location.hash = hash; }", saved_hash)
            page.wait_for_function("document.getElementById('bridge-start').value === 'demo:ember'")
            route_before = page.locator("#bridge-steps").inner_text()
            href_before = page.evaluate("location.href")
            button.focus()
            button.press("Enter")
            check(label + ": keyboard focus reaches Bridge", page.evaluate("document.activeElement.id") == "bridge-title")
            check(label + ": focus outline clears synthetic label", page.locator("#bridge-title").evaluate(
                "title => {const label=title.previousElementSibling;const style=getComputedStyle(title);"
                "return label.classList.contains('eyebrow') && title.getBoundingClientRect().top"
                " - label.getBoundingClientRect().bottom >= 10 &&"
                " parseFloat(style.outlineWidth) >= 2 && style.outlineStyle !== 'none';}"))
            check(label + ": forced colors preference applied", page.evaluate(
                "expected => matchMedia('(forced-colors: active)').matches === expected", colors == "active"))
            check(label + ": keyboard preserves exact share URL", page.evaluate("location.href") == href_before)
            check(label + ": keyboard preserves route and endpoints", page.locator("#bridge-steps").inner_text() == route_before and page.locator("#bridge-end").input_value() == "demo:harvest")
            check(label + ": title is in the viewport", page.locator("#bridge-title").evaluate("e => { const r=e.getBoundingClientRect(); return r.top >= 0 && r.top < innerHeight; }"))
            if root_scale == 4:
                # A document-level no-overflow assertion missed words split into
                # letter fragments. Measure actual character line positions.
                heading = page.locator("#bridge-title").evaluate("""node => {
                    const text = node.firstChild, value = text.textContent;
                    const range = document.createRange(), broken = [];
                    let cursor = 0;
                    for (const word of value.match(/\\S+/g) || []) {
                        const start = value.indexOf(word, cursor), tops = new Set();
                        for (let i = 0; i < word.length; i++) {
                            range.setStart(text, start + i);
                            range.setEnd(text, start + i + 1);
                            tops.add(Math.round(range.getBoundingClientRect().top));
                        }
                        if (tops.size !== 1) broken.push(word);
                        cursor = start + word.length;
                    }
                    return {
                        broken,
                        headingSize: parseFloat(getComputedStyle(node).fontSize),
                        copySize: parseFloat(getComputedStyle(node.nextElementSibling).fontSize),
                        scrollWidth: document.documentElement.scrollWidth,
                        viewport: innerWidth
                    };
                }""")
                check(label + ": 400% Bridge title keeps whole readable words",
                      not heading["broken"]
                      and heading["headingSize"] >= heading["copySize"]
                      and heading["scrollWidth"] <= heading["viewport"])
                # Text-only 400% zoom used to fracture the real-catalog eyebrow
                # and supporting prose, even though document overflow stayed zero.
                # Inspect actual character line positions for the known static copy.
                copy = page.locator("#bridge-lab").evaluate("""panel => {
                    const broken = {};
                    const parts = {
                        eyebrow: ":scope > .eyebrow",
                        intro: ":scope > .hint",
                        warning: ":scope > .bridge-warning"
                    };
                    for (const [name, selector] of Object.entries(parts)) {
                        const text = panel.querySelector(selector).firstChild;
                        const value = text.textContent, range = document.createRange();
                        const fragments = [];
                        let cursor = 0;
                        for (const word of value.match(/\\S+/g) || []) {
                            const start = value.indexOf(word, cursor), tops = new Set();
                            for (let i = 0; i < word.length; i++) {
                                range.setStart(text, start + i);
                                range.setEnd(text, start + i + 1);
                                tops.add(Math.round(range.getBoundingClientRect().top));
                            }
                            if (tops.size > 1) fragments.push(word);
                            cursor = start + word.length;
                        }
                        broken[name] = fragments;
                    }
                    return {broken, noOverflow: document.documentElement.scrollWidth <= innerWidth};
                }""")
                check(label + ": 400% Bridge label and explanatory copy keep whole words",
                      all(not words for words in copy["broken"].values())
                      and copy["noOverflow"])
            page.screenshot(path=str(ARTIFACTS / ("bridge-route-" + label + ".png")))
            button.click()
            check(label + ": pointer navigation preserves URL and focus", page.evaluate("location.href") == href_before and page.evaluate("document.activeElement.id") == "bridge-title")
            check(label + ": no horizontal overflow", page.evaluate("document.documentElement.scrollWidth <= innerWidth"))
            restored = context.new_page()
            restored.on("pageerror", lambda error: errors.append(str(error)))
            restored.set_content(HTML, wait_until="load")
            restored.evaluate("scale => document.documentElement.style.fontSize = (16 * scale) + 'px'", root_scale)
            restored.evaluate("hash => { location.hash = hash; }", saved_hash)
            restored.wait_for_function("document.getElementById('bridge-start').value === 'demo:ember'")
            check(label + ": fresh-page route restoration", restored.locator("#bridge-steps").inner_text() == route_before and restored.locator("#bridge-end").input_value() == "demo:harvest")
            check(label + ": fresh-page no horizontal overflow", restored.evaluate("document.documentElement.scrollWidth <= innerWidth"))
            # A normal short Bridge message did not expose the unbreakable-ID overflow.
            # Inject a deliberately long unknown-identifier status, then restore live text.
            original_status = restored.locator("#bridge-status").text_content()
            restored.locator("#bridge-status").evaluate(
                "e => { e.textContent = 'Route unavailable: ' + 'long-unbreakable-game-id-'.repeat(9); }")
            check(label + ": long Bridge status never widens the document", restored.evaluate(
                "document.documentElement.scrollWidth <= innerWidth"))
            restored.locator("#bridge-status").evaluate("(e, text) => { e.textContent = text; }", original_status)
            check(label + ": original Bridge status remains after stress test", restored.locator("#bridge-status").text_content() == original_status)
            check(label + ": no JavaScript errors", not errors)
            context.close()
        browser.close()
finally:
    (ARTIFACTS / "bridge-acceptance.json").write_text(json.dumps({
        "revision": os.environ.get("GITHUB_SHA", os.environ.get("PLAYMANCER_REVISION", "unpublished")),
        "scope": "built-document offline Chromium; not hosted navigation or screen-reader certification",
        "checks": results,
    }, indent=2) + "\n")
print(json.dumps({"passed": len(results), "failed": 0}))
