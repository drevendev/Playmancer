"""Fail-closed identity checks for Playmancer's published Pages acceptance."""
import re
from urllib.parse import urlsplit


def validate_hosted_identity(url, expected_sha, artifact_override=None):
    """Reject noncanonical or unversioned URLs before hosted browser checks."""
    parsed = urlsplit(url)
    if (parsed.scheme, parsed.netloc, parsed.path.rstrip('/'), parsed.query, parsed.fragment) != (
        'https', 'drevendev.github.io', '/Playmancer', '', ''
    ):
        raise ValueError('Hosted acceptance requires the canonical HTTPS Playmancer Pages URL')
    if not expected_sha or not re.fullmatch(r'[0-9a-f]{40}', expected_sha):
        raise ValueError('Hosted acceptance requires the exact deployed master SHA')
    if artifact_override:
        raise ValueError('Hosted acceptance cannot use a local artifact override')


def verified_same_origin_worker(request_context, base_url):
    """Require an actual 200 from this origin; never follow a worker redirect."""
    worker_url = base_url.rstrip('/') + '/bridge-worker.js'
    worker = request_context.get(worker_url, timeout=15000, max_redirects=0)
    return worker.status == 200 and worker.url == worker_url and 'self.onmessage =' in worker.text()
