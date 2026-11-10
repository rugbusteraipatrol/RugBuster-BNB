# Objave na srpskom — frilenseri

Napisano 23. 9. 2026. Objavljuje osoba sa svog naloga, ručno. Svaka objava kaže
da je autor napravio alat — grupe koje ne trpe reklamu to ionako prepoznaju, a
otvoreno reći je jedini način da objava ne bude obrisana kao spam.

## Duža objava (Facebook grupe, Startit zajednica)

**Kako da naplatiš stranom klijentu kad Stripe ne radi, a PayPal i Payoneer uzimaju proviziju**

Pravim mali alat za naplatu i hteo bih da čujem da li nekome od vas rešava
problem, ili samo meni.

Problem znate:
- Stripe zvanično ne radi u Srbiji.
- PayPal radi delimično, a na konverziji valute ostaje dobar deo.
- Payoneer i SWIFT rade, ali uz proviziju i čekanje na isplatu.

Ono što ja koristim je USDC — digitalni dolar (1 USDC = 1 $) na mreži Base.
Klijent pošalje iz svog novčanika, novac stiže za nekoliko sekundi, a mreža
košta par centi. Nema banke u sredini koja zadržava ili zamrzava uplatu.

Napravio sam **StableCart**, da to izgleda kao obična faktura:
1. Na stablecart.org/links nalepiš adresu svog novčanika i upišeš iznos.
2. Dobiješ link i QR kod i pošalješ ga klijentu.
3. Klijent otvori link, skenira QR telefonom ili plati iz MetaMask-a ili
   Coinbase Wallet-a. Stranica ti pokaže kad je plaćeno.

Bez naloga i bez provizije na uplatu. Besplatno je do 20 uplata mesečno.

Iskreno, gde ovo ne pomaže:
- **Klijent mora da ima USDC ili kripto novčanik.** Najbolje radi sa
  klijentima iz kripto i web3 sveta i sa firmama koje već plaćaju u
  stablecoin-u. Klijentu koji plaća isključivo karticom ovo ne rešava ništa.
- **Za dinare** USDC prebaciš na kripto menjačnicu koja ima dozvolu u Srbiji
  (spisak je na sajtu NBS) i isplatiš na račun. Menjačnica naplaćuje svoju
  proviziju.
- **Porez**: prihod je prihod i prijavljuje se kao i svaka druga naplata iz
  inostranstva. Za tvoj slučaj pitaj knjigovođu.

Pitanje za vas: da li vam neko od klijenata nudi plaćanje u kriptu? Šta sada
koristite i koliko vas košta naplata? Zanima me iskreno, i kritika.

https://www.stablecart.org/links/

## Kratka verzija (komentar na postojeće pitanje, Viber, poruka)

Ako klijent ima kripto novčanik: napraviš link na stablecart.org/links
(nalepiš adresu, upišeš iznos) i pošalješ mu ga. Plati u USDC i novac ti je u
novčaniku za nekoliko sekundi, bez naloga i bez provizije na uplatu. Za dinare
ide preko licencirane menjačnice (spisak je na sajtu NBS). Napomena: ja sam
ovo napravio, pa slobodno pitaj šta te zanima.

## Gde i kako

- Pre objave pročitaj pravila grupe. Gde je reklama zabranjena, nemoj praviti
  novu objavu; odgovori kratkom verzijom na pitanje koje već postoji ("kako da
  naplatim od stranog klijenta", "Payoneer provizija", "PayPal Srbija").
- Jedna grupa dnevno, ne ista objava svuda istog dana — administratori to vide
  i brišu.
- Na komentare odgovaraj istog dana. Prvih nekoliko razgovora vredi više od
  same objave.

Izvor za licencirane menjačnice: registar NBS,
https://nbs.rs/sr/ciljevi-i-funkcije/nadzor-nad-finansijskim-institucijama/digital-imo/reg_di/reg_di_mcm/index.html
