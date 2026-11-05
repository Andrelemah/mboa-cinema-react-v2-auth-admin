import { apiHandler, authenticate, databaseError, rateLimit } from '../_shared/runtime.ts';
import { HttpError } from '../_shared/security.mjs';
import { paystackRequest, paystackStatus, requirePaystackConfig, verifyPaystackTransaction } from '../_shared/paystack.ts';

function billingEmail(value: unknown) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, 'INVALID_INPUT', 'Une adresse e-mail de reçu valide est nécessaire.');
  }
  return email;
}

function validateCheckoutUrl(value: unknown) {
  try {
    const url = new URL(String(value));
    if (url.protocol === 'https:' && url.hostname === 'checkout.paystack.com'
        && !url.username && !url.password && !url.port) return url.href;
  } catch { /* Invalid provider URLs fail closed. */ }
  throw new HttpError(502, 'PROVIDER_UNAVAILABLE', 'Paystack a renvoyé un lien de paiement invalide.');
}

async function verifyPayment(reference: unknown, context: Awaited<ReturnType<typeof authenticate>>) {
  if (typeof reference !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(reference)) {
    throw new HttpError(400, 'INVALID_INPUT', 'Référence de paiement invalide.');
  }
  const paymentResult = await context.service.from('payment_transactions')
    .select('id,user_id,reference,plan,amount_minor,currency,channels,status')
    .eq('reference', reference).eq('user_id', context.user.id).maybeSingle();
  if (paymentResult.error) databaseError(paymentResult.error);
  const payment = paymentResult.data;
  if (!payment) throw new HttpError(404, 'PAYMENT_NOT_FOUND', 'Paiement introuvable.');
  if (payment.status === 'succeeded') return { status: 'succeeded', plan: payment.plan };
  if (payment.status !== 'pending') return { status: payment.status };

  const config = requirePaystackConfig();
  const verified = await verifyPaystackTransaction(reference, config);
  if (!verified.successful) return { status: 'pending' };
  if (verified.amount !== payment.amount_minor || verified.currency !== payment.currency
      || !payment.channels.includes(verified.channel)) {
    throw new HttpError(502, 'PROVIDER_UNAVAILABLE', 'Les informations vérifiées ne correspondent pas au paiement demandé.');
  }
  const completed = await context.service.rpc('complete_paystack_transaction', {
    p_reference: reference,
    p_amount_minor: verified.amount,
    p_currency: verified.currency,
    p_gateway_transaction_id: verified.transactionId,
    p_payment_channel: verified.channel,
  });
  if (completed.error) databaseError(completed.error);
  return { status: 'succeeded', plan: payment.plan };
}

Deno.serve(apiHandler(async (body, request) => {
  if (body.action === 'status') return paystackStatus();
  if (body.action !== 'checkout' && body.action !== 'verify') {
    throw new HttpError(400, 'INVALID_INPUT', 'Action de paiement invalide.');
  }
  const context = await authenticate(request);
  await rateLimit(context, 'paystack-checkout', 5, 300);
  if (body.action === 'verify') return verifyPayment(body.reference, context);

  const config = requirePaystackConfig();
  const plan = body.plan === 'mobile' || body.plan === 'plus' ? body.plan : null;
  if (!plan) throw new HttpError(400, 'INVALID_INPUT', 'Offre invalide.');
  const requestedChannel = body.channel === 'card' || body.channel === 'mobile_money' ? body.channel : null;
  const channel = requestedChannel && config.channels.includes(requestedChannel)
    ? requestedChannel
    : requestedChannel
      ? null
      : config.channels;
  if (!channel) throw new HttpError(400, 'INVALID_INPUT', 'Mode de paiement indisponible.');
  const email = context.user.email || billingEmail(body.billingEmail);
  const price = config.prices[plan];
  const reference = `epizo-${crypto.randomUUID().replaceAll('-', '')}`;
  const inserted = await context.service.from('payment_transactions').insert({
    user_id: context.user.id, provider: 'paystack', reference, plan,
    amount_minor: price.amountMinor, currency: config.currency,
    channels: Array.isArray(channel) ? channel : [channel],
  }).select('id').single();
  if (inserted.error || !inserted.data) databaseError(inserted.error);

  try {
    const response = await paystackRequest('/transaction/initialize', config, {
      method: 'POST',
      body: JSON.stringify({
        email,
        amount: price.amountMinor,
        currency: config.currency,
        reference,
        channels: Array.isArray(channel) ? channel : [channel],
        callback_url: config.callbackUrl,
        metadata: { payment_id: inserted.data.id, plan },
      }),
    });
    if (response.reference !== reference) throw new HttpError(502, 'PROVIDER_UNAVAILABLE', 'La référence retournée par Paystack est invalide.');
    const checkoutUrl = validateCheckoutUrl(response.authorization_url);
    return { checkoutUrl, reference };
  } catch (error) {
    const failed = await context.service.from('payment_transactions')
      .update({ status: 'failed', updated_at: new Date().toISOString() }).eq('reference', reference).eq('status', 'pending');
    if (failed.error) console.error(JSON.stringify({ kind: 'payment_initialization_cleanup_failed' }));
    throw error;
  }
}));
