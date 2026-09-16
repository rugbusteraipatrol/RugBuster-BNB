/**
 * Buyer-facing copy, one dictionary per language. The store picks the language
 * with `locale` (or `data-locale`); anything unknown falls back to English so a
 * typo never renders an empty checkout.
 */

export type Locale = 'en' | 'sr';

export type WalletReason =
  | 'no-wallet'
  | 'connect-declined'
  | 'connect-failed'
  | 'no-account'
  | 'network-declined'
  | 'add-network-declined'
  | 'network-switch-failed'
  | 'payment-cancelled'
  | 'insufficient-funds'
  | 'send-failed';

export interface Messages {
  preparing: string;
  cardLabel: string;
  payUsd: (amountUsd: string) => string;
  usdcOnBase: (amountUsdc: string) => string;
  order: (orderRef: string) => string;
  qrLabel: (amountUsdc: string, address: string) => string;
  sendTo: string;
  exactAmount: string;
  copy: string;
  copied: string;
  pressCopy: string;
  expiresIn: (countdown: string) => string;
  transaction: string;

  pendingTitle: string;
  pendingDetail: (amountUsdc: string) => string;
  confirmingTitle: string;
  confirmingDetail: (done: number, required: number) => string;
  paidTitle: string;
  paidDetail: string;
  underpaidTitle: string;
  underpaidDetail: (receivedUsdc: string, dueUsdc: string) => string;
  expiredTitle: string;
  expiredDetail: string;

  priceUnavailableTitle: string;
  priceUnavailableDetail: string;
  slotsTitle: string;
  slotsDetail: string;
  rateLimitedTitle: string;
  rateLimitedDetail: string;
  merchantMissingTitle: string;
  contactOwner: string;
  invalidAmountTitle: string;
  startFailedTitle: string;
  startFailedDetail: string;

  startNew: string;
  tryAgain: string;
  payWithWallet: (amountUsdc: string) => string;
  openWalletApp: string;
  noBrowserWallet: string;
  noCrypto: (label: string) => string;
  confirmInWallet: string;
  sentTitle: string;
  sentDetail: string;
  notSentTitle: string;
  walletUnknownError: string;
  footnote: (shortAddress: string) => string;
  staleQuote: string;
  wallet: Record<WalletReason, string>;
}

