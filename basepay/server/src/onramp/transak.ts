import { z } from 'zod';

const HOSTS = {
  STAGING: { api: 'https://api-stg.transak.com', gateway: 'https://api-gateway-stg.transak.com' },
  PRODUCTION: { api: 'https://api.transak.com', gateway: 'https://api-gateway.transak.com' },
} as const;

/**
 * Refresh this long before the stated expiry, so a token never lapses between
 * being read here and being checked by Transak.
 */
const TOKEN_REFRESH_MARGIN_MS = 60 * 60 * 1000;

const tokenResponse = z.object({
  data: z.object({ accessToken: z.string().min(1), expiresAt: z.number().positive() }),
});
const widgetResponse = z.object({ data: z.object({ widgetUrl: z.string().url() }) });

export interface TransakClientOptions {
  apiKey: string;
  apiSecret: string;
  environment: 'STAGING' | 'PRODUCTION';
  timeoutMs?: number;
  fetch?: typeof fetch;
  now?: () => number;
}

export interface WidgetRequest {
  walletAddress: string;
  /** Charged to the buyer's card. Transak's fee comes out of it. */
  fiatAmountUsd: string;
  /** Returned in Transak's order records and webhooks: the BasePay session id. */
  partnerOrderId: string;
  /** The host of the page that opens the widget. Transak checks it against the Referer. */
  referrerDomain: string;
  userIp: string;
}

/** A failed call to Transak. Never carries the API secret. */
export class TransakError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = 'TransakError';
  }
}

/**
 * Transak's server-side widget flow.
 *
 * Transak no longer accepts a widget link built from query parameters in the
 * browser. The backend trades its API secret for a partner access token, then
 * asks for a widget URL per buyer; each URL is single-use and valid for five
 * minutes. The token is valid for seven days and its endpoint is rate-limited,
 * so it is cached and shared across checkouts.
 */
export class TransakClient {
  private token: { value: string; expiresAtMs: number } | null = null;
  private refreshing: Promise<string> | null = null;
  private readonly hosts: (typeof HOSTS)[keyof typeof HOSTS];
  private readonly fetch: typeof fetch;
  private readonly now: () => number;
  private readonly timeoutMs: number;

  constructor(private readonly options: TransakClientOptions) {
    this.hosts = HOSTS[options.environment];
    this.fetch = options.fetch ?? fetch;
    this.now = options.now ?? Date.now;
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  async createWidgetUrl(request: WidgetRequest): Promise<string> {
    const first = await this.postWidget(request, await this.accessToken());
    if (first.status !== 401) return this.readWidgetUrl(first);

    // A token rotated or revoked in the dashboard is refused before its stated expiry.
    this.token = null;
    return this.readWidgetUrl(await this.postWidget(request, await this.accessToken()));
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.now() < this.token.expiresAtMs - TOKEN_REFRESH_MARGIN_MS) {
      return this.token.value;
    }
    this.refreshing ??= this.refreshToken().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private async refreshToken(): Promise<string> {
    const response = await this.fetch(`${this.hosts.api}/partners/api/v2/refresh-token`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'api-secret': this.options.apiSecret,
        'x-api-key': this.options.apiKey,
      },
      body: JSON.stringify({ apiKey: this.options.apiKey }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) {
      throw new TransakError(`Transak access token request failed with HTTP ${response.status}`, response.status);
    }
    const parsed = tokenResponse.safeParse(await response.json());
    if (!parsed.success) {
      throw new TransakError('Transak access token response was not in the expected shape', response.status);
    }
    // Documented as a Unix timestamp in seconds.
    this.token = { value: parsed.data.data.accessToken, expiresAtMs: parsed.data.data.expiresAt * 1000 };
    return this.token.value;
  }

  private postWidget(request: WidgetRequest, accessToken: string): Promise<Response> {
    return this.fetch(`${this.hosts.gateway}/api/v2/auth/session`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'access-token': accessToken,
        'x-api-key': this.options.apiKey,
        'x-user-ip': request.userIp,
      },
      body: JSON.stringify({
        widgetParams: {
          apiKey: this.options.apiKey,
          referrerDomain: request.referrerDomain,
          productsAvailed: 'BUY',
          fiatCurrency: 'USD',
          fiatAmount: Number(request.fiatAmountUsd),
          cryptoCurrencyCode: 'USDC',
          network: 'base',
          walletAddress: request.walletAddress,
          // The buyer must not be able to send the funds anywhere but the merchant.
          disableWalletAddressForm: true,
          partnerOrderId: request.partnerOrderId,
        },
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
  }

  private async readWidgetUrl(response: Response): Promise<string> {
    if (!response.ok) {
      throw new TransakError(`Transak widget URL request failed with HTTP ${response.status}`, response.status);
    }
    const parsed = widgetResponse.safeParse(await response.json());
    if (!parsed.success) {
      throw new TransakError('Transak widget URL response was not in the expected shape', response.status);
    }
    return parsed.data.data.widgetUrl;
  }
}
