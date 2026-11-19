import hashlib
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from pages_live_probe import Response, probe, verify, served_revision, main

BASE = 'https://drevendev.github.io/Playmancer/'
SHA = 'a' * 40
OLD = 'b' * 40

def index(sha=SHA):
    return f'<html><meta name="playmancer-revision" content="{sha}"></html>'

def stylesheet(sha=SHA):
    body = f'/* playmancer-revision:{sha} */\n' + ':root{' + 'x' * 120 + '}'
    digest = hashlib.sha256(body.encode('utf-8')).hexdigest()
    return body + f'\n/* playmancer-stylesheet-sha256:{digest} */\n'

class FakeFetch:
    def __init__(self, index_body=None, index_status=200, worker_status=200,
                 worker_body='// playmancer-revision:' + SHA + '\nself.onmessage =', explorer_body=None, explorer_status=200, redirect=False,
                 stylesheet_body=None, stylesheet_status=200, stylesheet_redirect=False):
        self.body = index() if index_body is None else index_body
        self.index_status = index_status
        self.worker_status = worker_status
        self.worker_body = worker_body
        self.explorer_body = index() if explorer_body is None else explorer_body
        self.explorer_status = explorer_status
        self.redirect = redirect
        self.stylesheet_body = stylesheet() if stylesheet_body is None else stylesheet_body
        self.stylesheet_status = stylesheet_status
        self.stylesheet_redirect = stylesheet_redirect
        self.calls = []
    def __call__(self, url):
        self.calls.append(url)
        if url == BASE:
            return Response(self.index_status, url, self.body)
        if url.endswith('bridge-worker.js'):
            return Response(self.worker_status, 'https://elsewhere.example/' if self.redirect else url, self.worker_body)
        if url.endswith('player.css'):
            return Response(self.stylesheet_status,
                'https://elsewhere.invalid/' if self.stylesheet_redirect else url,
                self.stylesheet_body)
        return Response(self.explorer_status, url, self.explorer_body)

