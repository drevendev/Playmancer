"""Bounded, fail-closed Pages revision probe with safe failure diagnostics.

The source-of-truth publication setting is in GitHub Pages administration: this
probe deliberately cannot disable a competing branch/Jekyll publisher.
"""
import os
import re
import sys
import time
from dataclasses import dataclass
from html.parser import HTMLParser
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener

from hosted_validation import validate_hosted_identity


@dataclass(frozen=True)
class Response:
    status: int
    url: str
    body: str = ''
    fault: str = ''


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def fetch_public(url):
    """Read only bounded public HTML/JS; never log contents or credentials."""
    request = Request(url, headers={'Cache-Control': 'no-cache'})
    try:
        with build_opener(NoRedirect).open(request, timeout=15) as response:
            return Response(response.status, response.geturl(), response.read(1_000_001).decode('utf-8', 'replace'))
    except HTTPError as error:
        return Response(error.code, url)
    except (URLError, OSError, TimeoutError):
        return Response(0, url, fault='network-or-timeout')


class Revision(HTMLParser):
    def __init__(self):
        super().__init__()
        self.values = []
        self.malformed = False

    def handle_starttag(self, tag, attrs):
        if tag != 'meta':
            return
        # HTMLParser retains duplicate attributes. Collapsing with dict(attrs)
        # could hide a stale revision behind a second, expected content value.
        names = [value for name, value in attrs if name == 'name']
        if 'playmancer-revision' not in names:
            return
        contents = [value for name, value in attrs if name == 'content']
        if len(names) != 1 or len(contents) != 1:
            self.malformed = True
        self.values.append(contents[0] if len(contents) == 1 else None)


def revision_diagnostic(html):
    """Require exactly one valid marker; never accept a mixed-version document."""
    parser = Revision()
    parser.feed(html)
    if parser.malformed or len(parser.values) != 1:
        return None, ('AMBIGUOUS_REVISION_MARKERS' if parser.values
                      else 'MISSING_OR_INVALID_REVISION')
    value = parser.values[0]
    if value is None or re.fullmatch('[0-9a-f]{40}', value) is None:
        return None, 'MISSING_OR_INVALID_REVISION'
    return value, None


def served_revision(html):
    return revision_diagnostic(html)[0]


def served_worker_revision(js):
    """Read a validated revision prefix; never emit untrusted worker content."""
    marker = re.match(r"// playmancer-revision:([0-9a-f]{40})\r?\n", js)
    return marker.group(1) if marker else None


def served_stylesheet_revision(css):
    """Read only a bounded, well-shaped build marker at the stylesheet start."""
    marker = re.match(r"/\\* playmancer-revision:([0-9a-f]{40}) \\*/\\r?\\n", css)
    return marker.group(1) if marker else None


def observation(response, url, expected, kind):
    if response.fault:
        return 'NETWORK_OR_TIMEOUT'
    if 300 <= response.status < 400:
        return 'REDIRECT_OR_WRONG_ORIGIN'
    if response.status != 200:
        return f'HTTP_{response.status}'
    if response.url != url:
        return 'REDIRECT_OR_WRONG_ORIGIN'
    if len(response.body) > 1_000_000:
        return 'OVERSIZED_RESPONSE'
    if kind == 'worker':
        if 'self.onmessage =' not in response.body:
            return 'MISSING_WORKER_ENTRY'
        # A mixed worker bundle must not pass because its first line is valid.
        if response.body.count('// playmancer-revision:') > 1:
            return 'AMBIGUOUS_WORKER_REVISION_MARKERS'
        actual = served_worker_revision(response.body)
        if actual == expected:
            return 'OK'
        if actual:
            return f'STALE_WORKER_REVISION:{actual}'
        return 'MISSING_OR_INVALID_WORKER_REVISION'
    if kind == 'stylesheet':
        if response.body.count('/* playmancer-revision:') > 1:
            return 'AMBIGUOUS_STYLESHEET_REVISION_MARKERS'
        actual = served_stylesheet_revision(response.body)
        if not actual:
            return 'MISSING_OR_INVALID_STYLESHEET_REVISION'
        if actual != expected:
            return f'STALE_STYLESHEET_REVISION:{actual}'
        if len(response.body) < 100:
            return 'INCOMPLETE_STYLESHEET'
        return 'OK'
    # Reject a recognizable unbuilt branch/Jekyll entry even if it somehow
    # contains the expected marker. A matching SHA alone is not a built player.
    if kind == 'index' and 'src/demo-ui.js' in response.body:
        return 'UNBUILT_SOURCE_TEMPLATE'  # Suspicious source output, not proven cause.
    actual, problem = revision_diagnostic(response.body)
    if problem:
        return problem
    if actual == expected:
        return 'OK'
    return f'STALE_REVISION:{actual}'  # Only validated public SHA is logged.


