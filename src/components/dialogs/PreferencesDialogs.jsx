import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext.jsx';
import { languages, plans } from '../../data/catalogue.js';
import Icon from '../Icon.jsx';

export function LanguagesDialog({ restoreFocusTo }) {
  const { t, lang, audio, saveLanguages, closeModal, notify } = useApp();
  const [interfaceLanguage, setInterfaceLanguage] = useState(lang);
  const [audioLanguage, setAudioLanguage] = useState(audio);

  function submit(event) {
    event.preventDefault();
    saveLanguages(interfaceLanguage, audioLanguage);
    restoreFocusTo('#open-languages');
    closeModal();
    notify(interfaceLanguage === 'fr' ? 'Vos préférences ont été enregistrées' : 'Your preferences have been saved');
  }

  return <>
    <h2 id="modal-title">{t('languageTitle')}</h2>
    <p className="modal-description">{t('languageDescription')}</p>
    <form id="language-form" onSubmit={submit}>
      <label className="field-label" htmlFor="interface-lang">{t('interfaceLanguage')}</label>
      <select className="form-select" id="interface-lang" value={interfaceLanguage} onChange={event => setInterfaceLanguage(event.target.value)}>
        <option value="fr">Français</option><option value="en">English</option>
      </select>
      <label className="field-label" htmlFor="audio-lang">{t('audioLanguage')}</label>
      <select className="form-select" id="audio-lang" value={audioLanguage} onChange={event => setAudioLanguage(event.target.value)}>
        {languages.filter(language => language.code !== 'all').map(language => <option key={language.code} value={language.code}>{language.label}</option>)}
      </select>
      <p className="settings-note">{t('languageSettingsNote')}</p>
      <button type="submit" className="button">{t('save')}<Icon name="check" /></button>
    </form>
  </>;
}

export function AccountDialog() {
  const { t, names, profile, plan, navigate, openModal } = useApp();
  const selectedPlan = plans.find(item => item.id === plan);
  const name = names[profile] || 'Epizo';
  return <>
    <h2 id="modal-title">{t('accountTitle')}</h2>
    <div className="account-profile">
      <span className="avatar">{name.slice(0, 1).toUpperCase()}</span>
      <div><strong>{name}</strong><p>{t('demoAccount')}</p></div>
    </div>
    <div className="account-plan">
      <div><p>{t('demoPlan')}</p><strong>{plan === 'discovery' ? t('discovery') : selectedPlan?.name}</strong></div>
      <a href="#abonnements" onClick={event => { event.preventDefault(); navigate('abonnements'); }}>{t('change')}<Icon name="chevron-right" /></a>
    </div>
    <button type="button" className="account-link" onClick={() => openModal('profiles')}><Icon name="users" />{t('manageProfiles')}<Icon name="chevron-right" /></button>
    <button type="button" className="account-link" onClick={() => openModal('languages')}><Icon name="globe" />{t('languages')}<Icon name="chevron-right" /></button>
    <button type="button" className="account-link" onClick={() => openModal('info', { kind: 'help' })}><Icon name="info" />{t('help')}<Icon name="chevron-right" /></button>
    <p className="settings-note">{t('accountNote')}</p>
  </>;
}

export function ProfilesDialog() {
  const { t, lang, names, profile, setProfile, saveProfileName, closeModal, notify } = useApp();
  const [name, setName] = useState(names[profile]);
  const inputRef = useRef(null);

  useEffect(() => {
    setName(names[profile]);
    inputRef.current?.setCustomValidity('');
  }, [profile, names]);

  function submit(event) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      inputRef.current?.setCustomValidity(lang === 'fr' ? 'Indiquez un nom.' : 'Enter a name.');
      inputRef.current?.reportValidity();
      return;
    }
    saveProfileName(trimmedName);
    closeModal();
    notify(t('profileSaved'));
  }

  return <>
    <h2 id="modal-title">{t('profilesTitle')}</h2>
    <p className="modal-description">{t('profilesCopy')}</p>
    <div className="profile-options">
      {names.map((profileName, index) => <button
        type="button" className={`profile-option ${index === profile ? 'active' : ''}`}
        key={index} aria-pressed={index === profile} onClick={() => setProfile(index)}
      >
        <span className="avatar">{profileName.slice(0, 1).toUpperCase()}</span><span>{profileName}</span>
      </button>)}
    </div>
    <form id="profile-form" onSubmit={submit}>
      <label className="field-label" htmlFor="profile-name">{t('profileName')}</label>
      <input
        ref={inputRef} className="form-input" id="profile-name" maxLength={24} required
        value={name} autoComplete="off"
        onChange={event => { setName(event.target.value); event.target.setCustomValidity(''); }}
      />
      <button type="submit" className="button">{t('saveProfile')}</button>
    </form>
    <p className="settings-note">{t('profilesNote')}</p>
  </>;
}

export function InfoDialog({ kind, restoreFocusTo }) {
  const { t, lang, closeModal, clearDemoData, notify, isDemoCatalogue } = useApp();
  const safeKind = ['help', 'about', 'privacy'].includes(kind) ? kind : 'help';
  const connectedCopy = {
    fr: {
      help: 'Explorez les films et les histoires, puis connectez-vous pour accéder à votre compte. La lecture dépend de votre abonnement actif. Le catalogue est mis à jour lorsque notre équipe publie un titre.',
      about: 'Epizo rassemble les films, les histoires et les voix du Cameroun. Les créations sont préparées et publiées par notre équipe éditoriale.',
      privacy: 'Votre compte, votre profil et vos droits d’accès sont enregistrés auprès de notre service. Lorsque vous êtes connecté et que la plateforme est visible, nous enregistrons la présence et certains événements techniques pour le suivi et la sécurité. Les favoris et préférences de langue restent dans ce navigateur. Effacer ces préférences ne supprime pas votre compte. La politique complète et les modalités de suppression doivent être publiées avant le lancement commercial.',
    },
    en: {
      help: 'Explore films and stories, then sign in to access your account. Playback requires an active subscription. Our editorial team updates the catalogue when it publishes a title.',
      about: 'Epizo brings together films, stories and voices from Cameroon. Our editorial team prepares and publishes the catalogue.',
      privacy: 'Our service stores your account, profile and access permissions. While you are signed in and the platform is visible, we record presence and certain technical events for reporting and security. Saved titles and language preferences stay in this browser. Clearing these preferences does not delete your account. The full policy and deletion process must be published before commercial launch.',
    },
  };

  function clearPreferences() {
    restoreFocusTo('#main');
    clearDemoData();
    closeModal();
    notify(lang === 'fr' ? 'Préférences locales effacées' : 'Local preferences cleared');
  }

  return <>
    <h2 id="modal-title">{t(`${safeKind}Title`)}</h2>
    <p className="modal-description">{isDemoCatalogue ? t(`${safeKind}Copy`) : connectedCopy[lang][safeKind]}</p>
    {safeKind === 'privacy'
      ? <button type="button" className="button ghost" onClick={clearPreferences}>{lang === 'fr' ? 'Effacer les préférences de ce navigateur' : 'Clear preferences in this browser'}</button>
      : <button type="button" className="button" onClick={closeModal}>{t('understood')}</button>}
  </>;
}
