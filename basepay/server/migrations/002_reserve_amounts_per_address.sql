-- Reserve open amounts per pay-to address, not per merchant.
--
-- 001 made `sessions_open_amount_uniq` unique on (merchant_id, amount_usdc), but
-- the watcher attributes a transfer by (pay_to_address, amount_usdc). Two
-- merchants sharing one wallet could therefore both hold the same open amount,
-- and a payment meant for either would settle whichever session was older.
--
-- The index keeps its name, so the application's unique-violation retry is
-- unchanged. It also serves the watcher's lookup by address and amount, which
-- makes `sessions_open_payto_amount_idx` redundant.
--
-- If two open sessions already share an address and an amount when this runs,
-- the index cannot be built and the migration fails. Open sessions expire
-- within SESSION_TTL_SECONDS, so retrying the deploy after that clears it.

DROP INDEX sessions_open_amount_uniq;
DROP INDEX sessions_open_payto_amount_idx;

CREATE UNIQUE INDEX sessions_open_amount_uniq
    ON sessions (lower(pay_to_address), amount_usdc)
    WHERE status IN ('pending', 'confirming');
