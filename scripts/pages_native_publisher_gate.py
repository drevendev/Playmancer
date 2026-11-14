"""Fail-closed pre-deploy fence for GitHub Pages' legacy native publisher.

GitHub Pages configured to publish from a branch also schedules a separate
`dynamic/pages/pages-build-deployment` workflow for each master push. Our custom
Actions deployment must not overtake that publisher for the same commit. Only a
repository administrator can remove the second publisher by selecting Actions
as the Pages source; this fence is a temporary race mitigation, not that fix.
"""
import json
import os
import re
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

NATIVE_PATH = 'dynamic/pages/pages-build-deployment'
SHA_PATTERN = re.compile(r'[0-9a-f]{40}\Z')
REPO_PATTERN = re.compile(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+\Z')
MAX_POLLS = 32
POLL_SECONDS = 15
MAX_TRANSIENT_FAILURES = 3


class GateError(Exception):
    """A non-retriable input, API or publication sequencing failure."""


class TransientGateError(GateError):
    """A temporary GitHub API failure; retry only within the bounded fence."""


def api_http_error(status):
    kind = TransientGateError if 500 <= status < 600 else GateError
    return kind(f'GitHub API HTTP_{status}')


def fetch_json(url, token):
    """Read bounded GitHub API JSON without ever exposing the access token."""
    request = Request(url, headers={
        'Accept': 'application/vnd.github+json',
        'Authorization': 'Bearer ' + token,
        'X-GitHub-Api-Version': '2022-11-28',
    })
    try:
        with urlopen(request, timeout=15) as response:
            if response.status != 200:
                raise api_http_error(response.status)
            return json.loads(response.read(1_000_001))
    except HTTPError as exc:
        raise api_http_error(exc.code) from None
    except (URLError, OSError, TimeoutError):
        raise TransientGateError('GitHub API NETWORK_OR_TIMEOUT') from None
    except (json.JSONDecodeError, UnicodeError, ValueError):
        raise GateError('GitHub API INVALID_JSON') from None


def classify(pages, listing, sha):
    """Return (state, native IDs) using exact event/path/head, not display names."""
    if not isinstance(pages, dict):
        raise GateError('Pages source response is invalid')
    build_type = pages.get('build_type')
    if build_type == 'workflow':
        return 'ACTIONS_ONLY_SOURCE', ()
    if build_type != 'legacy':
        raise GateError('Pages source is unknown; cannot safely publish')
    if not isinstance(listing, dict) or not isinstance(listing.get('workflow_runs'), list):
        raise GateError('Workflow listing response is invalid')
    runs = listing['workflow_runs']
    count = listing.get('total_count')
    # An incomplete first page could omit a still-running native publisher.
    if type(count) is not int or count < 0 or count > 100 or len(runs) != count:
        raise GateError('Workflow listing is incomplete')
    # Do not silently discard malformed entries, even when they look unrelated.
    if any(not isinstance(run, dict)
           or type(run.get('id')) is not int
           or not isinstance(run.get('head_sha'), str)
           or not isinstance(run.get('event'), str)
           or not isinstance(run.get('path'), str)
           or not isinstance(run.get('status'), str)
           or 'conclusion' not in run
           or (run['conclusion'] is not None and not isinstance(run['conclusion'], str))
           for run in runs):
        raise GateError('Workflow listing contains malformed run entries')
    native = [run for run in runs
              if run.get('head_sha') == sha
              and run.get('event') == 'dynamic'
              and run.get('path') == NATIVE_PATH]
    if not native:
        return 'WAIT_NATIVE_NOT_DISCOVERED', ()
    ids = tuple(sorted(run.get('id') for run in native if isinstance(run.get('id'), int)))
    if len(ids) != len(native):
        raise GateError('Native publisher metadata is incomplete')
    # A native startup_failure is terminal even when GitHub schedules zero jobs.
    if all(run.get('status') == 'completed' and run.get('conclusion') in (
           'success', 'failure', 'cancelled', 'skipped', 'timed_out', 'action_required',
           'startup_failure')
           for run in native):
        return 'NATIVE_FINISHED', ids
    return 'WAIT_NATIVE_ACTIVE', ids


def wait_for_safe_order(repo, sha, token, fetch=fetch_json,
                        sleep=time.sleep, emit=print, max_polls=MAX_POLLS):
    if not REPO_PATTERN.fullmatch(repo) or not SHA_PATTERN.fullmatch(sha) or not token:
        raise GateError('Invalid repository, commit SHA or missing runtime token')
    if not 1 <= max_polls <= MAX_POLLS:
        raise GateError('Invalid bounded polling limit')
    base = f'https://api.github.com/repos/{repo}'
    last_state = None
    transient_failures = 0
    for attempt in range(1, max_polls + 1):
        try:
            # A retry must start at Pages configuration; never reuse a partial
            # source/listing read from a failed poll to release publication.
            pages = fetch(base + '/pages', token)
            if isinstance(pages, dict) and pages.get('build_type') == 'workflow':
                emit('Pages native fence: ACTIONS_ONLY_SOURCE; no native sequencing required')
                return True
            # GitHub emits the native run as event=dynamic with the SAME merge SHA.
            # Querying the run collection by SHA excludes other master publications.
            listing = fetch(base + '/actions/runs?head_sha=' + sha + '&per_page=100', token)
            state, ids = classify(pages, listing, sha)
        except TransientGateError as exc:
            transient_failures += 1
            if transient_failures >= MAX_TRANSIENT_FAILURES or attempt == max_polls:
                raise GateError(
                    f'{exc}; bounded transient retry budget exhausted '
                    f'({transient_failures}/{MAX_TRANSIENT_FAILURES})') from None
            emit(f'Pages native fence: temporary {exc}; retrying fresh exact-SHA poll '
                 f'({attempt}/{max_polls}); deployment held')
            sleep(POLL_SECONDS)
            continue
        if state == 'NATIVE_FINISHED':
            emit('Pages native fence: NATIVE_FINISHED for exact SHA; native run IDs=' +
                 ','.join(str(value) for value in ids))
            return True
        if state != last_state or attempt == max_polls:
            emit(f'Pages native fence: {state} ({attempt}/{max_polls}); delaying custom deploy')
        last_state = state
        if attempt < max_polls:
            sleep(POLL_SECONDS)
    raise GateError('Native Pages publisher not completed for exact SHA within bounded gate')


def main():
    try:
        ok = wait_for_safe_order(
            os.environ.get('GITHUB_REPOSITORY', ''),
            os.environ.get('GITHUB_SHA', ''),
            os.environ.get('GITHUB_TOKEN', ''),
        )
        return 0 if ok else 1
    except GateError as exc:
        print(f'::error title=Pages native publisher gate::{exc}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
