# RugBuster BNB Chain — BSC Collector Specification

Reference document for porting, maintaining, and onboarding the
`bnb_collector_v1.py` to BNB Smart Chain (BSC).

---

## Chain Identity

| Parametar | Vrijednost |
|-----------|-----------|
| Chain Name | BNB Smart Chain (BSC) |
| Chain ID | **56** |
| Native gas token | **BNB** |
| CoinGecko ID | `binancecoin` |
| Block time | ~3 s |

---

## RPC Endpoint

```
https://bsc-dataseed1.binance.org   # primarni javni RPC (Binance)
https://bsc-dataseed2.binance.org   # backup
```

Env var: `BNB_RPC` ili `BSC_RPC`

Za produkciju koristi privatni Alchemy / QuickNode BSC endpoint.

---

## Block Explorer

| | Vrijednost |
|--|--|
| Explorer URL | https://bscscan.com |
| API base | `https://api.bscscan.com/api` |
| Env var | `BSCSCAN_API_KEY` ili `BSC_SCAN_API_KEY` |
| Free tier | ~5 req/s |
| Throttle interval | 250 ms (`API_MIN_INTERVAL = 0.25`) |

API funkcija: `BscScan_get(params)` — isti interface kao `snowtrace_get` u avax verziji.

---

## DEX Factory Adrese — Verifikovano na BscScan

### V1/V2 (Uniswap V2-style, `PairCreated` event)

| DEX | Factory adresa | Verifikacija |
|-----|---------------|-------------|
| **PancakeSwap V2** | `0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73` | ✅ BscScan: "PancakeSwap: Factory v2" |
| Biswap | `0x858E3312ed3A876947EA49d572A7C42DE08af7EE` | Potvrđeno u produkcijskom kodu |
| ApeSwap | `0x0841BD0B734E4F5853f0dD8d7EA041c241fb0Da6` | Potvrđeno u produkcijskom kodu |

### V3 (za buduće proširenje)

| DEX | Factory adresa | Verifikacija |
|-----|---------------|-------------|
| **PancakeSwap V3** | `0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865` | ✅ BscScan: "PancakeSwap V3: Factory" |

> ⚠️  PancakeSwap V3 emituje `PoolCreated` event, **ne** `PairCreated`.
> Trenutni kolektor (V2 topic) ne pokriva V3 poolove direktno.

### `DEFAULT_V1_DEX_FACTORIES` u kodu

```python
DEFAULT_V1_DEX_FACTORIES = [
    "0xca143ce32fe78f1f7019d7d551a6402fc5350c73",  # PancakeSwap V2
    "0x858e3312ed3a876947ea49d572a7c42de08af7ee",  # Biswap
    "0x0841bd0b734e4f5853f0dd8d7ea041c241fb0da6",  # ApeSwap
]
DEFAULT_LB_DEX_FACTORIES = []  # LFJ LB-style nije prisutan na BSC
```

---

## Native (Base) Token Adrese

```python
BASE_TOKEN_ADDRESSES = {
    "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c",  # WBNB
    "0x55d398326f99059ff775485246999027b3197955",  # USDT (BSC)
    "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d",  # USDC (BSC)
    "0xe9e7cea3dedca5984780bafc599bd69add087d56",  # BUSD
    "0x2170ed0880ac9a755fd29b2688956bd959f933f8",  # ETH (bridged)
}
```

---

## PostgreSQL Tabela

| Parametar | Vrijednost |
|-----------|-----------|
| Tabela | **`bnb_scans`** |
| Status | **Živa produkcijska tabela — 840+ zapisa** |
| Kreiranje | `CREATE TABLE IF NOT EXISTS bnb_scans ...` u `init_database()` |
| Env var | `DATABASE_URL` (Railway PostgreSQL) |

**Ne dropovati, ne renamovati.** Kolona `chain` sadrži `"BNB"` za sve zapise.

---

## Gas Token i Budget Tracking

```python
MAX_BNB_TOTAL          = float(os.getenv("MAX_BNB_TOTAL", "2"))
BNB_EUR_PRICE_FALLBACK = float(os.getenv("BNB_EUR_PRICE_FALLBACK", "600"))
TARGET_BNB_PER_SCAN    = float(os.getenv("TARGET_BNB_PER_SCAN", "0.0002"))

def fetch_BNB_eur_price():
    # CoinGecko: ids="binancecoin", vs_currencies="eur"

def BNB_to_wei(amount: float) -> int: return int(amount * 10**18)
def wei_to_BNB(amount: int) -> float: return amount / 10**18
```

State key: `BNB_spent_wei` (u `bnb_collector_state.json`)

---

## Šta se mijenja od `avax_collector_v6.py` → BSC

