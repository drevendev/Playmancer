"""Offline regressions for the dynamic Pages publisher sequencing fence."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from pages_native_publisher_gate import (GateError, NATIVE_PATH, classify,
                                         wait_for_safe_order)

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
