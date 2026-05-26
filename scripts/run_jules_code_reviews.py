#!/usr/bin/env python3
"""Create review-only Jules sessions for the Travel AI repository."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any


API_BASE_URL = "https://jules.googleapis.com/v1alpha"
API_KEY_ENV = "JULES_API_KEY"
DEFAULT_PAGE_SIZE = 100
HTTP_TIMEOUT_SECONDS = 30
SESSION_ENDPOINT = "/sessions"
SOURCES_ENDPOINT = "/sources"
REVIEW_ONLY_TITLE_PREFIX = "Travel AI review"
SAFE_ENV_KEYS = (
    "DUFFEL_API_TOKEN",
    "DUFFEL_API_BASE_URL",
    "RAPIDAPI_BOOKING_KEY",
    "BOOKING_CURRENCY",
    "RESEND_API_KEY",
    "RESEND_FROM_EMAIL",
    "RESEND_WEBHOOK_SECRET",
    "OPENROUTER_API_KEY",
    "OPENROUTER_PROVIDER_ORDER",
    "TRAVEL_AI_TOKEN_SECRET",
    "TRAVEL_AI_ENCRYPTION_KEY",
    "FRONTEND_ORIGIN",
    "TRAVEL_AI_ALLOWED_ORIGINS",
)
LOCAL_ENV_FILE_NAMES = (".env", ".env.local")
REVIEW_SPECS = (
    (
        "Backend security and provider review",
        "Review backend changes for signed client review tokens, POPIA-style masking, "
        "email audit events, Duffel live-flight fallback behavior, synthetic transfer boundaries, "
        "internal logging redaction, and no user-facing secret leakage.",
    ),
    (
        "Frontend review workflow review",
        "Review the client review dashboard, approval/edit flow, agent-side Client Review tab, "
        "itinerary detail rendering, and visible states for pending, approved, revision requested, "
        "and final itinerary sent.",
    ),
    (
        "Quality and regression review",
        "Review the branch for DRY violations, unclear names, magic values, missing fail-fast checks, "
        "unnecessary special cases, fragile async paths, latency risks, and missing or weak tests.",
    ),
)


@dataclass(frozen=True)
class ReviewSpec:
    title: str
    focus: str


def main() -> int:
    args = parse_args()
    repo_root = Path.cwd()
    load_local_env(repo_root)
    branch = args.branch or current_branch(repo_root)
    source_name = args.source or resolve_source_name(repo_root, args)
    review_specs = [ReviewSpec(title, focus) for title, focus in REVIEW_SPECS]
    prompt_context = build_prompt_context(repo_root, branch, args.include_env_manifest)

    if args.dry_run:
        print(json.dumps(build_dry_run_payloads(source_name, branch, review_specs, prompt_context), indent=2))
        return 0

    api_key = os.getenv(API_KEY_ENV)
    if not api_key:
        print(f"{API_KEY_ENV} is required. Rotate any exposed key and export the new value before running.", file=sys.stderr)
        return 2

    created_sessions = [
        create_review_session(api_key, args.api_base_url, source_name, branch, spec, prompt_context)
        for spec in review_specs
    ]
    print(json.dumps({"sessions": created_sessions}, indent=2))
    return 0


def load_local_env(repo_root: Path) -> None:
    for file_name in LOCAL_ENV_FILE_NAMES:
        load_env_file(repo_root / file_name)


def load_env_file(path: Path) -> None:
    if not path.is_file():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        key, value = parse_env_line(raw_line)
        if key and key not in os.environ:
            os.environ[key] = value


def parse_env_line(raw_line: str) -> tuple[str | None, str]:
    line = raw_line.strip()
    if not line or line.startswith("#") or "=" not in line:
        return None, ""
    if line.startswith("export "):
        line = line.removeprefix("export ").strip()
    key, value = line.split("=", 1)
    clean_key = key.strip()
    if not clean_key.isidentifier():
        return None, ""
    return clean_key, value.strip().strip('"').strip("'")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create review-only Jules sessions for Travel AI.")
    parser.add_argument("--branch", help="Git branch Jules should review. Defaults to the current branch.")
    parser.add_argument("--source", help="Explicit Jules source name, for example sources/github/owner/repo.")
    parser.add_argument("--api-base-url", default=os.getenv("JULES_API_BASE_URL", API_BASE_URL))
    parser.add_argument("--dry-run", action="store_true", help="Print session payloads without calling Jules.")
    parser.add_argument(
        "--include-env-manifest",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Include only present/missing status for allowlisted env vars. Values are never included.",
    )
    return parser.parse_args()


def current_branch(repo_root: Path) -> str:
    branch = run_git(repo_root, "branch", "--show-current")
    if not branch:
        raise SystemExit("Unable to resolve the current git branch.")
    return branch


def resolve_source_name(repo_root: Path, args: argparse.Namespace) -> str:
    if args.dry_run:
        return "sources/github/OWNER/REPO"

    api_key = os.getenv(API_KEY_ENV)
    if not api_key:
        raise SystemExit(f"{API_KEY_ENV} is required to resolve Jules sources.")

    remote_slug = github_remote_slug(repo_root)
    sources = list_sources(api_key, args.api_base_url)
    exact_match = next((source["name"] for source in sources if source_matches_slug(source, remote_slug)), None)
    if exact_match:
        return exact_match

    available = ", ".join(str(source.get("name", "")) for source in sources[:10])
    raise SystemExit(f"No Jules source matched GitHub repo {remote_slug}. Available sources: {available or 'none'}")


def github_remote_slug(repo_root: Path) -> str:
    remote_url = run_git(repo_root, "remote", "get-url", "origin")
    if not remote_url:
        raise SystemExit("Unable to read git origin remote.")

    if remote_url.startswith("git@"):
        path = remote_url.split(":", 1)[1]
    else:
        parsed = urllib.parse.urlparse(remote_url)
        path = parsed.path

    slug = path.removesuffix(".git").strip("/")
    if slug.count("/") < 1:
        raise SystemExit(f"Origin remote is not a GitHub owner/repo URL: {remote_url}")
    return slug


def list_sources(api_key: str, api_base_url: str) -> list[dict[str, Any]]:
    sources: list[dict[str, Any]] = []
    page_token = ""
    while True:
        query = {"pageSize": str(DEFAULT_PAGE_SIZE)}
        if page_token:
            query["pageToken"] = page_token
        response = request_json("GET", f"{api_base_url}{SOURCES_ENDPOINT}?{urllib.parse.urlencode(query)}", api_key)
        sources.extend(response.get("sources", []))
        page_token = str(response.get("nextPageToken") or "")
        if not page_token:
            return sources


def source_matches_slug(source: dict[str, Any], remote_slug: str) -> bool:
    source_name = str(source.get("name") or "")
    source_id = str(source.get("id") or "")
    normalized_slug = remote_slug.lower()
    return source_name.lower().endswith(normalized_slug) or source_id.lower().endswith(normalized_slug)


def build_prompt_context(repo_root: Path, branch: str, include_env_manifest: bool) -> str:
    status = run_git(repo_root, "status", "--short")
    env_section = build_env_manifest() if include_env_manifest else "Env manifest disabled."
    return f"""Repository: {github_remote_slug(repo_root)}