const en: Messages = {
  preparing: 'Preparing your payment…',
  cardLabel: 'Pay with USDC',
  payUsd: (amountUsd) => `Pay $${amountUsd}`,
  usdcOnBase: (amountUsdc) => `${amountUsdc} USDC on Base`,
  order: (orderRef) => `Order ${orderRef}`,
  qrLabel: (amountUsdc, address) => `QR code to pay ${amountUsdc} USDC to ${address}`,
  sendTo: 'Send USDC on Base to',
  exactAmount: 'Exact amount',
  copy: 'Copy',
  copied: 'Copied',
  pressCopy: 'Press ⌘C',
  expiresIn: (countdown) => `Expires in ${countdown}`,
  transaction: 'Transaction: ',

  pendingTitle: 'Waiting for payment',
  pendingDetail: (amountUsdc) => `Send exactly ${amountUsdc} USDC on Base to the address below.`,
  confirmingTitle: 'Payment received, confirming',
  confirmingDetail: (done, required) => `${done} of ${required} confirmations. Keep this page open.`,
  paidTitle: 'Payment received',
  paidDetail: 'Thank you. Your payment is confirmed.',
  underpaidTitle: 'Not enough was received',
  underpaidDetail: (receivedUsdc, dueUsdc) =>
    `We received ${receivedUsdc} USDC of the ${dueUsdc} USDC due. ` +
    'Contact the store to sort this out — nothing was sent back automatically.',
  expiredTitle: 'This payment window closed',
  expiredDetail: 'Prices move, so quotes expire. Start again to get a fresh amount.',

  priceUnavailableTitle: 'Payments are paused',
  priceUnavailableDetail:
    'We cannot confirm the USDC price right now, so we will not quote you a wrong amount. Try again in a few minutes.',
  slotsTitle: 'Too many checkouts are open',
  slotsDetail: 'This store has more payments in flight than it can tell apart. Try again in a minute.',
  rateLimitedTitle: 'Too many attempts',
  rateLimitedDetail: 'Wait a minute, then try again.',
  merchantMissingTitle: 'This store is not set up for payments',
  contactOwner: 'Contact the store owner.',
  invalidAmountTitle: 'That amount cannot be charged',
  startFailedTitle: 'We could not start the payment',
  startFailedDetail: 'The payment service did not respond. Check your connection and try again.',

  startNew: 'Start a new payment',
  tryAgain: 'Try again',
  payWithWallet: (amountUsdc) => `Pay ${amountUsdc} USDC`,
  openWalletApp: 'Open your wallet app',
  noBrowserWallet: 'No browser wallet detected. Scan the QR code with your wallet app instead.',
  noCrypto: (label) => `No crypto? ${label}`,
  confirmInWallet: 'Confirm in your wallet…',
  sentTitle: 'Payment sent',
  sentDetail: 'Waiting for the network to confirm it. Keep this page open.',
  notSentTitle: 'Payment not sent',
  walletUnknownError: 'Something went wrong talking to your wallet. Try again, or scan the QR code instead.',
  footnote: (shortAddress) =>
    'Send the exact amount — it is how this payment is identified. ' +
    `Funds go straight to ${shortAddress}; nothing is held in between.`,
  staleQuote: ' Note: this quote used a delayed price.',
  wallet: {
    'no-wallet': 'No crypto wallet was found in this browser.',
    'connect-declined': 'You declined the connection request.',
    'connect-failed': 'Could not connect to your wallet.',
    'no-account': 'Your wallet did not return an account.',
    'network-declined': 'You declined the network switch. Payment needs the Base network.',
    'add-network-declined': 'You declined adding the Base network.',
    'network-switch-failed': 'Could not switch your wallet to Base. Switch networks manually and try again.',
    'payment-cancelled': 'You cancelled the payment in your wallet.',
    'insufficient-funds': 'Your wallet does not have enough USDC or ETH for gas on Base.',
    'send-failed': 'The payment could not be sent. Check your wallet and try again.',
  },
};

