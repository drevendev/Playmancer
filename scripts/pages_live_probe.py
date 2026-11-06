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
        self.value = None

    def handle_starttag(self, tag, attrs):
        if tag == 'meta':
            values = dict(attrs)
            if values.get('name') == 'playmancer-revision':
                self.value = values.get('content')


def served_revision(html):
    parser = Revision()
    parser.feed(html)
    value = parser.value
    return value if value is not None and re.fullmatch('[0-9a-f]{40}', value) else None


def served_worker_revision(js):
    """Read a validated revision prefix; never emit untrusted worker content."""
    marker = re.match(r"// playmancer-revision:([0-9a-f]{40})\r?\n", js)
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
        actual = served_worker_revision(response.body)
        if actual == expected:
            return 'OK'
        if actual:
            return f'STALE_WORKER_REVISION:{actual}'
        return 'MISSING_OR_INVALID_WORKER_REVISION'
    actual = served_revision(response.body)
    if actual == expected:
        return 'OK'
    if actual:
        return f'STALE_REVISION:{actual}'  # Only validated public SHA is logged.
    if kind == 'index' and 'src/demo-ui.js' in response.body:
        return 'UNBUILT_SOURCE_TEMPLATE'  # Likely branch/Jekyll output, not proven cause.
    return 'MISSING_OR_INVALID_REVISION'


def probe(base_url, expected_sha, fetch=fetch_public):
    """Return (pass, safe diagnostic), short-circuiting on an invalid index."""
    base = base_url.rstrip('/') + '/'
    index = observation(fetch(base), base, expected_sha, 'index')
    if index != 'OK':
        return False, f'index={index}; worker=NOT_CHECKED; explorer=NOT_CHECKED'
    worker_url = base + 'bridge-worker.js'
    worker = observation(fetch(worker_url), worker_url, expected_sha, 'worker')
    if worker != 'OK':
        return False, f'index=OK; worker={worker}; explorer=NOT_CHECKED'
    explorer_url = base + 'observations.html'
    explorer = observation(fetch(explorer_url), explorer_url, expected_sha, 'explorer')
    return explorer == 'OK', f'index=OK; worker=OK; explorer={explorer}'


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
