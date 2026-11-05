import { databaseError, failure, jsonResponse, readTextBounded, requiredEnv, serviceClient } from '../_shared/runtime.ts';
import { HttpError, verifyPaystackSignature } from '../_shared/security.mjs';
import { paystackRequest, requirePaystackConfig } from '../_shared/paystack.ts';

Deno.serve(async request => {
  const requestId = crypto.randomUUID();
  try {
    if (request.method !== 'POST') throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée.');
    const rawBody = await readTextBounded(request, 1024 * 1024);
    const secret = requiredEnv('PAYSTACK_SECRET_KEY');
    const signature = request.headers.get('x-paystack-signature') ?? '';
    if (!await verifyPaystackSignature(rawBody, signature, secret)) {
      throw new HttpError(401, 'INVALID_SIGNATURE', 'Signature Paystack invalide.');
    }

    let event: unknown;
    try { event = JSON.parse(rawBody); }
    catch { throw new HttpError(400, 'INVALID_INPUT', 'Notification Paystack invalide.'); }
    if (!event || typeof event !== 'object' || Array.isArray(event)) {
      throw new HttpError(400, 'INVALID_INPUT', 'Notification Paystack invalide.');
    }
    const payload = event as Record<string, unknown>;
    if (payload.event !== 'charge.success') return jsonResponse({ received: true });
    const charge = payload.data;
    if (!charge || typeof charge !== 'object' || Array.isArray(charge)) {
      throw new HttpError(400, 'INVALID_INPUT', 'Notification Paystack invalide.');
    }
    const reference = (charge as Record<string, unknown>).reference;
    if (typeof reference !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(reference)) {
      throw new HttpError(400, 'INVALID_INPUT', 'Référence Paystack invalide.');
    }

    const service = serviceClient();
    const order = await service.from('payment_transactions')
      .select('reference,amount_minor,currency,channels,status').eq('reference', reference).maybeSingle();
    if (order.error) databaseError(order.error);
    if (!order.data) {
      console.error(JSON.stringify({ requestId, kind: 'paystack_order_not_found' }));
      return jsonResponse({ received: true });
    }
    if (order.data.status === 'succeeded') return jsonResponse({ received: true });
    const config = requirePaystackConfig();
    const verified = await paystackRequest(`/transaction/verify/${encodeURIComponent(reference)}`, config);
    const data = verified as Record<string, unknown>;
    if (data.reference !== reference || data.status !== 'success' || !Number.isSafeInteger(data.amount)
        || data.amount !== order.data.amount_minor || data.currency !== order.data.currency
        || typeof data.channel !== 'string' || !order.data.channels.includes(data.channel)
        || !/^[A-Za-z0-9_-]{1,100}$/.test(String(data.id ?? ''))) {
      throw new HttpError(502, 'PROVIDER_UNAVAILABLE', 'Le paiement n’a pas pu être vérifié.');
    }
    const completed = await service.rpc('complete_paystack_transaction', {
      p_reference: reference,
      p_amount_minor: data.amount,
      p_currency: data.currency,
      p_gateway_transaction_id: String(data.id),
      p_payment_channel: data.channel,
    });
    if (completed.error) databaseError(completed.error);
    return jsonResponse({ received: true });
  } catch (error) {
    const response = failure(error, requestId);
    return response;
  }
});
