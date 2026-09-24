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

## 3. Činjenice o API-jima (ispravljeno 24.09.2026, provereno živim pozivima)

Prva verzija ovog fajla gledala je samo repo RugBuster-BNB i imala je dve greške:
- `rugbuster-api-production.up.railway.app` **nije** BNB API. Ta adresa je zastarela: `/health` vraća „Avalanche C-Chain Mainnet“, a `/score` vraća 404.
- Tvrdnja „Solana nema javni endpoint“ je netačna. Solana ima svoj servis.

RugBuster ima zaseban javni API za svaki od 5 lanaca. Adrese su iste one koje koristi rugbuster.io (`/`, `/bnb/`, `/base/`, `/solana/`, `/tron/`):

| Lanac | Endpoint | Polje sa ocenom | Provera 24.09.2026 |
|---|---|---|---|
| Avalanche | `https://web-production-376bf.up.railway.app/score?address=0x...` | `label` | 200 |
| BNB | `https://bnb-api-production.up.railway.app/score?address=0x...` | `label` | 200 (build `27a1b30` = kod na ovoj grani) |
| Base | `https://base-api-production-6887.up.railway.app/score?address=0x...` | `label` | 200 |
| Solana | `https://rugbuster-solana-api-production.up.railway.app/score?address=<mint>` | `label` + `risk_score` | 200 (scoring 2026.09.22) |
| TRON | `https://tron-api-production-b482.up.railway.app/api/tron/score?address=T...` | `verdict` + `risk_score` | 200 (USDT `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t`) |

Oznake (u kodu BNB-a: `api/server.py`):
- `GOOD`, `WARN`, `DANGER`, i **`INSUFFICIENT_DATA`** kad provera ugovora nije završena. API tada namerno ne daje GOOD. Avalanche i Base su za USDC vratili upravo `INSUFFICIENT_DATA`.
- Svi odgovori imaju `ok`, `chain`, `verdict_summary`, `verdict_basis` i `not_established`. Ostala polja se razlikuju po lancu, zato svaki lanac treba svoj mali adapter.
- Neispravna adresa daje 400 sa `ok:false` i porukom u `error`, npr. BNB: „Invalid BNB Chain token address“, Solana: „invalid solana mint address“.
- Kad sken ne uspe, BNB `/score` vraća 502 sa `"error": "live_scan_failed"`. To je greška kod nas, ne nalaz o tokenu.
- Endpoint `/api/v1/preflight?chain=solana` iz Geminijevog plana ne postoji.
- `rugbuster-score-staging-production.up.railway.app/score?chain=...` jeste zajednički API za više lanaca (avax, bnb, solana), ali čita samo keš. Za BNB i AVAX je vratio `not_found`, a za Solanu podatak iz maja. **Ne koristiti ga za plugin.**

## 4. Preporučeni plan (korisnik je 24.09.2026 tražio da plugin pokrije sve lance)

Ideja ostaje dobra: provera tokena pre transakcije za AI agente. Menja se samo cilj finansiranja.

- Plugin pokriva **svih 5 lanaca**: Avalanche, BNB, Base, Solana i TRON. Za prva četiri adapter je skoro isti. TRON ima drugu putanju i čita se iz polja `verdict`.
- Za BNB postoji zvanični `plugin-bnb` za elizaOS, koji je napravio BNB Chain tim. Na njemu se najlakše pokazuje omotač oko swap akcije.
- Plugin služi kao **dokaz upotrebljivosti u grant prijavama**: BNB Chain (vidi `docs/BNB_GRANT_PREP.md` i `docs/BNB_GRANT_UPDATE_2026-06-05.md`), a i za druge lance. Pre prijave proveri svaki program ponaosob.
- Objavljuje se kao sopstveni npm paket i repo, ne kroz elizaOS registry.

Tehnički (npr. `integrations/eliza-plugin/`, TypeScript, elizaOS v2 API; proveri tačne tipove u `@elizaos/core` pre pisanja):
1. `RugBusterService` sa tabelom lanac → endpoint i adapterom po lancu. Pretvara `GOOD`→ALLOW, `WARN`→WARN, `DANGER`→BLOCK.
   **`INSUFFICIENT_DATA` nikad ne daje ALLOW.** Podrazumevano daje WARN, a operater može da ga podesi na BLOCK.
   **Fail-closed:** timeout, 5xx, `ok:false`, `live_scan_failed` ili nepoznata oznaka daju BLOCK (ili WARN, ako operater tako podesi), nikad ALLOW.
   Adrese endpointa se podešavaju spolja (env/config), jer su se već jednom menjale.
2. Blokiranje mora biti u kodu, ne u promptu:
   - akcija `CHECK_TOKEN_RISK` (parametri: lanac i adresa),
   - omotač `withRugBuster(action)` za akcije swapa i transfera (npr. iz `plugin-bnb`),
   - ili sopstvene akcije `GUARDED_SWAP` i `GUARDED_TRANSFER`.
3. Provider služi samo kao dodatni kontekst za LLM, ne kao zaštita, jer ga prompt injection zaobilazi.
4. Pravila za WARN i INSUFFICIENT_DATA podešava operater, npr. `maxWarnPosition` i `requireAdminApproval`, a ne zakucane vrednosti.
5. Testovi sa mockovanim API-jem za svaki lanac, uključujući 400, 502, timeout i INSUFFICIENT_DATA. README sa demo scenarijem: tweet sa injekcijom → agent pokuša swap → DANGER → akcija odbijena u kodu.

Napomena: linkovi sa rugbuster.io ka GitHub dokumentaciji (npr. `RugBuster-Avalanche/docs/AVALANCHE_API.md`) posetiocima trenutno vraćaju 404, jer je GitHub nalog sakriven od 23.09.2026. API dokumentaciju za plugin ne treba linkovati na GitHub dok se to ne reši.

## 5. Sledeći korak

Korisnik je odobrio ispravku ovog fajla. Pre pisanja plugina potvrdi sa korisnikom da kreneš po sekciji 4.
Radna grana je `claude/rugbuster-eliza-plugin-8895ol`. Ne pravi PR dok korisnik ne traži.
Korisnik piše na srpskom, pa mu odgovaraj na srpskom.