Branch: {branch}

Operating rules:
- Review only. Do not modify files, create commits, publish branches, or open pull requests.
- Do not read, print, copy, or request raw .env files, API keys, tokens, certificates, local databases, or VPS credentials.
- Treat live supplier tests as optional and only run them when Jules repository settings provide sandbox-safe variables.
- Prefer deterministic unit/component/build checks before live-provider checks.
- Report findings first, ordered by severity, with exact file paths and line references when possible.
- Flag any synthetic/demo behavior that could be mistaken for live booking, payment, ticketing, hotel confirmation, or provider dispatch.
- Keep recommendations aligned with DRY, fail-fast validation, clear names, named constants, focused functions, and safe internal logging.

Suggested checks:
- Backend: python -m pytest -q tests/test_backend_api.py tests/test_backend_security.py tests/test_corporate_backend_api.py
- Frontend: cd frontend && npm test -- --run
- Frontend build: cd frontend && npm run build -- --webpack

Local dirty-worktree snapshot from automation runner:
{status or "Clean"}

Environment availability manifest, values intentionally omitted:
{env_section}
"""


def build_env_manifest() -> str:
    lines = []
    for key in SAFE_ENV_KEYS:
        state = "configured" if os.getenv(key) else "missing"
        lines.append(f"- {key}: {state}")
    return "\n".join(lines)


def build_dry_run_payloads(
    source_name: str,
    branch: str,
    review_specs: list[ReviewSpec],
    prompt_context: str,
) -> dict[str, Any]:
    return {
        "source": source_name,
        "branch": branch,
        "sessions": [
            session_payload(source_name, branch, spec, prompt_context)
            for spec in review_specs
        ],
    }


def create_review_session(
    api_key: str,
    api_base_url: str,
    source_name: str,
    branch: str,
    spec: ReviewSpec,
    prompt_context: str,
) -> dict[str, Any]:
    payload = session_payload(source_name, branch, spec, prompt_context)
    response = request_json("POST", f"{api_base_url}{SESSION_ENDPOINT}", api_key, payload)
    return {
        "title": response.get("title"),
        "name": response.get("name"),
        "id": response.get("id"),
        "url": response.get("url"),
        "state": response.get("state"),
    }


def session_payload(source_name: str, branch: str, spec: ReviewSpec, prompt_context: str) -> dict[str, Any]:
    return {
        "title": f"{REVIEW_ONLY_TITLE_PREFIX}: {spec.title}",
        "prompt": f"{prompt_context}\nReview focus:\n{spec.focus}\n\nReturn a concise review report. Do not change code.",
        "sourceContext": {
            "source": source_name,
            "githubRepoContext": {"startingBranch": branch},
        },
        "requirePlanApproval": False,
    }


def request_json(method: str, url: str, api_key: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Content-Type": "application/json",
            "X-Goog-Api-Key": api_key,
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT_SECONDS) as response:
            raw_body = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise SystemExit(f"Jules API request failed with HTTP {exc.code}: {body}") from exc
    except urllib.error.URLError as exc:
        raise SystemExit(f"Jules API request failed: {exc.reason}") from exc

    return json.loads(raw_body) if raw_body else {}


def run_git(repo_root: Path, *args: str) -> str:
    completed = subprocess.run(
        ["git", *args],
        cwd=repo_root,
        check=True,
        text=True,
        capture_output=True,
    )
    return completed.stdout.strip()


if __name__ == "__main__":
    raise SystemExit(main())
