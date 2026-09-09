#!/usr/bin/env python3
"""Pick the process this service should run, from a plain environment variable.

Two Railway services deploy this repo: `bnb`, a collector that crawls the
chain, and `bnb-api`, which serves /score on demand. They differ only in start
command.

Selecting that with Railway's own mechanisms did not hold here either. This is
the second service in this codebase to lose the same way. `RAILWAY_CONFIG_PATH`
is set to railway.api.json on bnb-api and worked for months, then a rebuild on
2026-09-09 ignored it: the API service started `chains/bnb/bnb_collector_v1.py`,
the collector logged "Campaign end reached (2026-07-01). Collector stopped." and
exited, and every path returned 502 while the deployment reported SUCCESS. A
`web:` entry in the Procfile does not help; it loses to railway.json's explicit
startCommand.

Nothing in the repository changed to cause that. A mechanism that works until a
rebuild silently stops working is not one to keep depending on.

Ordinary environment variables are read reliably, so the choice is made here
instead, where it is in git, testable, and visible in the log line below.

The default is the collector, so a service that sets nothing behaves exactly as
it did before this file existed.
"""

from __future__ import annotations

import os
import shlex
import subprocess
import sys

ROLE_ENV_VAR = "RUGBUSTER_ROLE"
DEFAULT_ROLE = "collector"

COMMANDS = {
    "api": ["gunicorn", "api.server:app", "--bind", "0.0.0.0:{port}"],
    "collector": [sys.executable, "chains/bnb/bnb_collector_v1.py"],
}


def resolve_role(environ: dict | None = None) -> str:
    """Normalise the requested role, falling back to the collector.

    An unrecognised value is a misconfiguration, not a reason to guess: it is
    reported loudly and treated as the default rather than silently starting
    something the operator did not ask for.
    """
    environ = os.environ if environ is None else environ
    raw = (environ.get(ROLE_ENV_VAR) or "").strip().lower()
    if not raw:
        return DEFAULT_ROLE
    if raw not in COMMANDS:
        print(
            f"[start] {ROLE_ENV_VAR}={raw!r} is not one of {sorted(COMMANDS)}; "
            f"falling back to {DEFAULT_ROLE}",
            file=sys.stderr,
            flush=True,
        )
        return DEFAULT_ROLE
    return raw


def build_command(role: str, environ: dict | None = None) -> list[str]:
    environ = os.environ if environ is None else environ
    port = environ.get("PORT", "8080")
    return [part.format(port=port) for part in COMMANDS[role]]


def main() -> int:
    role = resolve_role()
    command = build_command(role)
    # Printed so the runtime log says which process started. Reading the
    # deployment status is not enough -- a service running the wrong process
    # still reports SUCCESS.
    print(f"[start] {ROLE_ENV_VAR}={role} -> {shlex.join(command)}", flush=True)
    return subprocess.call(command)


if __name__ == "__main__":
    sys.exit(main())
