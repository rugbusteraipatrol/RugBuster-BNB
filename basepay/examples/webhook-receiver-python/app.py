"""Reference BasePay webhook receiver (Flask).

This is the piece that lives on the MERCHANT's side. BasePay tells you a payment
arrived; this endpoint is what turns that into "order fulfilled".

Copy it, replace `mark_order_paid` / `flag_underpayment` with your own logic.
The parts that are easy to get wrong are commented.

    pip install -r requirements.txt
    WEBHOOK_SECRET=... flask --app app run --port 4001

    # production
    WEBHOOK_SECRET=... gunicorn --bind 0.0.0.0:4001 app:app
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import time
from typing import Any

from flask import Flask, request

app = Flask(__name__)
log = logging.getLogger("basepay")

SECRET = os.environ.get("WEBHOOK_SECRET", "")
WEBHOOK_PATH = os.environ.get("WEBHOOK_PATH", "/hooks/basepay")

# Reject deliveries whose timestamp is further than this from now, in seconds.
TOLERANCE_SECONDS = 300
# Bound the body so a bad actor cannot make you buffer forever.
MAX_BODY_BYTES = 128 * 1024

app.config["MAX_CONTENT_LENGTH"] = MAX_BODY_BYTES

if not SECRET:
    raise SystemExit(
        "WEBHOOK_SECRET is not set. Refusing to start: every delivery would be rejected."
    )


# --------------------------------------------------------------- your code


def mark_order_paid(data: dict[str, Any]) -> None:
    """Called once per session that reaches `paid`. Put your fulfilment here.

    `orderRef` is whatever you passed when creating the session, so this is
    normally a single UPDATE against your own orders table.
    """
    log.info(
        "PAID order=%s amount=$%s (%s USDC) tx=%s",
        data.get("orderRef"),
        data.get("amountUsd"),
        data.get("amountUsdc"),
        (data.get("transactions") or [{}])[0].get("txHash", "n/a"),
    )
    # db.execute("UPDATE orders SET status='paid' WHERE ref=%s", (data["orderRef"],))


def flag_underpayment(data: dict[str, Any]) -> None:
    """Called once per session that reaches `underpaid`.

    The buyer sent less than the quote. The funds are already in your wallet and
    BasePay cannot send them back — it holds no keys. Decide here: refund
    manually, part-ship, or contact the buyer. Do not fulfil automatically.
    """
    log.warning(
        "UNDERPAID order=%s received %s of %s USDC",
        data.get("orderRef"),
        data.get("receivedUsdc"),
        data.get("amountUsdc"),
    )
    # db.execute("UPDATE orders SET status='needs_review' WHERE ref=%s", (data["orderRef"],))


# ---------------------------------------------------------------- plumbing

# Deliveries already processed.
#
# In production this MUST be durable — a table with a unique index on the
# delivery id — not an in-process set. A restart with an in-process set means a
# retried delivery gets processed twice, and double-fulfilling an order costs
# real money. It also does not work across gunicorn workers.
_processed: set[str] = set()


def verify(raw_body: bytes, headers) -> str | None:
    """Return an error string, or None when the delivery is authentic.

    The signature covers ``f"{timestamp}.{raw_body}"``.

    Verify against the RAW BYTES you received. If you let Flask parse the JSON
    and then re-serialise it, key order and whitespace change and the signature
    will never match — this is the single most common integration bug.
    """
    raw_timestamp = headers.get("X-BasePay-Timestamp", "")
    try:
        timestamp = int(raw_timestamp)
    except (TypeError, ValueError):
        return "missing or malformed timestamp header"

    # Bounded in both directions: a timestamp from the future is as suspect as an old one.
    if abs(int(time.time()) - timestamp) > TOLERANCE_SECONDS:
        return "timestamp outside the replay window"

    presented = headers.get("X-BasePay-Signature", "")
    if presented.startswith("sha256="):
        presented = presented[len("sha256=") :]
    if len(presented) != 64:
        return "missing or malformed signature header"

    expected = hmac.new(
        SECRET.encode("utf-8"),
        b"%d.%s" % (timestamp, raw_body),
        hashlib.sha256,
    ).hexdigest()

    # Constant-time compare, so response timing cannot be used to forge a signature.
    if not hmac.compare_digest(expected, presented.lower()):
        return "signature mismatch"
    return None


@app.post(WEBHOOK_PATH)
def receive():
    raw_body = request.get_data(cache=False)

    # Verify BEFORE parsing. Until the signature checks out, this is bytes from a
    # stranger, not a payment notification.
    problem = verify(raw_body, request.headers)
    if problem:
        log.warning("rejected delivery: %s", problem)
        # 400 tells BasePay this attempt failed; it retries with backoff and
        # eventually dead-letters, which is what you want if your secret is wrong.
        return "", 400

    try:
        event = json.loads(raw_body)
    except ValueError:
        return "", 400

    delivery_id = event.get("id")
    if not delivery_id:
        return "", 400

    # `id` is stable across every retry of the same delivery, so it is the
    # idempotency key. BasePay already guarantees at most one delivery per
    # (session, event) — this guards against the retries of that one delivery.
    if delivery_id in _processed:
        log.info("duplicate delivery %s ignored", delivery_id)
        return "", 200

    event_type = event.get("type")
    data = event.get("data") or {}

    try:
        if event_type == "payment.paid":
            mark_order_paid(data)
        elif event_type == "payment.underpaid":
            flag_underpayment(data)
        else:
            # Unknown event types are not an error: acknowledge so BasePay stops
            # retrying, and ignore. This is what lets new event types ship safely.
            log.info("ignoring unknown event type %s", event_type)
        _processed.add(delivery_id)
        return "", 200
    except Exception:
        # Your own failure. Return 5xx so the delivery is retried rather than lost.
        log.exception("handler failed for %s", delivery_id)
        return "", 500


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 4001)))
