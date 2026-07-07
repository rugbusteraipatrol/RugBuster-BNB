from chains.bnb.risk_engine import score_token


def test_missing_metadata_is_insufficient_data_not_elevated():
    result = score_token(
        {
            "name": "Unknown",
            "symbol": "Unknown",
            "decimals": None,
            "total_supply": None,
            "has_liquidity_evidence": False,
        }
    )

    assert result.rug.score is None
    assert result.rug.status == "INSUFFICIENT_DATA"


def test_wbnb_like_metadata_scores_low_rug_risk():
    result = score_token(
        {
            "name": "Wrapped BNB",
            "symbol": "WBNB",
            "decimals": 18,
            "total_supply": 1_500_000 * 10**18,
            "has_liquidity_evidence": True,
            "liquidity_usd": 50_000_000,
            "fdv": 1_200_000_000,
            "volume24h": 10_000_000,
            "price_change_24h": 1.5,
            "buys24h": 2_000,
            "sells24h": 2_100,
            "is_known_chain_asset": True,
        }
    )

    assert result.rug.status == "LOW"
    assert result.rug.score < 45
    assert result.speculation.status == "LOW"


def test_usdt_like_metadata_scores_low_rug_risk():
    result = score_token(
        {
            "name": "Tether USD",
            "symbol": "USDT",
            "decimals": 18,
            "total_supply": 5_000_000_000 * 10**18,
            "has_liquidity_evidence": True,
            "liquidity_usd": 5_000_000,
            "fdv": 5_000_000_000,
            "volume24h": 1_000_000,
            "price_change_24h": 0.1,
            "buys24h": 500,
            "sells24h": 520,
            "is_known_chain_asset": True,
        }
    )

    assert result.rug.status == "LOW"
    assert result.rug.score < 45
