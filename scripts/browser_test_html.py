"""Inline only the built stylesheet for offline page.set_content tests.

page.set_content uses about:blank and cannot resolve the published relative CSS URL.
The hosted and loopback-HTTP suites request the exact same CSS over same origin.
"""
from pathlib import Path

_STYLE_LINK = '<link rel="stylesheet" href="./player.css">'


def offline_html(site: Path) -> str:
    html = (site / "index.html").read_text(encoding="utf-8")
    css = (site / "player.css").read_text(encoding="utf-8")
    if html.count(_STYLE_LINK) != 1 or "</style" in css.lower():
        raise ValueError("Built player stylesheet missing or unsafe to inline")
    return html.replace(_STYLE_LINK, "<style>\n" + css + "\n</style>")