def failed_observation(response, url, kind, reason):
    """Log bounded HTTP and verified marker shape, never response bytes or URLs.

    A well-shaped revision is only an observation, NOT proof that an
    unbuilt source template or invalid worker is a deployed player.
    """
    status = response.status if type(response.status) is int and 0 <= response.status <= 599 else 0
    actual = None
    if (not response.fault and status == 200 and response.url == url and
            len(response.body) <= 1_000_000):
        if kind == 'worker':
            # Do not report the first marker of a mixed-version worker as truth.
            if response.body.count('// playmancer-revision:') <= 1:
                actual = served_worker_revision(response.body)
        elif kind == 'stylesheet':
            if response.body.count('/* playmancer-revision:') <= 1:
                actual = served_stylesheet_revision(response.body)
        else:
            actual = served_revision(response.body)
    return f'{kind}={reason}; {kind}_http={status}; {kind}_served_sha={actual or "UNKNOWN"}'


def probe(base_url, expected_sha, fetch=fetch_public):
    """Return (pass, safe diagnostic), short-circuiting on an invalid index."""
    base = base_url.rstrip('/') + '/'
    index_response = fetch(base)
    index = observation(index_response, base, expected_sha, 'index')
    if index != 'OK':
        return False, (failed_observation(index_response, base, 'index', index) +
            '; worker=NOT_CHECKED; explorer=NOT_CHECKED; stylesheet=NOT_CHECKED')
    worker_url = base + 'bridge-worker.js'
    worker_response = fetch(worker_url)
    worker = observation(worker_response, worker_url, expected_sha, 'worker')
    if worker != 'OK':
        return False, ('index=OK; ' + failed_observation(worker_response, worker_url, 'worker', worker) +
            '; explorer=NOT_CHECKED; stylesheet=NOT_CHECKED')
    explorer_url = base + 'observations.html'
    explorer_response = fetch(explorer_url)
    explorer = observation(explorer_response, explorer_url, expected_sha, 'explorer')
    if explorer != 'OK':
        return False, ('index=OK; worker=OK; ' +
            failed_observation(explorer_response, explorer_url, 'explorer', explorer) +
            '; stylesheet=NOT_CHECKED')
    # CSS is a separate asset and can lag an otherwise exact-revision HTML/worker.
    # Treat a missing or stale stylesheet as a failed Pages release, not a visual pass.
    stylesheet_url = base + 'player.css'
    stylesheet_response = fetch(stylesheet_url)
    stylesheet = observation(stylesheet_response, stylesheet_url, expected_sha, 'stylesheet')
    if stylesheet != 'OK':
        return False, ('index=OK; worker=OK; explorer=OK; ' +
            failed_observation(stylesheet_response, stylesheet_url, 'stylesheet', stylesheet))
    return True, 'index=OK; worker=OK; explorer=OK; stylesheet=OK'


def verify(base_url, expected_sha, fetch=fetch_public, attempts=12, sleep=time.sleep, emit=print):
    validate_hosted_identity(base_url, expected_sha)
    if not 1 <= attempts <= 12:
        raise ValueError('Invalid bounded attempt count')
    previous = None
    for number in range(1, attempts + 1):
        ok, detail = probe(base_url, expected_sha, fetch)
        if ok:
            emit(f'Pages LIVE_VERIFIED attempt {number}/{attempts}: {detail}; expected_sha={expected_sha}')
            return True
        if detail != previous or number == attempts:
            emit(f'Pages NOT_READY attempt {number}/{attempts}: {detail}; expected_sha={expected_sha}')
        previous = detail
        if number < attempts:
            sleep(10)
    emit('Pages verification failed: no exact-revision index, worker and explorer in retry window')
    return False


def main(argv=None):
    args = sys.argv[1:] if argv is None else argv
    # Deployment waits for normal CDN propagation; final post-browser verification
    # is a single strict observation so a competing publisher cannot be masked
    # by a later retry within this specific regression gate.
    if args not in ([], ['--once']):
        print('Usage: pages_live_probe.py [--once]', file=sys.stderr)
        return 2
    url = os.environ.get('DEPLOY_URL', '')
    sha = os.environ.get('EXPECTED_SHA', '')
    try:
        return 0 if verify(url, sha, attempts=1 if args else 12) else 1
    except ValueError as exc:
        print(f'Invalid Pages probe input: {exc}', file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
