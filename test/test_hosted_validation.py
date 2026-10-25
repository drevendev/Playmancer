"""Regressions for canonical Pages authority and off-origin worker redirects."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from hosted_validation import validate_hosted_identity, verified_same_origin_worker

BASE = 'https://drevendev.github.io/Playmancer'
SHA = 'a' * 40


class Response:
    def __init__(self, status, url, body):
        self.status, self.url, self.body = status, url, body

    def text(self):
        return self.body


class Request:
    def __init__(self, response):
        self.response = response
        self.args = None

    def get(self, url, **kwargs):
        self.args = (url, kwargs)
        return self.response


class RedirectingRequest(Request):
    """Without max_redirects=0, an off-origin 200 would appear valid."""
    def get(self, url, **kwargs):
        self.args = (url, kwargs)
        if kwargs.get('max_redirects') == 0:
            return Response(302, url, '')
        return Response(200, 'https://other.example/bridge-worker.js', 'self.onmessage =')


class HostedIdentityTests(unittest.TestCase):
    def test_accepts_canonical_url_with_or_without_trailing_slash(self):
        for url in (BASE, BASE + '/'):
            with self.subTest(url=url):
                validate_hosted_identity(url, SHA)

    def test_rejects_noncanonical_authority_and_route(self):
        for url in (
            'https://drevendev.github.io:8443/Playmancer/',
            'https://user:pass@drevendev.github.io/Playmancer/',
            'http://drevendev.github.io/Playmancer/',
            'https://evil.example/Playmancer/',
            'https://drevendev.github.io/Playmancer/other',
            BASE + '/?redirect=1',
        ):
            with self.subTest(url=url), self.assertRaises(ValueError):
                validate_hosted_identity(url, SHA)

    def test_rejects_missing_or_invalid_revision_and_local_override(self):
        for revision in (None, '', 'broken', 'A' * 40):
            with self.subTest(revision=revision), self.assertRaises(ValueError):
                validate_hosted_identity(BASE, revision)
        with self.assertRaises(ValueError):
            validate_hosted_identity(BASE, SHA, 'local-artifact')

    def test_accepts_exact_worker_without_redirect(self):
        url = BASE + '/bridge-worker.js'
        request = Request(Response(200, url, 'self.onmessage = function () {}'))
        self.assertTrue(verified_same_origin_worker(request, BASE))
        self.assertEqual(request.args, (url, {'timeout': 15000, 'max_redirects': 0}))

    def test_rejects_302_to_off_origin_worker(self):
        request = RedirectingRequest(None)
        self.assertFalse(verified_same_origin_worker(request, BASE))
        self.assertEqual(request.args[1]['max_redirects'], 0)

    def test_rejects_off_origin_final_url_even_if_200(self):
        request = Request(Response(200, 'https://other.example/bridge-worker.js', 'self.onmessage ='))
        self.assertFalse(verified_same_origin_worker(request, BASE))

    def test_rejects_missing_worker_or_wrong_body(self):
        url = BASE + '/bridge-worker.js'
        for response in (Response(404, url, 'self.onmessage ='), Response(200, url, 'missing')):
            with self.subTest(response=response.status):
                self.assertFalse(verified_same_origin_worker(Request(response), BASE))


if __name__ == '__main__':
    unittest.main()
