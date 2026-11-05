import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { plans } from '../data/catalogue.js';
import Icon from '../components/Icon.jsx';
import TitleLines from './TitleLines.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { getPaymentStatus } from '../services/payments.js';

export default function OffersPage() {
  const { t, lang, openModal } = useApp();
  const { configured } = useAuth();
  const [paymentStatus, setPaymentStatus] = useState(null);
  const [paymentStatusError, setPaymentStatusError] = useState(false);

  useEffect(() => {
    if (!configured) return undefined;
    let active = true;
    getPaymentStatus().then(status => {
      if (active) setPaymentStatus(status);
    }).catch(() => {
      if (active) setPaymentStatusError(true);
    });
    return () => { active = false; };
  }, [configured]);

  const formatPrice = (amount, currency) => `${new Intl.NumberFormat(lang === 'fr' ? 'fr-CM' : 'en-CM', { maximumFractionDigits: 0 }).format(amount)} ${currency}`;

  return (
    <section className="page plans-page">
      <div className="plans-intro">
        <div className="eyebrow">{t('plansEyebrow')}</div>
        <h1><TitleLines>{t('plansTitle')}</TitleLines></h1>
        <p>{t('plansDesc')}</p>
      </div>
      {configured && !paymentStatus?.enabled && <p className="connected-offers-note" role="status">
        {paymentStatusError ? t('paymentServiceError') : t('paymentsUnavailableCopy')}
      </p>}
      <div className="plans-grid">
        {plans.filter(plan => plan.id === 'mobile' || plan.id === 'plus').map(plan => {
          const plus = plan.id === 'plus';
          const features = [
            plus ? 'supportedDevices' : 'phoneOnly',
            plus ? 'fourScreens' : 'oneScreen',
            plus ? 'plusUnlimited' : 'mobileUnlimited',
            'manualRenew',
          ];

          return (
            <article className={`plan-card ${plan.id}`} key={plan.id}>
              <div className="plan-top">
                <span className="plan-icon"><Icon name={plus ? 'users' : 'phone'} /></span>
                {plus && <span className="plan-badge">{t('sharing')}</span>}
              </div>
              <h2>{plan.name}</h2>
              <p className="plan-intro">{t(plus ? 'plusIntro' : 'mobileIntro')}</p>
              <div className="plan-price">{paymentStatus?.enabled
                ? formatPrice(paymentStatus.prices[plan.id].amount, paymentStatus.prices[plan.id].currency)
                : <>{plan.price.toLocaleString('fr-FR')}<small>FCFA</small></>}</div>
              <p className="plan-period">{t('period')}</p>
              <ul className="plan-features">
                {features.map(feature => <li key={feature}><Icon name="check" /><span>{t(feature)}</span></li>)}
              </ul>
              <button className={`button ${plus ? '' : 'ghost'}`} onClick={() => openModal('checkout', { planId: plan.id })}>
                {paymentStatus?.enabled ? t('paymentSubscribe') : configured ? (lang === 'fr' ? 'Bientôt disponible' : 'Coming soon') : t(plus ? 'tryPlus' : 'tryMobile')}<Icon name="arrow-right" />
              </button>
            </article>
          );
        })}
      </div>
      <p className="plans-fineprint">{paymentStatus?.enabled ? t('paymentLivePricesNote') : t('priceNote')}</p>
      <div className="payment-logos">
        <span>{t('paymentPlanned')}</span>
        {paymentStatus?.enabled
          ? paymentStatus.methods.map(method => <span key={method}>{method === 'card' ? t('paymentCard') : t('paymentMobileMoney')}</span>)
          : <><span className="mtn-mark">MTN MoMo</span><span><span className="orange-mark">Orange</span> Money</span></>}
      </div>
      <div className="discovery-note">
        <div><h3>{t('freeHeading')}</h3><p>{t('freeCopy')}</p></div>
        <a className="text-link" href="#films">{t('explore')}<Icon name="arrow-right" /></a>
      </div>
      <section className="faq">
        <h2>{t('faqHeading')}</h2>
        {[1, 2, 3, 4].map(index => (
          <details key={index}><summary>{t(`faq${index}`)}</summary><p>{t(`faq${index}a`)}</p></details>
        ))}
      </section>
    </section>
  );
}
