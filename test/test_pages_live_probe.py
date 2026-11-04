import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from pages_live_probe import Response, probe, verify, served_revision

BASE = 'https://drevendev.github.io/Playmancer/'
SHA = 'a' * 40
OLD = 'b' * 40

def index(sha=SHA):
    return f'<html><meta name="playmancer-revision" content="{sha}"></html>'

class FakeFetch:
    def __init__(self, index_body=None, index_status=200, worker_status=200,
                 worker_body='self.onmessage =', explorer_body=None, explorer_status=200, redirect=False):
        self.body = index() if index_body is None else index_body
        self.index_status = index_status
        self.worker_status = worker_status
        self.worker_body = worker_body
        self.explorer_body = index() if explorer_body is None else explorer_body
        self.explorer_status = explorer_status
        self.redirect = redirect
        self.calls = []
    def __call__(self, url):
        self.calls.append(url)
        if url == BASE:
            return Response(self.index_status, url, self.body)
        if url.endswith('bridge-worker.js'):
            return Response(self.worker_status, 'https://elsewhere.example/' if self.redirect else url, self.worker_body)
        return Response(self.explorer_status, url, self.explorer_body)

class PagesProbeTests(unittest.TestCase):
    def test_exact_revision_worker_explorer_success(self):
        fetch = FakeFetch()
        self.assertEqual(probe(BASE, SHA, fetch), (True, 'index=OK; worker=OK; explorer=OK'))
        self.assertEqual(len(fetch.calls), 3)

    def test_detects_source_root_html_not_rebuilt(self):
        fetch = FakeFetch(index_body='<script src="./src/demo-ui.js"></script>')
        self.assertIn('UNBUILT_SOURCE_TEMPLATE', probe(BASE, SHA, fetch)[1])
        self.assertEqual(len(fetch.calls), 1)

    def test_logs_only_safe_sha_and_catches_stale_content(self):
        ok, diag = probe(BASE, SHA, FakeFetch(index_body=index(OLD)))
        self.assertFalse(ok)
        self.assertIn('STALE_REVISION:' + OLD, diag)
        self.assertNotIn('src=', diag)

    def test_http_status_and_missing_marker(self):
        self.assertIn('HTTP_404', probe(BASE, SHA, FakeFetch(index_status=404))[1])
        self.assertIn('MISSING_OR_INVALID_REVISION', probe(BASE, SHA, FakeFetch(index_body='<html/>'))[1])

    def test_worker_status_content_and_redirect(self):
        for client, label in [(FakeFetch(worker_status=503),'HTTP_503'),
                              (FakeFetch(worker_body='not a worker'),'MISSING_WORKER_ENTRY'),
                              (FakeFetch(redirect=True),'REDIRECT_OR_WRONG_ORIGIN')]:
            with self.subTest(label=label):
                self.assertIn('worker='+label, probe(BASE, SHA, client)[1])

    def test_http_redirect_status_is_not_a_valid_worker(self):
        self.assertIn('worker=REDIRECT_OR_WRONG_ORIGIN',
            probe(BASE, SHA, FakeFetch(worker_status=302))[1])

    def test_explorer_must_match_revision(self):
        self.assertIn('explorer=STALE_REVISION:'+OLD, probe(BASE, SHA, FakeFetch(explorer_body=index(OLD)))[1])
        self.assertIn('explorer=HTTP_404', probe(BASE, SHA, FakeFetch(explorer_status=404))[1])

    def test_bounded_retry_recovers_after_stale_then_current(self):
        current = FakeFetch()
        state = {'calls':0}
        def fetch(url):
            if url == BASE:
                state['calls'] += 1
                if state['calls'] < 3:
                    return Response(200, url, index(OLD))
            return current(url)
        pauses, messages = [], []
        self.assertTrue(verify(BASE, SHA, fetch, attempts=4, sleep=pauses.append, emit=messages.append))
        self.assertEqual(pauses, [10,10])
        self.assertEqual(state['calls'], 3)
        self.assertIn('LIVE_VERIFIED', messages[-1])
        self.assertEqual(sum('NOT_READY' in m for m in messages),1)

    def test_bounded_failure_and_invalid_inputs(self):
        pauses, messages = [], []
        self.assertFalse(verify(BASE, SHA, FakeFetch(index_status=404), attempts=3,
                                sleep=pauses.append, emit=messages.append))
        self.assertEqual(pauses, [10,10])
        self.assertTrue(any('HTTP_404' in m for m in messages))
        with self.assertRaises(ValueError):
            verify(BASE, SHA, attempts=13)
        with self.assertRaises(ValueError):
            verify('http://drevendev.github.io/Playmancer/', SHA)

    def test_marker_invalid_never_prints_untrusted_value(self):
        self.assertIsNone(served_revision('<meta name="playmancer-revision" content="<SECRET>">'))
        self.assertIn('MISSING_OR_INVALID_REVISION',
            probe(BASE, SHA, FakeFetch(index_body='<meta name="playmancer-revision" content="private">'))[1])

if __name__ == '__main__': unittest.main()
