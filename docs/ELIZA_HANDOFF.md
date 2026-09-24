# Handoff: RugBuster × elizaOS (istraživanje, 24.09.2026)

Ovaj fajl je napisan za Claude Code na lokalnom računaru, da nastavi tamo gde je stala sesija u oblaku.
Pročitaj ga ceo pre nego što bilo šta predložiš korisniku.

---

## 0. Za korisnika: kako da pokreneš Claude na kompjuteru

1. Instaliraj Claude Code (uputstvo: https://code.claude.com/docs)
   - Mac / Linux: `curl -fsSL https://claude.ai/install.sh | bash`
   - Windows (PowerShell): `irm https://claude.ai/install.ps1 | iex`
   - ili skini desktop aplikaciju sa istog sajta
2. Uđi u folder repoa i povuci ovu granu:
   ```
   cd RugBuster-BNB
   git fetch origin
   git checkout claude/rugbuster-eliza-plugin-8895ol
   ```
3. Pokreni `claude`, uloguj se svojim nalogom i napiši:
   > Pročitaj docs/ELIZA_HANDOFF.md i nastavi odatle.

To je sve. Ne moraš ništa ponovo da čitaš.

---

## 1. Kontekst

Korisnik je od Gemini-ja dobio plan: napraviti elizaOS plugin „RugBuster Pre-flight Firewall“ (ALLOW / WARN / BLOCK)
i tražiti novac od elizaOS fondova (Eliza Creator Fund i Jupiter x elizaOS Magic Fund).
Korisnik je rekao da Gemini halucinira, pa je sve provereno na internetu.

## 2. Provera Geminijevih tvrdnji

| Tvrdnja | Status |
|---|---|
| ai16z je preimenovan u elizaOS, osnivač je Shaw Walters | Tačno |
| elizaOS/eliza ima ~19.5k zvezdica | Tačno (19.5k, 5.8k forkova) |
| Jupiter x elizaOS Magic Fund, $10M | Najavljen 25.01.2025. Namenjen open-source AI razvoju uopšte, ne „isključivo bezbednosti na Solani“. Nema dokaza da danas deli novac |
| Creator Fund sa 11% tokena | Nije potvrđeno. Verovatno izmišljeno (11B je ukupna ponuda tokena posle migracije) |
| Eliza Ecosystem Fund | Postojao je (npr. Questflow, 2025), ali trezor je sada izgubljen, vidi ispod |
| elizaOS „v2“ | Tačno, v2 postoji |
| Actions, Providers, Evaluators | Tačno u principu |
| Pošalji PR ili se prijavi u plugin registry | Netačno. README glavnog repoa: „We no longer accept third-party plugins or registry items.“ |
| Discord kanal `#grants-bounties` | Nije provereno, verovatno izmišljeno |
| Plugin kao middleware koji blokira tuđe akcije (npr. EXECUTE_SWAP) | Netačno. elizaOS nema opšti hook za to |

### Najvažnije: elizaOS više nema novca
- 16.04.2026: Burwick Law je podneo kolektivnu tužbu Doe v. Walters (SDNY).
- 04.08.2026: tužba je poravnata. Walters je predao „ostatak trezora i sav novac koji smo imali“, izjavio da je token „mrtav“ i da se fondacija gasi.
- Softver elizaOS ostaje open source, ali bez tokena i bez novca.
- **Zaključak: nema smisla tražiti grant od elizaOS-a.**

Izvori:
- https://www.burwick.law/active-cases/ai16z-elizaos-token-lawsuit-doe-v-walters
- https://thedefiant.io/news/tokens/eliza-labs-shaw-walters-says-ai16z-token-is-dead-after-settling-burwick-law-class-action
- https://www.coindesk.com/markets/2026/08/05/ai-agent-token-once-worth-usd2-4-billion-ends-with-founder-calling-it-dead
- https://www.binance.com/en/square/post/01-25-2025-elizaos-jupiter-1000-magic-fund-19411771552322
- https://github.com/elizaOS/eliza
- https://github.com/elizaos-plugins/plugin-bnb

## 3. Činjenice o ovom repou (provereno u kodu)

- API (`api/server.py`) ima `GET /score?address=0x...`. Radi samo za EVM i BNB adrese, jer odbija sve što ne prođe `Web3.is_address`.
- Oznake su `GOOD / WARN / DANGER`, a ne ALLOW / WARN / BLOCK.
- Endpoint `/api/v1/preflight?chain=solana` iz Geminijevog plana **ne postoji**. Solana podaci postoje u tabeli `solana_scans`, ali nemaju javni endpoint u ovom API-ju.
- Kad sken ne uspe, `/score` vraća 502 sa `"error": "live_scan_failed"`, uz napomenu da je to greška kod nas, a ne nalaz o tokenu.
- Javni API: `rugbuster-api-production.up.railway.app`

## 4. Preporučeni plan (korisnik ga još nije odobrio)

Ideja ostaje dobra: provera tokena pre transakcije za AI agente. Menja se samo cilj finansiranja.

- Plugin cilja **BNB/EVM**, jer API za to već radi. Postoji zvanični `plugin-bnb` za elizaOS, koji je napravio BNB Chain tim.
- Plugin služi kao **dokaz upotrebljivosti u BNB Chain grant prijavi**. Vidi `docs/BNB_GRANT_PREP.md` i `docs/BNB_GRANT_UPDATE_2026-06-05.md`.
- Objavljuje se kao sopstveni npm paket i repo, ne kroz elizaOS registry.

Tehnički (npr. `integrations/eliza-plugin/`, TypeScript, elizaOS v2 API; proveri tačne tipove u `@elizaos/core` pre pisanja):
1. `RugBusterService`: poziva `/score` i pretvara GOOD→ALLOW, WARN→WARN, DANGER→BLOCK.
   **Fail-closed:** timeout, 5xx ili `live_scan_failed` daju BLOCK (ili WARN, ako operater tako podesi), nikad ALLOW.
2. Blokiranje mora biti u kodu, ne u promptu:
   - akcija `CHECK_TOKEN_RISK`,
   - omotač `withRugBuster(action)` za akcije swapa i transfera (npr. iz `plugin-bnb`),
   - ili sopstvene akcije `GUARDED_SWAP` i `GUARDED_TRANSFER`.
3. Provider služi samo kao dodatni kontekst za LLM, ne kao zaštita, jer ga prompt injection zaobilazi.
4. Pravila za WARN podešava operater, npr. `maxWarnPosition` i `requireAdminApproval`, a ne zakucane vrednosti.
5. Testovi sa mockovanim API-jem i README sa demo scenarijem: tweet sa injekcijom → agent pokuša swap → DANGER → akcija odbijena u kodu.

## 5. Sledeći korak

Pitaj korisnika da li da kreneš sa pluginom po planu iz sekcije 4.
Radna grana je `claude/rugbuster-eliza-plugin-8895ol`. Ne pravi PR dok korisnik ne traži.
Korisnik piše na srpskom, pa mu odgovaraj na srpskom.
