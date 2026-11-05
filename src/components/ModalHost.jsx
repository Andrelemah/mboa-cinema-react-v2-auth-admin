import { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../context/AppContext.jsx';
import Icon from './Icon.jsx';
import { FilmDetailDialog, PlayerDialog } from './dialogs/FilmDialogs.jsx';
import SearchDialog from './dialogs/SearchDialog.jsx';
import { AccountDialog, InfoDialog, LanguagesDialog, ProfilesDialog } from './dialogs/PreferencesDialogs.jsx';
import { CheckoutDialog, PaymentReturnDialog, PaymentSuccessDialog, SuccessDialog } from './dialogs/CheckoutDialogs.jsx';

const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusableElements(dialog) {
  return [...dialog.querySelectorAll(focusableSelector)]
    .filter(element => !element.hidden && element.getClientRects().length > 0);
}

function DialogContent({ modal, restoreFocusTo }) {
  switch (modal.type) {
    case 'detail': return <FilmDetailDialog filmId={modal.filmId} />;
    case 'player': return <PlayerDialog filmId={modal.filmId} />;
    case 'search': return <SearchDialog />;
    case 'languages': return <LanguagesDialog restoreFocusTo={restoreFocusTo} />;
    case 'account': return <AccountDialog />;
    case 'profiles': return <ProfilesDialog />;
    case 'checkout': return <CheckoutDialog key={modal.planId} planId={modal.planId} />;
    case 'payment-return': return <PaymentReturnDialog reference={modal.reference} onComplete={modal.onComplete} />;
    case 'payment-success': return <PaymentSuccessDialog planId={modal.planId} />;
    case 'success': return <SuccessDialog planId={modal.planId} />;
    case 'info': return <InfoDialog kind={modal.kind} restoreFocusTo={restoreFocusTo} />;
    default: return <InfoDialog kind="help" restoreFocusTo={restoreFocusTo} />;
  }
}

function ModalSession({ modal, root }) {
  const { t, plan, closeModal, findFilm } = useApp();
  const dialogRef = useRef(null);
  const closeRef = useRef(closeModal);
  const returnFocusOverride = useRef(null);
  closeRef.current = closeModal;

  // Keep the same modal session through Search → Details → Player etc., so
  // closing the sequence returns to the original page control.
  useLayoutEffect(() => {
    const previousFocus = document.activeElement;
    const shell = document.getElementById('app-shell');
    const wasInert = shell?.inert;
    const previousAriaHidden = shell?.getAttribute('aria-hidden');
    const hadBodyClass = document.body.classList.contains('modal-open');
    dialogRef.current?.focus({ preventScroll: true });
    if (shell) {
      shell.inert = true;
      shell.setAttribute('aria-hidden', 'true');
    }
    document.body.classList.add('modal-open');

    function handleKeyDown(event) {
      const dialog = dialogRef.current;
      if (!dialog) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const elements = focusableElements(dialog);
      const first = elements[0];
      const last = elements.at(-1);
      const focused = document.activeElement;
      if (!first) {
        event.preventDefault();
        dialog.focus();
      } else if (!dialog.contains(focused)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && (focused === first || focused === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && focused === last) {
        event.preventDefault();
        first.focus();
      }
    }

    function handleFocusIn(event) {
      const dialog = dialogRef.current;
      if (dialog && !dialog.contains(event.target)) {
        (focusableElements(dialog)[0] || dialog).focus({ preventScroll: true });
      }
    }

    function handleBackdrop(event) {
      if (event.target === root) closeRef.current();
    }

    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('focusin', handleFocusIn);
    root.addEventListener('click', handleBackdrop);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('focusin', handleFocusIn);
      root.removeEventListener('click', handleBackdrop);
      if (shell) {
        shell.inert = wasInert;
        if (previousAriaHidden === null) shell.removeAttribute('aria-hidden');
        else shell.setAttribute('aria-hidden', previousAriaHidden);
      }
      if (!hadBodyClass) document.body.classList.remove('modal-open');
      const override = returnFocusOverride.current && document.querySelector(returnFocusOverride.current);
      const previousStillAvailable = previousFocus && previousFocus !== document.body && previousFocus !== document.documentElement
        && previousFocus.isConnected && !previousFocus.closest('[inert]') && !previousFocus.disabled
        && previousFocus.getClientRects().length > 0;
      const main = document.getElementById('main');
      const fallback = main?.querySelector('.binder-cover.is-active, .card-open, .empty-state a, .empty-state button') || main;
      (override || (previousStillAvailable ? previousFocus : fallback))?.focus({ preventScroll: true });
    };
  }, [root]);

  useLayoutEffect(() => {
    const frame = requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      dialog.scrollTop = 0;
      (dialog.querySelector('[data-dialog-autofocus]') || focusableElements(dialog)[0] || dialog).focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [modal.type, modal.filmId, modal.planId, modal.kind]);

  const film = modal.filmId ? findFilm(modal.filmId) : null;
  const blockedPlayer = modal.type === 'player' && film?.demo && plan === 'mobile' && film?.tier === 'plus';
  const className = modal.type === 'detail' ? 'detail-modal'
    : modal.type === 'player' && !blockedPlayer ? 'player-modal'
      : modal.type === 'search' ? 'search-modal' : 'small-modal';

  return <div ref={dialogRef} className={`modal ${className}`} role="dialog" aria-modal="true" aria-labelledby="modal-title" tabIndex={-1}>
    <button type="button" className="modal-close" aria-label={t('close')} onClick={closeModal}><Icon name="x" /></button>
    <DialogContent modal={modal} restoreFocusTo={selector => { returnFocusOverride.current = selector; }} />
  </div>;
}

export default function ModalHost() {
  const { modal } = useApp();
  const root = document.getElementById('modal-root');
  if (!modal || !root) return null;
  return createPortal(<ModalSession modal={modal} root={root} />, root);
}
