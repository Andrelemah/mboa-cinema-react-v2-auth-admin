import { backendConfigured, supabase } from '../lib/supabase.js';

function assertRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid payment service response.');
  return value;
}

export async function getPaymentStatus() {
  if (!backendConfigured || !supabase) return { enabled: false, state: 'demo', methods: [] };
  const { data, error } = await supabase.functions.invoke('paystack-checkout', { body: { action: 'status' } });
  if (error) throw error;
  const result = assertRecord(data);
  if (result.enabled === true) {
    const prices = assertRecord(result.prices);
    for (const plan of ['mobile', 'plus']) {
      const item = assertRecord(prices[plan]);
      if (!Number.isSafeInteger(item.amount) || item.amount <= 0
          || typeof item.currency !== 'string' || !/^[A-Z]{3}$/.test(item.currency)) {
        throw new Error('Invalid payment price.');
      }
    }
    if (!Array.isArray(result.methods) || !result.methods.every(method => ['card', 'mobile_money'].includes(method))) {
      throw new Error('Invalid payment methods.');
    }
  }
  return result;
}

export async function createPaystackCheckout({ plan, billingEmail, channel }) {
  if (!supabase) throw new Error('Payment backend is not configured.');
  const { data, error } = await supabase.functions.invoke('paystack-checkout', {
    body: {
      action: 'checkout', plan,
      ...(billingEmail ? { billingEmail } : {}),
      ...(channel ? { channel } : {}),
    },
  });
  if (error) throw error;
  const result = assertRecord(data);
  if (typeof result.checkoutUrl !== 'string' || typeof result.reference !== 'string') {
    throw new Error('Invalid payment checkout response.');
  }
  return result;
}

export async function verifyPaystackCheckout(reference) {
  if (!supabase) throw new Error('Payment backend is not configured.');
  const { data, error } = await supabase.functions.invoke('paystack-checkout', {
    body: { action: 'verify', reference },
  });
  if (error) throw error;
  const result = assertRecord(data);
  if (!['succeeded', 'pending', 'failed'].includes(result.status)) throw new Error('Invalid payment status response.');
  return result;
}