class PagesProbeTests(unittest.TestCase):
    def test_exact_revision_worker_explorer_success(self):
        fetch = FakeFetch()
        self.assertEqual(probe(BASE, SHA, fetch),
            (True, 'index=OK; worker=OK; explorer=OK; stylesheet=OK'))
        self.assertEqual(fetch.calls, [BASE, BASE + 'bridge-worker.js',
            BASE + 'observations.html', BASE + 'player.css'])

    def test_stylesheet_is_a_required_revision_pinned_public_asset(self):
        cases = [
            (FakeFetch(stylesheet_status=404), 'HTTP_404'),
            (FakeFetch(stylesheet_redirect=True), 'REDIRECT_OR_WRONG_ORIGIN'),
            (FakeFetch(stylesheet_body=stylesheet(OLD)), 'STALE_STYLESHEET_REVISION:' + OLD),
            (FakeFetch(stylesheet_body=':root{color:red}'), 'MISSING_OR_INVALID_STYLESHEET_REVISION'),
            (FakeFetch(stylesheet_body='/* playmancer-revision:' + SHA + ' */\n'),
                'INCOMPLETE_STYLESHEET'),
            # A prefix and >100 bytes is still incomplete when the tail is lost.
            (FakeFetch(stylesheet_body=stylesheet(SHA)[:150]), 'INCOMPLETE_STYLESHEET'),
            (FakeFetch(stylesheet_body=stylesheet(SHA)[:-2]), 'INCOMPLETE_STYLESHEET'),
            (FakeFetch(stylesheet_body=stylesheet(SHA).replace('xxxxx', 'yyyyy', 1)),
                'CORRUPT_STYLESHEET'),
            (FakeFetch(stylesheet_body=stylesheet(SHA) + stylesheet(OLD)),
                'AMBIGUOUS_STYLESHEET_REVISION_MARKERS'),
        ]
        for client, expected in cases:
            with self.subTest(expected=expected):
                ok, detail = probe(BASE, SHA, client)
                self.assertFalse(ok)
                self.assertIn('stylesheet=' + expected, detail)
                self.assertIn('stylesheet_http=', detail)
                self.assertNotIn('https://', detail)
                self.assertEqual(client.calls[-1], BASE + 'player.css')
        self.assertIn('stylesheet_served_sha=' + OLD,
            probe(BASE, SHA, FakeFetch(stylesheet_body=stylesheet(OLD)))[1])

    def test_detects_source_root_html_not_rebuilt(self):
        fetch = FakeFetch(index_body='<script src="./src/demo-ui.js"></script>')
        self.assertIn('UNBUILT_SOURCE_TEMPLATE', probe(BASE, SHA, fetch)[1])
        self.assertEqual(len(fetch.calls), 1)

    def test_unbuilt_source_reports_http_and_only_validated_observed_revision(self):
        for body, expected in [
            ('<script src="./src/demo-ui.js"></script>', 'UNKNOWN'),
            (index(OLD) + '<script src="./src/demo-ui.js"></script>', OLD),
            (index(OLD) + index(SHA) + '<script src="./src/demo-ui.js"></script>', 'UNKNOWN'),
            ('<meta name="playmancer-revision" content="PRIVATE_TOKEN">' +
                '<script src="./src/demo-ui.js"></script>', 'UNKNOWN'),
        ]:
            with self.subTest(expected=expected):
                ok, detail = probe(BASE, SHA, FakeFetch(index_body=body))
                self.assertFalse(ok)
                self.assertIn('index=UNBUILT_SOURCE_TEMPLATE; index_http=200; '
                    'index_served_sha=' + expected, detail)
                self.assertIn('worker=NOT_CHECKED; explorer=NOT_CHECKED', detail)
                self.assertNotIn('PRIVATE_TOKEN', detail)
                self.assertNotIn('<script', detail)

    def test_failed_gates_report_bounded_status_and_safe_revision(self):
        cases = [
            (FakeFetch(index_status=404),
                'index=HTTP_404; index_http=404; index_served_sha=UNKNOWN'),
            (FakeFetch(worker_status=503),
                'worker=HTTP_503; worker_http=503; worker_served_sha=UNKNOWN'),
            (FakeFetch(worker_body='// playmancer-revision:' + OLD +
                chr(10) + 'self.onmessage ='),
                'worker=STALE_WORKER_REVISION:' + OLD +
                '; worker_http=200; worker_served_sha=' + OLD),
            (FakeFetch(explorer_body=index(OLD)),
                'explorer=STALE_REVISION:' + OLD +
                '; explorer_http=200; explorer_served_sha=' + OLD),
            (FakeFetch(explorer_body=index(OLD) + index(SHA)),
                'explorer=AMBIGUOUS_REVISION_MARKERS; explorer_http=200; '
                'explorer_served_sha=UNKNOWN'),
        ]
        for fetch, diagnostic in cases:
            with self.subTest(diagnostic=diagnostic):
                ok, detail = probe(BASE, SHA, fetch)
                self.assertFalse(ok)
                self.assertIn(diagnostic, detail)
                self.assertNotIn('https://', detail)
        # A redirected origin, oversized body or failed request has no trusted marker.
        responses = [
            Response(200, 'https://elsewhere.invalid/', index(OLD)),
            Response(200, BASE, index(OLD) + 'x' * 1_000_001),
            Response(0, BASE, index(OLD), fault='network-or-timeout'),
        ]
        for response in responses:
            ok, detail = probe(BASE, SHA, lambda url: response)
            self.assertFalse(ok)
            self.assertIn('index_served_sha=UNKNOWN', detail)

    def test_matching_sha_does_not_rescue_unbuilt_source_template(self):
        client = FakeFetch(index_body=index() + '<script src="./src/demo-ui.js"></script>')
        ok, detail = probe(BASE, SHA, client)
        self.assertFalse(ok)
        self.assertIn('index=UNBUILT_SOURCE_TEMPLATE', detail)
        self.assertEqual(client.calls, [BASE])

    def test_duplicate_revision_markers_fail_closed_even_with_current_sha(self):
        for body in [
            index(OLD) + index(SHA),
            index(SHA) + index(OLD),
            index(SHA) + index(SHA),
            index(SHA) + '<meta name="playmancer-revision" content="private">',
        ]:
            with self.subTest(body=body):
                self.assertIsNone(served_revision(body))
                client = FakeFetch(index_body=body)
                ok, detail = probe(BASE, SHA, client)
                self.assertFalse(ok)
                self.assertIn('index=AMBIGUOUS_REVISION_MARKERS', detail)
                self.assertEqual(client.calls, [BASE])
                self.assertNotIn('private', detail)

    def test_explorer_with_mixed_revision_markers_fails_after_valid_worker(self):
        client = FakeFetch(explorer_body=index(SHA) + index(OLD))
        ok, detail = probe(BASE, SHA, client)
        self.assertFalse(ok)
        self.assertIn('index=OK; worker=OK; explorer=AMBIGUOUS_REVISION_MARKERS', detail)
        self.assertEqual(len(client.calls), 3)

    def test_duplicate_revision_attributes_cannot_override_stale_or_invalid_data(self):
        cases = [
            f'<meta name="playmancer-revision" content="{OLD}" content="{SHA}">',
            f'<meta name="playmancer-revision" content="{SHA}" content="{OLD}">',
            f'<meta name="other" name="playmancer-revision" content="{SHA}">',
            f'<meta name="playmancer-revision" name="other" content="{SHA}">',
            f'<meta name="playmancer-revision" content="{SHA}" name="playmancer-revision">',
        ]
        for body in cases:
            with self.subTest(body=body):
                self.assertIsNone(served_revision(body))
                client = FakeFetch(index_body=body)
                ok, detail = probe(BASE, SHA, client)
                self.assertFalse(ok)
                self.assertIn('index=AMBIGUOUS_REVISION_MARKERS', detail)
                self.assertEqual(client.calls, [BASE])
        # The observations page is checked independently, not just the index.
        client = FakeFetch(explorer_body=cases[0])
        self.assertIn('explorer=AMBIGUOUS_REVISION_MARKERS', probe(BASE, SHA, client)[1])

    def test_duplicate_worker_revision_markers_abort_before_explorer(self):
        for tail in ('// playmancer-revision:' + OLD,
                     '// playmancer-revision:' + SHA,
                     '// playmancer-revision:untrusted'):
            with self.subTest(tail=tail):
                body = '// playmancer-revision:' + SHA + '\nself.onmessage = () => {}\n' + tail
                client = FakeFetch(worker_body=body)
                ok, detail = probe(BASE, SHA, client)
                self.assertFalse(ok)
                self.assertIn('worker=AMBIGUOUS_WORKER_REVISION_MARKERS', detail)
                self.assertIn('explorer=NOT_CHECKED', detail)
                self.assertEqual(len(client.calls), 2)
                self.assertNotIn('untrusted', detail)

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

    def test_worker_revision_must_match_index_before_explorer_is_checked(self):
        for body, label in [
            ('// playmancer-revision:' + OLD + '\nself.onmessage =', 'STALE_WORKER_REVISION:' + OLD),
            ('self.onmessage =', 'MISSING_OR_INVALID_WORKER_REVISION'),
            ('// playmancer-revision:PRIVATE\nself.onmessage =', 'MISSING_OR_INVALID_WORKER_REVISION'),
        ]:
            with self.subTest(label=label):
                client = FakeFetch(worker_body=body)
                ok, detail = probe(BASE, SHA, client)
                self.assertFalse(ok)
                self.assertIn('worker=' + label, detail)
                self.assertIn('explorer=NOT_CHECKED', detail)
                self.assertEqual(len(client.calls), 2)
                self.assertNotIn('PRIVATE', detail)

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

    def test_once_flag_is_single_strict_observation_and_default_keeps_bounded_retry(self):
        with patch.dict(os.environ, {'DEPLOY_URL': BASE, 'EXPECTED_SHA': SHA}):
            with patch('pages_live_probe.verify', return_value=True) as check:
                self.assertEqual(main(['--once']), 0)
                check.assert_called_once_with(BASE, SHA, attempts=1)
            with patch('pages_live_probe.verify', return_value=True) as check:
                self.assertEqual(main([]), 0)
                check.assert_called_once_with(BASE, SHA, attempts=12)
            with patch('pages_live_probe.verify', return_value=True) as check:
                self.assertEqual(main(['--unknown']), 2)
                check.assert_not_called()
            with patch('pages_live_probe.verify', return_value=False):
                self.assertEqual(main(['--once']), 1)

    def test_marker_invalid_never_prints_untrusted_value(self):
        self.assertIsNone(served_revision('<meta name="playmancer-revision" content="<SECRET>">'))
        self.assertIn('MISSING_OR_INVALID_REVISION',
            probe(BASE, SHA, FakeFetch(index_body='<meta name="playmancer-revision" content="private">'))[1])

if __name__ == '__main__': unittest.main()
