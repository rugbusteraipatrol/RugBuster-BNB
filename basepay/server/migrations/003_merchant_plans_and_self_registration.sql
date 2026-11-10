-- Plans and self-registration.
--
-- A merchant can now register itself (the WooCommerce plugin does this with
-- nothing but a wallet address) and is on the free plan until an operator
-- upgrades it. The free plan is capped at N paid orders per calendar month,
-- counted from `sessions` at session-creation time.
--
-- `merchant_key_hash` is the SHA-256 of the key handed out at registration; the
-- key itself is never stored. Operator-seeded merchants have no key.

ALTER TABLE merchants
    ADD COLUMN plan              text        NOT NULL DEFAULT 'free',
    ADD COLUMN plan_expires_at   timestamptz,
    ADD COLUMN merchant_key_hash text,
    ADD COLUMN site_url          text,
    ADD COLUMN platform          text,
    ADD CONSTRAINT merchants_plan_check CHECK (plan IN ('free', 'pro'));

-- The monthly usage count: paid or confirming sessions for one merchant since
-- the first of the month. `first_seen_at` is when money arrived, which is the
-- moment a session becomes a sale.
CREATE INDEX sessions_merchant_billable_idx
    ON sessions (merchant_id, first_seen_at)
    WHERE status IN ('confirming', 'paid');
