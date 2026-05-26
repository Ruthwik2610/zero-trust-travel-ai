import os
from pathlib import Path
from typing import Iterable


ENV_FILE_NAMES = (".env", ".env.local")
RESEND_ENV_ALIASES = {
    "RESEND_FROM_EMAIL": ("EMAIL_FROM", "MAIL_FROM", "RESEND_FROM"),
    "RESEND_WEBHOOK_SECRET": ("RESEND_WEBHOOK_SIGNING_SECRET", "RESEND_SIGNING_SECRET"),
}


def load_travel_ai_env(extra_paths: Iterable[str | Path] | None = None) -> None:
    for env_path in _candidate_env_paths(extra_paths):
        _load_env_file(env_path)
    _apply_env_aliases()


def _candidate_env_paths(extra_paths: Iterable[str | Path] | None) -> list[Path]:
    candidates: list[Path] = []
    if extra_paths:
        candidates.extend(Path(path) for path in extra_paths)

    app_file = Path(__file__).resolve()
    roots = [
        Path.cwd(),
        app_file.parents[1],  # backend/
        app_file.parents[2],  # travel-ai/
        app_file.parents[3],  # parent DataChat workspace
    ]
    for root in roots:
        candidates.extend(root / filename for filename in ENV_FILE_NAMES)

    deduped: list[Path] = []
    seen: set[Path] = set()
    for path in candidates:
        resolved = path.expanduser()
        if resolved not in seen:
            deduped.append(resolved)
            seen.add(resolved)
    return deduped


def _load_env_file(path: Path) -> None:
    if not path.exists() or not path.is_file():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        key, value = _parse_env_line(raw_line)
        if key:
            os.environ.setdefault(key, value)


def _parse_env_line(raw_line: str) -> tuple[str | None, str]:
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


def _apply_env_aliases() -> None:
    for canonical_name, aliases in RESEND_ENV_ALIASES.items():
        if os.getenv(canonical_name):
            continue
        for alias in aliases:
            alias_value = os.getenv(alias)
            if alias_value:
                os.environ[canonical_name] = alias_value
                break