const sr: Messages = {
  preparing: 'Pripremamo plaćanje…',
  cardLabel: 'Plati u USDC',
  payUsd: (amountUsd) => `Plati $${amountUsd}`,
  usdcOnBase: (amountUsdc) => `${amountUsdc} USDC na Base mreži`,
  order: (orderRef) => `Porudžbina ${orderRef}`,
  qrLabel: (amountUsdc, address) => `QR kod za uplatu ${amountUsdc} USDC na ${address}`,
  sendTo: 'Pošalji USDC na Base mreži na adresu',
  exactAmount: 'Tačan iznos',
  copy: 'Kopiraj',
  copied: 'Kopirano',
  pressCopy: 'Pritisni Ctrl+C',
  expiresIn: (countdown) => `Ističe za ${countdown}`,
  transaction: 'Transakcija: ',

  pendingTitle: 'Čekamo uplatu',
  pendingDetail: (amountUsdc) => `Pošalji tačno ${amountUsdc} USDC na Base mreži na adresu ispod.`,
  confirmingTitle: 'Uplata stigla, potvrđujemo',
  confirmingDetail: (done, required) => `${done} od ${required} potvrda. Ne zatvaraj ovu stranicu.`,
  paidTitle: 'Uplata primljena',
  paidDetail: 'Hvala! Tvoja uplata je potvrđena.',
  underpaidTitle: 'Stiglo je manje nego što treba',
  underpaidDetail: (receivedUsdc, dueUsdc) =>
    `Primili smo ${receivedUsdc} USDC od ${dueUsdc} USDC. ` +
    'Javi se prodavnici da to rešite — ništa nije automatski vraćeno.',
  expiredTitle: 'Vreme za plaćanje je isteklo',
  expiredDetail: 'Cene se menjaju, pa ponuda ističe. Pokreni ponovo da dobiješ novi iznos.',

  priceUnavailableTitle: 'Plaćanje je privremeno pauzirano',
  priceUnavailableDetail:
    'Trenutno ne možemo da potvrdimo cenu USDC-a, pa ti nećemo dati pogrešan iznos. Pokušaj ponovo za nekoliko minuta.',
  slotsTitle: 'Previše otvorenih plaćanja',
  slotsDetail: 'Ova prodavnica trenutno ima previše plaćanja u toku. Pokušaj ponovo za minut.',
  rateLimitedTitle: 'Previše pokušaja',
  rateLimitedDetail: 'Sačekaj minut, pa pokušaj ponovo.',
  merchantMissingTitle: 'Ova prodavnica nije podešena za plaćanje',
  contactOwner: 'Javi se vlasniku prodavnice.',
  invalidAmountTitle: 'Ovaj iznos ne može da se naplati',
  startFailedTitle: 'Nismo uspeli da pokrenemo plaćanje',
  startFailedDetail: 'Servis za plaćanje ne odgovara. Proveri internet vezu i pokušaj ponovo.',

  startNew: 'Pokreni novo plaćanje',
  tryAgain: 'Pokušaj ponovo',
  payWithWallet: (amountUsdc) => `Plati ${amountUsdc} USDC`,
  openWalletApp: 'Otvori aplikaciju novčanika',
  noBrowserWallet: 'Nema novčanika u pregledaču. Skeniraj QR kod aplikacijom novčanika.',
  noCrypto: (label) => `Nemaš kripto? ${label}`,
  confirmInWallet: 'Potvrdi u novčaniku…',
  sentTitle: 'Uplata poslata',
  sentDetail: 'Čekamo da je mreža potvrdi. Ne zatvaraj ovu stranicu.',
  notSentTitle: 'Uplata nije poslata',
  walletUnknownError: 'Nešto nije u redu sa novčanikom. Pokušaj ponovo ili skeniraj QR kod.',
  footnote: (shortAddress) =>
    'Pošalji tačan iznos — po njemu prepoznajemo ovu uplatu. ' +
    `Novac ide direktno na ${shortAddress}; niko ga ne drži između.`,
  staleQuote: ' Napomena: iznos je izračunat po malo starijoj ceni.',
  wallet: {
    'no-wallet': 'U ovom pregledaču nije pronađen kripto novčanik.',
    'connect-declined': 'Odbio si zahtev za povezivanje.',
    'connect-failed': 'Povezivanje sa novčanikom nije uspelo.',
    'no-account': 'Novčanik nije vratio nalog.',
    'network-declined': 'Odbio si promenu mreže. Za plaćanje je potrebna Base mreža.',
    'add-network-declined': 'Odbio si dodavanje Base mreže.',
    'network-switch-failed': 'Novčanik nije prebačen na Base. Promeni mrežu ručno i pokušaj ponovo.',
    'payment-cancelled': 'Otkazao si plaćanje u novčaniku.',
    'insufficient-funds': 'U novčaniku nema dovoljno USDC-a ili ETH-a za gas na Base mreži.',
    'send-failed': 'Uplata nije poslata. Proveri novčanik i pokušaj ponovo.',
  },
};

const MESSAGES: Record<Locale, Messages> = { en, sr };

/** Accepts "sr", "sr-Latn", "SR_rs" and the like; anything else is English. */
export function resolveLocale(input: string | null | undefined): Locale {
  const language = (input ?? '').trim().toLowerCase().split(/[-_]/)[0];
  return language === 'sr' ? 'sr' : 'en';
}

export function messagesFor(locale: Locale): Messages {
  return MESSAGES[locale];
}