| Kategorija | AVAX vrijednost | BSC vrijednost |
|-----------|----------------|----------------|
| RPC | `https://api.avax.network/ext/bc/C/rpc` | `https://bsc-dataseed1.binance.org` |
| Chain ID | 43114 | **56** |
| Explorer API | `api.routescan.io/.../43114/...` | `api.bscscan.com/api` |
| Explorer env var | `SNOWTRACE_API` | `BSCSCAN_API` |
| API key env var | `SNOWTRACE_API_KEY` | `BSCSCAN_API_KEY` |
| API funkcija | `snowtrace_get()` | `BscScan_get()` |
| DEX factories (V2) | Trader Joe V1, Pangolin | PancakeSwap V2, Biswap, ApeSwap |
| LB factories | LFJ V2.2 / 2.1 / 2.0 | `[]` (nema na BSC) |
| Native token | WAVAX | WBNB |
| Stablecoin adrese | USDC.e, USDT.e, DAI.e | USDT, USDC, BUSD (BSC adrese) |
| Gas token | AVAX | **BNB** |
| CoinGecko ID | `avalanche-2` | `binancecoin` |
| Gas state key | `avax_spent_wei` | `BNB_spent_wei` |
| Max gas budget | `MAX_AVAX_TOTAL` | `MAX_BNB_TOTAL` |
| Fallback cijena | `AVAX_EUR_PRICE_FALLBACK = 30` | `BNB_EUR_PRICE_FALLBACK = 600` |
| Output fajl | `syndicate_train_avax_v6.jsonl` | `syndicate_train_bnb_v1.jsonl` |
| DB tabela | `avax_scans` | `bnb_scans` |
| Log fajl | `avax_scan_log.md` | `bnb_scan_log.md` |
| State fajl | `avax_collector_state.json` | `bnb_collector_state.json` |
| Log prefix | `[AVAX-V6]` | `[BNB-V1]` |
| Chain string | `"AVAX"` / `"AVAX (C-Chain)"` | `"BNB"` / `"BNB Smart Chain"` |
| Explorer URL u recordima | `snowtrace.io` | `bscscan.com` |
| GeckoTerminal network | `networks/avax/` | `networks/bsc/` |
| GeckoTerminal token ID prefix | `avax_{addr}` | `bsc_{addr}` |
| Telegram chat env var | `AVAX_TELEGRAM_CHAT_ID` | `BNB_TELEGRAM_CHAT_ID` |
| On-chain address env vars | `AVAX_ONCHAIN_LOG_TO_ADDRESS` itd. | `BNB_ONCHAIN_LOG_TO_ADDRESS` itd. |
| Private key env var | `AVAX_LOG_PRIVATE_KEY` | `BNB_LOG_PRIVATE_KEY` |
| V6 funkcija sufiksi | `_avax` | `_BNB` |

### Stringovi za find-and-replace pri portanju

```
avax_collector   → bnb_collector
AVAX_            → BNB_
_avax            → _BNB   (function/variable names)
AVAX             → BNB    (string literals, chain labels)
avalanche        → bnb smart chain
snowtrace        → bscscan
routescan        → bscscan
43114            → 56
avalanche-2      → binancecoin  (CoinGecko ID)
networks/avax    → networks/bsc
f"avax_{addr}"   → f"bsc_{addr}"  (GeckoTerminal token ID prefix)
```

---

## Produkcijski Railway Servis

- **Autoritativna verzija:** `RugBuster-BNB/chains/bnb/bnb_collector_v1.py`
- **Tabela:** `bnb_scans` — 840+ zapisa (juni 2026)
- **Zadnji commit na fajlu:** 2026-06-08 (`Tighten BNB scam classification`)
- Syndicate-collector i Avalanche repo imaju starije kopije (2026-06-05)
  i ne treba ih koristiti kao reference

---

## CIA / V5 / V6 Moduli — Status u BNB Kolektoru

Svi moduli su prisutni (pun paritet sa `avax_collector_v6`):

| Modul | Funkcija | Status |
|-------|---------|--------|
| CIA: Funding Origin | `trace_funding_origin_BNB()` | ✅ |
| CIA: Deployment Latency | `get_deployment_latency_BNB()` | ✅ |
| CIA: Transaction Entropy | `analyze_transaction_entropy_BNB()` | ✅ |
| CIA: Wash Trading | `detect_wash_pattern_BNB()` | ✅ |
| CIA: Holder Cluster | `analyze_holder_cluster_BNB()` | ✅ |
| V5: Cross-Chain Match | `detect_cross_chain_match()` | ✅ |
| V5: Lifecycle Prediction | `predict_lifecycle()` | ✅ |
| V5: Name Stylometry | `analyze_name_stylometry()` | ✅ |
| V5: CEX Sweep | `detect_cex_sweep_BNB()` | ✅ |
| V6: Contract Backdoor | `detect_contract_backdoor_BNB()` | ✅ |
| V6: Holder Concentration | `analyze_holder_concentration_BNB()` | ✅ |
| V6: Rug Velocity | `calculate_rug_velocity_BNB()` | ✅ |
