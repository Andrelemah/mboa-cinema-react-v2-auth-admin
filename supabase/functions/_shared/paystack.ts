import { HttpError, allowedOrigin, configuredOrigins } from './security.mjs';

type PlanPrice = { amount: number; amountMinor: number };
export type PaystackConfig = {
  secretKey: string;
  currency: string;
  subunitFactor: number;
  channels: string[];
  callbackUrl: string;
  prices: { mobile: PlanPrice; plus: PlanPrice };
};
type PaystackVerification =
  | { successful: true; transactionId: string; amount: number; currency: string; channel: string }
  | { successful: false; status: string };

function env(name: string) {
  return Deno.env.get(name)?.trim() ?? '';
}

function price(name: string, factor: number) {
  const amount = Number(env(name));
  const amountMinor = amount * factor;
  if (!Number.isSafeInteger(amount) || amount <= 0 || !Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw new HttpError(503, 'NOT_CONFIGURED', 'Les tarifs de paiement doivent être configurés.');
  }
  return { amount, amountMinor };
}

export function paystackStatus() {
  if (env('PAYMENTS_ENABLED') !== 'true') return { enabled: false, state: 'closed', methods: [] };
  const required = [
    'PAYSTACK_SECRET_KEY', 'PAYSTACK_CURRENCY', 'PAYSTACK_SUBUNIT_FACTOR', 'PAYSTACK_CHANNELS',
    'PAYSTACK_PLAN_MOBILE_AMOUNT', 'PAYSTACK_PLAN_PLUS_AMOUNT', 'PAYSTACK_CALLBACK_URL', 'APP_ORIGIN',
  ];
  if (required.some(name => !env(name))) return { enabled: false, state: 'setup_incomplete', methods: [] };
  const config = readPaystackConfig();
  return {
    enabled: true,
    state: 'ready',
    methods: config.channels,
    prices: {
      mobile: { amount: config.prices.mobile.amount, currency: config.currency },
      plus: { amount: config.prices.plus.amount, currency: config.currency },
    },
  };
}

export function requirePaystackConfig(): PaystackConfig {
  if (env('PAYMENTS_ENABLED') !== 'true') throw new HttpError(503, 'PAYMENTS_CLOSED', 'Les paiements ne sont pas encore ouverts.');
  const required = [
    'PAYSTACK_SECRET_KEY', 'PAYSTACK_CURRENCY', 'PAYSTACK_SUBUNIT_FACTOR', 'PAYSTACK_CHANNELS',
    'PAYSTACK_PLAN_MOBILE_AMOUNT', 'PAYSTACK_PLAN_PLUS_AMOUNT', 'PAYSTACK_CALLBACK_URL', 'APP_ORIGIN',
  ];
  if (required.some(name => !env(name))) throw new HttpError(503, 'NOT_CONFIGURED', 'Le paiement doit être configuré avant son activation.');
  return readPaystackConfig();
}

function readPaystackConfig(): PaystackConfig {
  const secretKey = env('PAYSTACK_SECRET_KEY');
  const currency = env('PAYSTACK_CURRENCY').toUpperCase();
  const subunitFactor = Number(env('PAYSTACK_SUBUNIT_FACTOR'));
  const channels = [...new Set(env('PAYSTACK_CHANNELS').split(',').map(value => value.trim()).filter(Boolean))];
  const callbackUrl = env('PAYSTACK_CALLBACK_URL');
  if (!/^sk_(test|live)_[A-Za-z0-9]+$/.test(secretKey)
      || !/^[A-Z]{3}$/.test(currency)
      || !Number.isSafeInteger(subunitFactor) || subunitFactor < 1 || subunitFactor > 10000
      || !channels.includes('card') || channels.some(channel => !['card', 'mobile_money'].includes(channel))) {
    throw new HttpError(503, 'NOT_CONFIGURED', 'La configuration Paystack est invalide.');
  }
  let callback: URL;
  try { callback = new URL(callbackUrl); }
  catch { throw new HttpError(503, 'NOT_CONFIGURED', 'Le retour de paiement doit utiliser une URL valide.'); }
  if (callback.username || callback.password || callback.search || callback.hash
      || !allowedOrigin(callback.origin, configuredOrigins(env('APP_ORIGIN')))) {
    throw new HttpError(503, 'NOT_CONFIGURED', 'Le retour de paiement doit utiliser une origine autorisée.');
  }
  return {
    secretKey, currency, subunitFactor, channels, callbackUrl,
    prices: {
      mobile: price('PAYSTACK_PLAN_MOBILE_AMOUNT', subunitFactor),
      plus: price('PAYSTACK_PLAN_PLUS_AMOUNT', subunitFactor),
    },
  };
}

export async function paystackRequest(path: string, config: PaystackConfig, init: RequestInit = {}) {
  let response: Response;
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${config.secretKey}`);
  if (init.body) headers.set('Content-Type', 'application/json');
  try {
    response = await fetch(`https://api.paystack.co${path}`, {
      ...init, headers, redirect: 'error', signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new HttpError(502, 'PROVIDER_UNAVAILABLE', 'Paystack est momentanément indisponible.');
  }
  let payload: unknown;
  try { payload = await response.json(); }
  catch { throw new HttpError(502, 'PROVIDER_UNAVAILABLE', 'Réponse Paystack invalide.'); }
  if (!response.ok || !payload || typeof payload !== 'object' || Array.isArray(payload)
      || (payload as Record<string, unknown>).status !== true) {
    throw new HttpError(502, 'PROVIDER_UNAVAILABLE', 'Paystack n’a pas pu traiter la demande.');
  }
  const data = (payload as Record<string, unknown>).data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new HttpError(502, 'PROVIDER_UNAVAILABLE', 'Réponse Paystack invalide.');
  }
  return data as Record<string, unknown>;
}

export async function verifyPaystackTransaction(reference: string, config: PaystackConfig): Promise<PaystackVerification> {
  const data = await paystackRequest(`/transaction/verify/${encodeURIComponent(reference)}`, config);
  if (data.reference !== reference || typeof data.status !== 'string') {
    throw new HttpError(502, 'PROVIDER_UNAVAILABLE', 'La vérification Paystack est invalide.');
  }
  if (data.status !== 'success') return { successful: false, status: data.status };
  const transactionId = String(data.id ?? '');
  const amount = data.amount;
  const currency = data.currency;
  const channel = data.channel;
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(transactionId)
      || typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount <= 0
      || typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)
      || typeof channel !== 'string' || !['card', 'mobile_money'].includes(channel)) {
    throw new HttpError(502, 'PROVIDER_UNAVAILABLE', 'Les détails de paiement Paystack sont invalides.');
  }
  return { successful: true, transactionId, amount, currency, channel };
}
