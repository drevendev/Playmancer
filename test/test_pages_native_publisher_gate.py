"""Offline regressions for the dynamic Pages publisher sequencing fence."""
import sys
import unittest
from pathlib import Path
from urllib.error import HTTPError, URLError
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from pages_native_publisher_gate import (GateError, TransientGateError,
                                         MAX_TRANSIENT_FAILURES, NATIVE_PATH,
                                         classify, fetch_json, wait_for_safe_order)

SHA = 'a' * 40
OTHER = 'b' * 40
REPO = 'drevendev/Playmancer'


def native(status='completed', sha=SHA, run_id=321, conclusion='success',
           event='dynamic', path=NATIVE_PATH):
    return dict(status=status, head_sha=sha, id=run_id, conclusion=conclusion,
                event=event, path=path)


def listing(*runs):
    return dict(total_count=len(runs), workflow_runs=list(runs))


class FenceTests(unittest.TestCase):
    def test_http_server_failures_are_transient_but_auth_errors_are_terminal(self):
        for status in (500, 502, 503, 504, 401, 403, 404):
            with self.subTest(status=status):
                failure = HTTPError('https://api.github.com', status, 'fixture', None, None)
                with patch('pages_native_publisher_gate.urlopen', side_effect=failure):
                    with self.assertRaises(GateError) as result:
                        fetch_json('https://api.github.com/fixture', 'placeholder-token')
                expected = TransientGateError if status >= 500 else GateError
                self.assertIs(type(result.exception), expected)
                self.assertEqual(str(result.exception), f'GitHub API HTTP_{status}')
        with patch('pages_native_publisher_gate.urlopen', side_effect=URLError('fixture')):
            with self.assertRaises(TransientGateError) as result:
                fetch_json('https://api.github.com/fixture', 'placeholder-token')
        self.assertEqual(str(result.exception), 'GitHub API NETWORK_OR_TIMEOUT')

    def test_gateway_failures_retry_full_poll_before_releasing_same_sha(self):
        replies = iter([TransientGateError('GitHub API HTTP_502'),
                        {'build_type': 'legacy'}, TransientGateError('GitHub API HTTP_503'),
                        {'build_type': 'legacy'}, listing(native())])
        urls, pauses, messages = [], [], []
        def fetch(url, token):
            urls.append(url)
            self.assertEqual(token, 'never-log-this-token')
            response = next(replies)
            if isinstance(response, Exception):
                raise response
            return response
        self.assertTrue(wait_for_safe_order(
            REPO, SHA, 'never-log-this-token', fetch=fetch,
            sleep=pauses.append, emit=messages.append, max_polls=4))
        self.assertEqual(pauses, [15, 15])
        self.assertEqual(len(urls), 5)
        self.assertEqual([url.endswith('/pages') for url in urls],
                         [True, True, False, True, False])
        self.assertIn('NATIVE_FINISHED', messages[-1])
        self.assertNotIn('never-log-this-token', ''.join(messages))

    def test_repeated_gateway_failure_exhausts_small_budget_without_deploy(self):
        pauses, messages = [], []
        with self.assertRaisesRegex(GateError, 'bounded transient retry budget exhausted'):
            wait_for_safe_order(
                REPO, SHA, 'token',
                fetch=lambda *_: (_ for _ in ()).throw(TransientGateError('GitHub API HTTP_502')),
                sleep=pauses.append, emit=messages.append, max_polls=MAX_TRANSIENT_FAILURES + 1)
        self.assertEqual(pauses, [15] * (MAX_TRANSIENT_FAILURES - 1))
        self.assertEqual(len(messages), MAX_TRANSIENT_FAILURES - 1)

    def test_permanent_api_error_stops_without_sleep_or_deploy(self):
        with self.assertRaisesRegex(GateError, 'GitHub API HTTP_403'):
            wait_for_safe_order(
                REPO, SHA, 'token',
                fetch=lambda *_: (_ for _ in ()).throw(GateError('GitHub API HTTP_403')),
                sleep=lambda _: self.fail('Must not retry a permissions error'),
                emit=lambda _: self.fail('Must not announce publication'),
                max_polls=4)

    def test_current_native_run_facts_match_only_exact_event_path_sha(self):
        payload = listing(native(sha=OTHER), native(event='push'),
                          native(path='.github/workflows/pages.yml'),
                          native(run_id=42400627525))
        self.assertEqual(classify({'build_type': 'legacy'}, payload, SHA),
                         ('NATIVE_FINISHED', (42400627525,)))

    def test_legacy_waits_for_all_matching_native_runs(self):
        self.assertEqual(classify({'build_type': 'legacy'}, listing(
            native(run_id=20), native(status='in_progress', run_id=21, conclusion=None)), SHA),
            ('WAIT_NATIVE_ACTIVE', (20, 21)))

    def test_failed_native_run_is_still_finished_and_custom_can_publish(self):
        self.assertEqual(classify({'build_type': 'legacy'}, listing(native(
            conclusion='failure')), SHA)[0], 'NATIVE_FINISHED')

    def test_native_startup_failure_is_terminal_without_jobs(self):
        # Observed GitHub native Pages run #43095218550 completed with
        # startup_failure for master f2d06fb, and scheduled no jobs.
        self.assertEqual(classify({'build_type': 'legacy'}, listing(
            native(conclusion='startup_failure')), SHA),
            ('NATIVE_FINISHED', (321,)))
        self.assertEqual(classify({'build_type': 'legacy'}, listing(
            native(run_id=321), native(run_id=322, conclusion='startup_failure')), SHA),
            ('NATIVE_FINISHED', (321, 322)))
        # A conclusion alone never proves completion; missing/unknown still waits.
        for unfinished in (native(status='queued', conclusion='startup_failure'),
                           native(status='completed', conclusion=None),
                           native(status='completed', conclusion='unknown')):
            with self.subTest(unfinished=unfinished):
                self.assertEqual(classify({'build_type': 'legacy'}, listing(unfinished), SHA),
                                 ('WAIT_NATIVE_ACTIVE', (321,)))

    def test_native_startup_failure_releases_bounded_wait_without_retry(self):
        requests, emitted = [], []
        responses = iter([{'build_type': 'legacy'},
                          listing(native(conclusion='startup_failure'))])
        def fetch(url, token):
            requests.append(url)
            return next(responses)
        self.assertTrue(wait_for_safe_order(REPO, SHA, 'test-only-token',
                        fetch=fetch, sleep=lambda _: self.fail('Must not sleep'),
                        emit=emitted.append, max_polls=1))
        self.assertEqual(len(requests), 2)
        self.assertIn('NATIVE_FINISHED', emitted[-1])
        self.assertNotIn('test-only-token', ''.join(emitted))

    def test_actions_only_source_does_not_wait_for_nonexistent_native_run(self):
        self.assertEqual(classify({'build_type': 'workflow'}, {}, SHA),
                         ('ACTIONS_ONLY_SOURCE', ()))

    def test_missing_native_is_not_guessed_as_source_disabled(self):
        self.assertEqual(classify({'build_type': 'legacy'}, listing(
            native(sha=OTHER)), SHA), ('WAIT_NATIVE_NOT_DISCOVERED', ()))

    def test_fails_closed_for_unknown_source_and_incomplete_data(self):
        for pages, runs in [(None, listing()), ({'build_type': None}, listing()),
                            ({'build_type': 'legacy'}, {'workflow_runs': []}),
                            ({'build_type': 'legacy'}, {'total_count': 101, 'workflow_runs': []}),
                            ({'build_type': 'legacy'}, listing({'head_sha':SHA,'event':'dynamic','path':NATIVE_PATH}))]:
            with self.subTest(pages=pages, runs=runs):
                with self.assertRaises(GateError):
                    classify(pages, runs, SHA)

    def test_incomplete_first_page_cannot_release_finished_native_gate(self):
        # GitHub says two same-SHA runs exist but returns only the completed one.
        truncated = {'total_count': 2, 'workflow_runs': [native(run_id=321)]}
        with self.assertRaisesRegex(GateError, 'incomplete'):
            classify({'build_type': 'legacy'}, truncated, SHA)
        # Extra runs and bool-as-int counts must also fail closed.
        for payload in ({'total_count': 0, 'workflow_runs': [native()]},
                        {'total_count': True, 'workflow_runs': [native()]}):
            with self.subTest(payload=payload), self.assertRaisesRegex(GateError, 'incomplete'):
                classify({'build_type': 'legacy'}, payload, SHA)

    def test_malformed_unrelated_run_cannot_be_silently_skipped(self):
        for bad in (None, {}, {'head_sha': OTHER, 'event': 'push'},
                    native(sha=OTHER, run_id=True)):
            with self.subTest(bad=bad), self.assertRaisesRegex(GateError, 'malformed'):
                classify({'build_type': 'legacy'}, listing(native(), bad), SHA)

    def test_polling_holds_custom_deploy_until_legacy_native_completed(self):
        replies = iter([{'build_type': 'legacy'}, listing(),
                        {'build_type': 'legacy'}, listing(native('queued', conclusion=None)),
                        {'build_type': 'legacy'}, listing(native())])
        urls, pauses, messages = [], [], []
        def fetch(url, token):
            urls.append(url)
            self.assertEqual(token, 'placeholder-not-printed')
            return next(replies)
        self.assertTrue(wait_for_safe_order(REPO, SHA, 'placeholder-not-printed',
                        fetch=fetch, sleep=pauses.append, emit=messages.append, max_polls=3))
        self.assertEqual(pauses, [15, 15])
        self.assertEqual(len(urls), 6)
        self.assertEqual(urls[1].split('head_sha=')[1], SHA + '&per_page=100')
        self.assertIn('NATIVE_FINISHED', messages[-1])
        self.assertNotIn('placeholder-not-printed', ''.join(messages))

    def test_timed_out_native_and_missing_native_do_not_silently_publish(self):
        for response in (listing(), listing(native('in_progress', conclusion=None))):
            responses = iter([{'build_type': 'legacy'}, response] * 3)
            pauses = []
            with self.subTest(response=response), self.assertRaisesRegex(GateError, 'bounded gate'):
                wait_for_safe_order(REPO, SHA, 'token', fetch=lambda url, token: next(responses),
                                    sleep=pauses.append, emit=lambda msg: None, max_polls=3)
            self.assertEqual(pauses, [15, 15])

    def test_admin_source_switch_midwait_releases_gate(self):
        replies = iter([{'build_type': 'legacy'}, listing(), {'build_type': 'workflow'}])
        self.assertTrue(wait_for_safe_order(REPO, SHA, 'token',
                        fetch=lambda url, token: next(replies),
                        sleep=lambda _: None, emit=lambda _: None, max_polls=2))

    def test_invalid_inputs_rejected_before_http(self):
        for repo, sha, token in [(REPO, 'notasha', 't'), ('bad/repo/extra', SHA, 't'),
                                  (REPO, SHA, '')]:
            with self.subTest(repo=repo), self.assertRaises(GateError):
                wait_for_safe_order(repo, sha, token, fetch=lambda *_: self.fail('HTTP'))


if __name__ == '__main__':
    unittest.main()
