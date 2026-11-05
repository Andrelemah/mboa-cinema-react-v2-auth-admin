import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext.jsx';
import Icon from '../Icon.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { createPaystackCheckout, getPaymentStatus, verifyPaystackCheckout } from '../../services/payments.js';

export function CheckoutDialog({ planId }) {
  const { t, lang, setPlan, openModal } = useApp();
  const { configured, user } = useAuth();
  const [payment, setPayment] = useState('card');
  const [paymentStatus, setPaymentStatus] = useState(null);
  const [statusError, setStatusError] = useState(false);
  const [billingEmail, setBillingEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState(false);
  const selectedPlan = planId === 'plus' ? 'plus' : 'mobile';
  const plus = selectedPlan === 'plus';
  const planPrice = plus ? paymentStatus?.prices?.plus : paymentStatus?.prices?.mobile;

  useEffect(() => {
    if (!configured) return undefined;
    let active = true;
    getPaymentStatus().then(status => {
      if (active) setPaymentStatus(status);
    }).catch(() => {
      if (active) setStatusError(true);
    });
    return () => { active = false; };
  }, [configured]);

  function simulate() {
    if (configured) return;
    setPlan(selectedPlan);
    openModal('success', { planId: selectedPlan });
  }

  async function startCheckout(event) {
    event.preventDefault();
    if (!user || submitting || !paymentStatus?.enabled) return;
    setSubmitting(true);
    setCheckoutError(false);
    try {
      const { checkoutUrl } = await createPaystackCheckout({
        plan: selectedPlan,
        billingEmail,
        channel: payment,
      });
      window.location.assign(checkoutUrl);
    } catch {
      setCheckoutError(true);
      setSubmitting(false);
    }
  }

  if (configured) {
    const formatPrice = amount => new Intl.NumberFormat(lang === 'fr' ? 'fr-CM' : 'en-CM', { maximumFractionDigits: 0 }).format(amount);
    return <>
      <h2 id="modal-title">{paymentStatus?.enabled ? t('checkoutTitle') : t('paymentsUnavailableTitle')}</h2>
      <p className="modal-description">{paymentStatus?.enabled ? t('hostedCheckoutNotice') : t('paymentsUnavailableCopy')}</p>
      {paymentStatus === null && !statusError && <p role="status">{t('paymentStatusLoading')}</p>}
      {statusError && <p role="alert">{t('paymentServiceError')}</p>}
      {paymentStatus?.enabled && planPrice && <>
        <div className="checkout-summary">
          <div><h3>{plus ? 'Plus' : 'Mobile'}</h3><p>{t(plus ? 'fourScreens' : 'oneScreen')}<br />{t(plus ? 'fullCatalogue' : 'mobileSelection')}</p></div>
          <div className="checkout-price">{formatPrice(planPrice.amount)}<small>{planPrice.currency} · {t('period')}</small></div>
        </div>
        <p className="field-label">{t('paymentMethod')}</p>
        <div className="payment-methods" role="group" aria-label={t('paymentMethod')}>
          {paymentStatus.methods.map(method => (
            <button type="button" className={`payment-method ${payment === method ? 'active' : ''}`} aria-pressed={payment === method} key={method} onClick={() => setPayment(method)}>
              <span>{method === 'card' ? t('paymentCard') : t('paymentMobileMoney')}</span>{payment === method && <Icon name="check" />}
            </button>
          ))}
        </div>
        {!user ? <p className="modal-description"><a className="text-link" href="#connexion">{t('paymentSignIn')}</a></p> : <form onSubmit={startCheckout}>
          {!user.email && <label className="field-label" htmlFor="payment-billing-email">{t('paymentBillingEmail')}
            <input id="payment-billing-email" type="email" autoComplete="email" required maxLength={254} value={billingEmail} onChange={event => setBillingEmail(event.target.value)} />
          </label>}
          {checkoutError && <p role="alert">{t('paymentCheckoutError')}</p>}
          <button type="submit" className="button" disabled={submitting}>
            {submitting ? t('paymentRedirecting') : t('paymentContinue')}<Icon name="arrow-right" />
          </button>
        </form>}
      </>}
    </>;
  }

  return <>
    <h2 id="modal-title">{t('checkoutTitle')}</h2>
    <p className="modal-description">{t('checkoutDesc')}</p>
    <div className="checkout-summary">
      <div><h3>{plus ? 'Plus' : 'Mobile'}</h3><p>{t(plus ? 'fourScreens' : 'oneScreen')}<br />{t(plus ? 'fullCatalogue' : 'mobileSelection')}</p></div>
      <div className="checkout-price">{plus ? '5 000' : '3 000'}<small>FCFA · {t('period')}</small></div>
    </div>
    <p className="field-label">{t('paymentMethod')}</p>
    <div className="payment-methods" role="group" aria-label={t('paymentMethod')}>
      <button type="button" className={`payment-method ${payment === 'mtn' ? 'active' : ''}`} aria-pressed={payment === 'mtn'} onClick={() => setPayment('mtn')}>
        <span className="mtn-mark">MTN MoMo</span>{payment === 'mtn' && <Icon name="check" />}
      </button>
      <button type="button" className={`payment-method ${payment === 'orange' ? 'active' : ''}`} aria-pressed={payment === 'orange'} onClick={() => setPayment('orange')}>
        <span><span className="orange-mark">Orange</span> Money</span>{payment === 'orange' && <Icon name="check" />}
      </button>
    </div>
    <p className="checkout-safe"><Icon name="shield" /><span>{t('checkoutNotice')}</span></p>
    <button type="button" className="button" onClick={simulate}>{t('simulate')}<Icon name="arrow-right" /></button>
  </>;
}

export function PaymentReturnDialog({ reference, onComplete }) {
  const { t, openModal, closeModal } = useApp();
  const { configured, user, loading } = useAuth();
  const [status, setStatus] = useState('checking');
  const [error, setError] = useState(false);
  const lastCheckedUser = useRef(undefined);
  const checkPayment = useCallback(async () => {
    if (!configured || !user) {
      setStatus('sign-in');
      return;
    }
    setStatus('checking');
    setError(false);
    try {
      const result = await verifyPaystackCheckout(reference);
      if (result.status === 'succeeded') {
        onComplete();
        openModal('payment-success', { planId: result.plan });
      } else {
        setStatus(result.status);
      }
    } catch {
      setStatus('pending');
      setError(true);
    }
  }, [configured, onComplete, openModal, reference, user]);

  useEffect(() => {
    if (loading) return;
    const userId = user?.id ?? null;
    if (lastCheckedUser.current === userId) return;
    lastCheckedUser.current = userId;
    void checkPayment();
  }, [checkPayment, loading, user?.id]);

  return <>
    <h2 id="modal-title">{t(status === 'sign-in' ? 'paymentSignInTitle' : 'paymentReturnTitle')}</h2>
    <p className="modal-description" role={error ? 'alert' : 'status'}>
      {status === 'sign-in' ? t('paymentSignIn')
        : status === 'checking' ? t('paymentStatusLoading')
          : status === 'pending' ? t('paymentPending')
            : t('paymentFailed')}
    </p>
    {status === 'sign-in' ? <a className="button" href="#connexion" onClick={closeModal}>{t('paymentSignIn')}</a>
      : status === 'failed' ? <a className="button" href="#abonnements" onClick={closeModal}>{t('paymentRetry')}<Icon name="arrow-right" /></a>
        : status !== 'checking' && <button type="button" className="button" onClick={checkPayment}>{t('paymentCheckAgain')}<Icon name="arrow-right" /></button>}
  </>;
}

export function PaymentSuccessDialog({ planId }) {
  const { t } = useApp();
  return <>
    <span className="success-icon"><Icon name="check" /></span>
    <h2 id="modal-title">{t('paymentSuccessTitle')}</h2>
    <p className="modal-description">{t(planId === 'plus' ? 'paymentSuccessPlus' : 'paymentSuccessMobile')}</p>
  </>;
}

export function SuccessDialog({ planId }) {
  const { t, plan, navigate, resetFilters } = useApp();
  const plus = (planId || plan) === 'plus';
  function continueExploring() {
    resetFilters();
    navigate('films');
  }

  return <>
    <span className="success-icon"><Icon name="check" /></span>
    <h2 id="modal-title">{t('successTitle')}</h2>
    <p className="modal-description">{t('successCopy')}</p>
    <div className="account-plan">
      <div><p>{t('demoPlan')}</p><strong>{plus ? 'Plus' : 'Mobile'}</strong></div>
      <span>{t(plus ? 'fourScreens' : 'oneScreen')}</span>
    </div>
    <button type="button" className="button" onClick={continueExploring}>{t('continue')}<Icon name="arrow-right" /></button>
  </>;
}
