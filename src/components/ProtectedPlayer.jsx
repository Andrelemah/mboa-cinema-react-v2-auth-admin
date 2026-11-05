import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useApp } from '../context/AppContext.jsx';
import { invokeFunction } from '../services/functions.js';
import { safePlayerUrl } from '../utils/publishedContent.js';
import Icon from './Icon.jsx';

export default function ProtectedPlayer({ film }) {
  const { user, loading } = useAuth();
  const { lang, navigate, openModal } = useApp();
  const [result, setResult] = useState({ key: null, busy: true, url: null, error: null });
  const [attempt, setAttempt] = useState(0);
  const text = (fr, en) => lang === 'en' ? en : fr;
  const requestKey = user ? `${user.id}:${film.id}` : null;

  useEffect(() => {
    let cancelled = false;
    if (!user) return undefined;
    const key = `${user.id}:${film.id}`;
    setResult({ key, busy: true, url: null, error: null });
    invokeFunction('playback-token', { contentId: film.id }).then(({ data, error }) => {
      if (cancelled) return;
      const url = safePlayerUrl(data?.iframeUrl);
      setResult({ key, busy: false, url, error: error || (!url ? { code: 'invalid_player' } : null) });
    });
    return () => { cancelled = true; };
  }, [user?.id, film.id, attempt]);

  if (!loading && !user) return <div className="protected-player-state"><Icon name="lock" /><h2 id="modal-title">{text('Connectez-vous pour regarder.', 'Sign in to watch.')}</h2><p>{text('Votre compte permet de vérifier l’accès à ce film.', 'Your account lets us verify access to this film.')}</p><button className="button" onClick={() => navigate('connexion')}>{text('Se connecter', 'Sign in')}</button></div>;
  if (!user || result.key !== requestKey || result.busy) return <div className="protected-player-state" role="status"><h2 id="modal-title">{film.title}</h2><p>{text('Préparation de la lecture…', 'Preparing playback…')}</p></div>;
  if (result.error) return <div className="protected-player-state" role="alert"><Icon name="lock" /><h2 id="modal-title">{text('Lecture indisponible', 'Playback unavailable')}</h2><p>{text('Votre offre ne permet pas encore cette lecture, ou la vidéo est momentanément indisponible.', 'Your plan does not currently include this video, or the video is temporarily unavailable.')}</p><div className="action-row"><button className="button" onClick={() => setAttempt(value => value + 1)}>{text('Réessayer', 'Try again')}</button><button className="button ghost" onClick={() => navigate('abonnements')}>{text('Voir les offres', 'View plans')}</button></div><button className="text-link" onClick={() => openModal('detail', { filmId: film.id })}>{text('Retour à la fiche', 'Back to details')}</button></div>;
  return <><h2 id="modal-title" className="sr-only">{film.title}</h2><iframe className="stream-player" title={film.title} src={result.url} allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin" /><div className="player-bar"><strong>{film.title}</strong><button className="text-link" onClick={() => openModal('detail', { filmId: film.id })}>{text('Voir la fiche', 'View details')}</button></div></>;
}
