-- BasePay initial schema.
--
-- Money notes:
--   * USDC amounts are stored as bigint micro-units (6 decimals). Never floats.
--   * Fiat amounts are stored as integer cents. Never floats.
--   * The unique index `sessions_open_amount_uniq` IS the amount-offset reservation:
--     at most one OPEN session per merchant per exact USDC amount. The database,
--     not the application, is the authority on that invariant.

CREATE TABLE merchants (
    id              text PRIMARY KEY,
    wallet_address  text        NOT NULL,
    webhook_url     text,
    webhook_secret  text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT merchants_wallet_address_format CHECK (wallet_address ~ '^0x[0-9a-fA-F]{40}$'),
    CONSTRAINT merchants_webhook_pair CHECK (
        (webhook_url IS NULL AND webhook_secret IS NULL)
        OR (webhook_url IS NOT NULL AND webhook_secret IS NOT NULL)
    )
);

-- The watcher looks merchants up by the address seen in a Transfer log, which is
-- lowercase hex. Merchant addresses are stored checksummed, so index the lowered form.
CREATE INDEX merchants_wallet_address_lower_idx ON merchants (lower(wallet_address));

CREATE TABLE sessions (
    id                 uuid PRIMARY KEY,
    merchant_id        text        NOT NULL REFERENCES merchants (id) ON DELETE RESTRICT,
    order_ref          text,
    status             text        NOT NULL,
    -- Quote
    amount_usd_cents   bigint      NOT NULL,
    usdc_price_usd     numeric(18, 8) NOT NULL,
    price_stale        boolean     NOT NULL DEFAULT false,
    base_amount_usdc   bigint      NOT NULL,
    amount_offset      integer     NOT NULL,
    amount_usdc        bigint      NOT NULL, -- base_amount_usdc + amount_offset; the exact amount to send
    pay_to_address     text        NOT NULL,
    -- Settlement
    received_usdc      bigint      NOT NULL DEFAULT 0,
    confirmations      integer     NOT NULL DEFAULT 0,
    -- Timestamps
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    expires_at         timestamptz NOT NULL,
    first_seen_at      timestamptz,
    settled_at         timestamptz,
    CONSTRAINT sessions_status_check
        CHECK (status IN ('pending', 'confirming', 'paid', 'underpaid', 'expired')),
    CONSTRAINT sessions_amount_positive CHECK (amount_usdc > 0 AND amount_usd_cents > 0),
    CONSTRAINT sessions_amount_sum CHECK (amount_usdc = base_amount_usdc + amount_offset),
    CONSTRAINT sessions_offset_non_negative CHECK (amount_offset >= 0)
);

-- Amount-offset reservation. An "open" session holds its exact amount; settling or
-- expiring the session releases it by moving the row out of this partial index.
CREATE UNIQUE INDEX sessions_open_amount_uniq
    ON sessions (merchant_id, amount_usdc)
    WHERE status IN ('pending', 'confirming');

-- Watcher hot path: given (to_address, value) from a Transfer log, find the open session.
CREATE INDEX sessions_open_payto_amount_idx
    ON sessions (lower(pay_to_address), amount_usdc)
    WHERE status IN ('pending', 'confirming');

-- Expiry sweeper. Only 'pending' sessions expire; once a transfer is seen the
-- session is 'confirming' and must be allowed to reach a terminal state.
CREATE INDEX sessions_pending_expiry_idx
    ON sessions (expires_at)
    WHERE status = 'pending';

CREATE INDEX sessions_merchant_created_idx ON sessions (merchant_id, created_at DESC);

-- Every USDC Transfer the watcher observed into a merchant address, matched or not.
-- `status` is how we survive reorgs: an orphaned log is kept for the audit trail but
-- no longer counts toward a session's received amount.
CREATE TABLE payments (
    id             bigserial PRIMARY KEY,
    tx_hash        text        NOT NULL,
    log_index      integer     NOT NULL,
    block_number   bigint      NOT NULL,
    block_hash     text        NOT NULL,
    from_address   text        NOT NULL,
    to_address     text        NOT NULL,
    amount_usdc    bigint      NOT NULL,
    session_id     uuid REFERENCES sessions (id) ON DELETE SET NULL,
    match_kind     text        NOT NULL,
    status         text        NOT NULL DEFAULT 'active',
    observed_at    timestamptz NOT NULL DEFAULT now(),
    orphaned_at    timestamptz,
    CONSTRAINT payments_match_kind_check CHECK (match_kind IN ('exact', 'underpaid', 'overpaid', 'unmatched')),
    CONSTRAINT payments_status_check CHECK (status IN ('active', 'orphaned')),
    CONSTRAINT payments_tx_log_uniq UNIQUE (tx_hash, log_index)
);

CREATE INDEX payments_session_active_idx ON payments (session_id) WHERE status = 'active';
CREATE INDEX payments_block_number_idx ON payments (block_number);
CREATE INDEX payments_unmatched_idx ON payments (observed_at DESC) WHERE match_kind = 'unmatched';

CREATE TABLE webhook_deliveries (
    id               uuid PRIMARY KEY,
    merchant_id      text        NOT NULL REFERENCES merchants (id) ON DELETE CASCADE,
    session_id       uuid REFERENCES sessions (id) ON DELETE CASCADE,
    event_type       text        NOT NULL,
    url              text        NOT NULL,
    payload          jsonb       NOT NULL,
    status           text        NOT NULL DEFAULT 'pending',
    attempts         integer     NOT NULL DEFAULT 0,
    next_attempt_at  timestamptz NOT NULL DEFAULT now(),
    last_error       text,
    last_status_code integer,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    delivered_at     timestamptz,
    CONSTRAINT webhook_deliveries_status_check CHECK (status IN ('pending', 'delivered', 'dead'))
);

CREATE INDEX webhook_deliveries_due_idx
    ON webhook_deliveries (next_attempt_at)
    WHERE status = 'pending';

-- One delivery per (session, event). Makes enqueueing idempotent, so a reorg replay
-- or a restart mid-settle cannot double-notify the merchant.
CREATE UNIQUE INDEX webhook_deliveries_session_event_uniq
    ON webhook_deliveries (session_id, event_type)
    WHERE session_id IS NOT NULL;

-- Single-row-per-chain bookmark so a restart backfills instead of losing payments.
CREATE TABLE watcher_state (
    id                        text PRIMARY KEY,
    last_processed_block      bigint      NOT NULL,
    last_processed_block_hash text,
    updated_at                timestamptz NOT NULL DEFAULT now()
);
