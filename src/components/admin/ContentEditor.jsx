import { useEffect, useRef, useState } from 'react';
import Icon from '../Icon.jsx';
import { languages } from '../../data/catalogue.js';
import { adminAction, createVideoUpload, makeSlug, posterUrl, previewVideo, refreshPublicCatalogue, saveDraft, uploadPoster, POSTER_LIMIT, VIDEO_LIMIT } from '../../services/admin.js';
import { StatusBadge, formatDate } from './AdminStatus.jsx';

const genres = ['Drame', 'Chronique', 'Thriller', 'Récit', 'Comédie dramatique', 'Comédie', 'Aventure', 'Documentaire', 'Animation'];
function fieldsFrom(item) {
  return { title: item?.title || '', slug: item?.slug || '', synopsis: item?.synopsis || '', synopsis_en: item?.synopsis_en || '', content_type: item?.content_type || 'film', genre: item?.genre || 'Drame', language_code: item?.language_code || 'fr', tier: item?.tier || 'mobile', featured: Boolean(item?.featured), year: item?.year || new Date().getFullYear() };
}
const fileSize = bytes => bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(2)} Go` : `${(bytes / 1024 ** 2).toFixed(1)} Mo`;

export default function ContentEditor({ initialContent, preview, user, onClose, onSaved, onPublished, onLeaveStateChange }) {
  const [content, setContent] = useState(initialContent || null);
  const [values, setValues] = useState(() => fieldsFrom(initialContent));
  const [baseline, setBaseline] = useState(() => JSON.stringify(fieldsFrom(initialContent)));
  const [asset, setAsset] = useState(initialContent?.asset || null);
  const [poster, setPoster] = useState(null);
  const [posterPreview, setPosterPreview] = useState('');
  const [video, setVideo] = useState(null);
  const [durationLimit, setDurationLimit] = useState(7200);
  const [phase, setPhase] = useState('idle');
  const [progress, setProgress] = useState({ sent: 0, total: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const uploadRef = useRef(null);
  const alive = useRef(true);
  const formRef = useRef(null);
  const pollingRef = useRef(false);
  const slugEdited = useRef(Boolean(initialContent?.slug));
  const dirty = baseline !== JSON.stringify(values) || Boolean(poster);
  const published = content?.status === 'published';
  const transferActive = ['starting', 'uploading'].includes(phase);
  const locked = busy || transferActive;
  const canEdit = !preview && !published;
  const readyToPublish = !preview && content?.id && asset?.status === 'ready' && content.poster_path && !dirty && !published;
  const cover = posterPreview || posterUrl(content?.poster_path);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      uploadRef.current?.abort(false).catch(() => {});
    };
  }, []);
  useEffect(() => {
    if (!poster) { setPosterPreview(''); return undefined; }
    const objectUrl = URL.createObjectURL(poster);
    setPosterPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [poster]);
  useEffect(() => {
    onLeaveStateChange?.({ hasChanges: dirty || phase === 'paused', busy: locked });
    return () => onLeaveStateChange?.({ hasChanges: false, busy: false });
  }, [dirty, phase, locked, onLeaveStateChange]);
  useEffect(() => {
    if (!dirty && !transferActive && phase !== 'paused') return undefined;
    const preventAccidentalExit = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', preventAccidentalExit);
    return () => window.removeEventListener('beforeunload', preventAccidentalExit);
  }, [dirty, transferActive, phase]);

  async function synchronizeVideo({ silent = false } = {}) {
    if (!content?.id || preview) return null;
    if (!silent) { setBusy(true); setError(''); }
    try {
      const result = await adminAction('refresh-video', { contentId: content.id });
      if (!alive.current) return result.asset;
      setAsset(result.asset);
      if (result.asset?.status === 'ready') {
        setPhase('idle');
        if (!silent) setNotice('La vidéo est prête. Vérifiez la fiche avant de publier.');
      } else if (result.asset?.status === 'error') {
        setPhase('error'); setError('Le traitement de cette vidéo a échoué. Vérifiez le fichier puis chargez-le à nouveau.');
      } else if (!silent) setNotice('Le traitement est encore en cours. Le contenu reste non publié.');
      return result.asset;
    } catch (problem) {
      if (alive.current) { setError(problem.message); if (silent) setPhase('waiting'); }
      return null;
    } finally { if (alive.current && !silent) setBusy(false); }
  }

  useEffect(() => {
    if (!content?.id || phase !== 'verifying' || preview) return undefined;
    let attempts = 0;
    const interval = window.setInterval(async () => {
      if (pollingRef.current) return;
      if (++attempts > 20) { window.clearInterval(interval); if (alive.current) setPhase('waiting'); return; }
      pollingRef.current = true;
      await synchronizeVideo({ silent: true });
      pollingRef.current = false;
    }, 15000);
    return () => window.clearInterval(interval);
  }, [content?.id, phase, preview]);

  function changeField(name, value) {
    setValues(previous => ({ ...previous, [name]: value, ...(name === 'title' && !slugEdited.current ? { slug: value ? makeSlug(value) : '' } : {}) }));
    setNotice('');
  }

  async function persistDraft() {
    if (!canEdit || !user?.id) throw new Error('Votre session ne permet pas cette modification.');
    let next = await saveDraft(values, content?.id, user.id);
    // Keep the saved ID even when the subsequent poster upload fails, so retry
    // updates this draft instead of trying to create a second record.
    if (alive.current) {
      const savedFields = fieldsFrom(next);
      setContent(next); setValues(savedFields); setBaseline(JSON.stringify(savedFields));
      onSaved?.(next);
    }
    if (poster) {
      next = await uploadPoster(next.id, poster);
      if (alive.current) { setContent(next); setPoster(null); onSaved?.(next); }
    }
    return next;
  }

  async function handleSave(event) {
    event?.preventDefault();
    if (preview || published || locked || !formRef.current?.reportValidity()) return;
    setBusy(true); setError(''); setNotice('');
    try { await persistDraft(); if (alive.current) setNotice('Le brouillon est enregistré. Il n’est pas encore visible dans le catalogue.'); }
    catch (problem) { if (alive.current) setError(problem.message); }
    finally { if (alive.current) setBusy(false); }
  }

  function choosePoster(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > POSTER_LIMIT) {
      setError('Choisissez une affiche JPG, PNG ou WebP de 8 Mo maximum.'); event.target.value = ''; return;
    }
    setPoster(file); setError(''); setNotice('');
  }

  function chooseVideo(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.size || file.size > VIDEO_LIMIT) { setError('La vidéo doit peser entre 1 octet et 10 Go.'); event.target.value = ''; return; }
    setVideo(file); setError(''); setNotice(''); setProgress({ sent: 0, total: file.size });
  }

  async function startUpload() {
    if (!video || !canEdit || locked || asset?.status === 'ready' || !formRef.current?.reportValidity()) return;
    setPhase('starting'); setError(''); setNotice('');
    try {
      const saved = await persistDraft();
      const upload = await createVideoUpload(saved.id, video, durationLimit, {
        onProgress(sent, total) { if (alive.current) setProgress({ sent, total }); },
        onSuccess() {
          if (!alive.current) return;
          setPhase('verifying'); setNotice('L’envoi est terminé. La vidéo doit maintenant être vérifiée et traitée.');
          // Ready is only accepted from a server response, never from this callback.
          adminAction('refresh-video', { contentId: saved.id }).then(result => {
            if (!alive.current) return;
            setAsset(result.asset);
            if (result.asset?.status === 'ready') setPhase('idle');
            else if (result.asset?.status === 'error') { setPhase('error'); setError('Le traitement de cette vidéo a échoué. Vérifiez le fichier puis chargez-le à nouveau.'); }
          }).catch(problem => { if (alive.current) { setError(problem.message); setPhase('waiting'); } });
          onSaved?.(saved);
        },
        onError() { if (alive.current) { setPhase('paused'); setError('L’envoi a été interrompu. Vous pouvez tenter de le reprendre depuis cet écran.'); } },
      });
      if (!alive.current) return;
      uploadRef.current = upload; setPhase('uploading'); upload.start();
    } catch (problem) { if (alive.current) { setPhase('error'); setError(problem.message); } }
  }

  async function pauseUpload() {
    try { await uploadRef.current?.abort(false); if (alive.current) setPhase('paused'); }
    catch { if (alive.current) setError('Le transfert n’a pas pu être suspendu.'); }
  }
  function resumeUpload() {
    if (!uploadRef.current) return;
    setError(''); setPhase('uploading'); uploadRef.current.start();
  }
  async function stopUpload() {
    try {
      await uploadRef.current?.abort(false);
      uploadRef.current = null;
      if (alive.current) {
        setPhase('stopped'); setVideo(null); setProgress({ sent: 0, total: 0 }); setError('');
        setNotice('L’envoi est arrêté. Le transfert partiel reste privé et sa réservation n’est pas immédiatement libérée. Pour charger un autre fichier maintenant, créez un nouveau brouillon.');
      }
    } catch { if (alive.current) setError('L’envoi n’a pas pu être arrêté. Réessayez.'); }
  }

  async function publish() {
    if (!readyToPublish || locked) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const { content: next } = await adminAction('publish', { contentId: content.id });
      if (!alive.current) return;
      setContent(next); refreshPublicCatalogue(); onPublished?.(next);
      setNotice(`Le contenu est publié dans ${next.content_type === 'story' ? 'Histoires' : 'Films'}.`);
    } catch (problem) { if (alive.current) setError(problem.message); }
    finally { if (alive.current) setBusy(false); }
  }

  async function archive() {
    if (!content?.id || preview || locked) return;
    setBusy(true); setError('');
    try {
      const { content: next } = await adminAction('archive', { contentId: content.id });
      if (!alive.current) return;
      setContent(next); setConfirmArchive(false); refreshPublicCatalogue(); onSaved?.(next);
      setNotice('Le contenu est archivé et n’apparaît plus dans le catalogue utilisateur.');
    } catch (problem) { if (alive.current) setError(problem.message); }
    finally { if (alive.current) setBusy(false); }
  }

  async function openPreview() {
    if (!content?.id || preview || asset?.status !== 'ready') return;
    setBusy(true); setError('');
    try { const result = await previewVideo(content.id); if (alive.current) setPreviewUrl(result.iframeUrl); }
    catch (problem) { if (alive.current) setError(problem.message); }
    finally { if (alive.current) setBusy(false); }
  }

  const completion = Math.min(100, Math.round(progress.sent / Math.max(1, progress.total) * 100));
  const language = languages.find(item => item.code === values.language_code)?.label || values.language_code;
  const videoState = asset?.status === 'ready' ? 'ready' : transferActive ? 'uploading' : ['verifying', 'waiting'].includes(phase) ? 'processing' : asset?.status || 'pending';

  return <div className="admin-editor">
    <div className="admin-editor-toolbar"><button className="admin-text-button" disabled={locked} onClick={() => dirty || phase === 'paused' ? setConfirmClose(true) : onClose()}><Icon name="arrow-left" />Tous les contenus</button><StatusBadge status={content?.status || 'draft'} /></div>
    {confirmClose && <div className="admin-inline-confirm" role="alert"><div><strong>Quitter cette fiche ?</strong><p>Les changements non enregistrés seront perdus. Un transfert suspendu pourra nécessiter un nouvel envoi.</p></div><button className="admin-button secondary" onClick={() => setConfirmClose(false)}>Rester ici</button><button className="admin-button" onClick={onClose}>Quitter</button></div>}
    {preview && <div className="admin-form-preview"><Icon name="info" /><p>Vous explorez le formulaire. Connectez le backend pour enregistrer une fiche et envoyer des fichiers.</p></div>}
    {published && <div className="admin-form-preview"><Icon name="check" /><p>Ce contenu est publié. Pour modifier sa fiche, archivez-le d’abord, puis publiez la version mise à jour.</p></div>}
    {error && <div className="admin-inline-message error" role="alert"><Icon name="info" /><span>{error}</span></div>}
    {notice && <div className="admin-inline-message success" role="status"><Icon name="check" /><span>{notice}</span></div>}
    <div className="admin-editor-grid">
      <div className="admin-editor-fields">
        <form className="admin-panel" onSubmit={handleSave} ref={formRef}>
          <div className="admin-panel-heading"><div><p className="admin-eyebrow">01 · LA FICHE</p><h2>{content ? 'Présenter votre contenu' : 'Une nouvelle histoire'}</h2></div><Icon name="film" /></div>
          <fieldset className="admin-fieldset" disabled={published || locked}>
            <label className="admin-field" htmlFor="admin-content-title">Titre<input id="admin-content-title" name="title" aria-label="Titre" required maxLength={180} value={values.title} placeholder="Le titre de votre film" onChange={event => changeField('title', event.target.value)} /></label>
            <div className="admin-form-row"><label className="admin-field" htmlFor="admin-content-type">Rubrique<select id="admin-content-type" name="content_type" aria-label="Rubrique" value={values.content_type} onChange={event => changeField('content_type', event.target.value)}><option value="film">Films</option><option value="story">Histoires</option></select></label><label className="admin-field" htmlFor="admin-content-genre">Genre<select id="admin-content-genre" name="genre" aria-label="Genre" value={values.genre} onChange={event => changeField('genre', event.target.value)}>{genres.map(genre => <option key={genre}>{genre}</option>)}</select></label></div>
            <label className="admin-field" htmlFor="admin-content-synopsis">Synopsis en français<textarea id="admin-content-synopsis" name="synopsis" aria-label="Synopsis en français" required rows={4} maxLength={4000} value={values.synopsis} placeholder="L’histoire, en quelques phrases…" onChange={event => changeField('synopsis', event.target.value)} /></label>
            <label className="admin-field" htmlFor="admin-content-synopsis-en">Synopsis en anglais <span className="admin-optional" id="admin-synopsis-en-help">Facultatif</span><textarea id="admin-content-synopsis-en" name="synopsis_en" aria-label="Synopsis en anglais" aria-describedby="admin-synopsis-en-help" rows={3} maxLength={4000} value={values.synopsis_en} placeholder="The story, in a few words…" onChange={event => changeField('synopsis_en', event.target.value)} /></label>
            <div className="admin-form-row"><label className="admin-field" htmlFor="admin-content-language">Langue principale<select id="admin-content-language" name="language_code" aria-label="Langue principale" aria-describedby="admin-language-help" value={values.language_code} onChange={event => changeField('language_code', event.target.value)}>{languages.filter(item => item.code !== 'all' && item.code !== 'und-bamileke').map(item => <option key={item.code} value={item.code}>{item.label}</option>)}<option value="und-bamileke" disabled>Bamiléké — langue à préciser</option></select><small id="admin-language-help">7e langue prévue : une langue bamiléké précise reste à confirmer avant activation.</small></label><label className="admin-field" htmlFor="admin-content-year">Année<input id="admin-content-year" name="year" aria-label="Année" type="number" min="1900" max="2100" required value={values.year} onChange={event => changeField('year', event.target.value)} /></label></div>
            <div className="admin-form-row"><label className="admin-field" htmlFor="admin-content-tier">Accès à ce contenu<select id="admin-content-tier" name="tier" aria-label="Accès à ce contenu" value={values.tier} onChange={event => changeField('tier', event.target.value)}><option value="mobile">Mobile et Plus</option><option value="plus">Plus uniquement</option></select></label><label className="admin-field" htmlFor="admin-content-slug">Identifiant du contenu<input id="admin-content-slug" name="slug" aria-label="Identifiant du contenu" aria-describedby="admin-slug-help" required minLength={3} maxLength={80} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={values.slug} onChange={event => { slugEdited.current = true; changeField('slug', event.target.value); }} placeholder="mon-nouveau-film" /><small id="admin-slug-help">3 caractères minimum : minuscules, chiffres et tirets.</small></label></div>
            <label className="admin-check" htmlFor="admin-content-featured"><input id="admin-content-featured" name="featured" aria-label="Mettre à la une" aria-describedby="admin-featured-help" type="checkbox" checked={values.featured} onChange={event => changeField('featured', event.target.checked)} /><span><strong>Mettre à la une</strong><small id="admin-featured-help">Proposer ce contenu dans la sélection d’accueil après publication.</small></span></label>
          </fieldset>
          <div className="admin-form-actions"><span>{content ? `Dernière mise à jour : ${formatDate(content.updated_at)}` : 'Le brouillon sera créé à l’enregistrement.'}</span><button type="submit" className="admin-button secondary" disabled={!canEdit || locked}><Icon name="check" />{busy ? 'Enregistrement…' : 'Enregistrer le brouillon'}</button></div>
        </form>
        <section className="admin-panel"><div className="admin-panel-heading"><div><p className="admin-eyebrow">02 · LES MÉDIAS</p><h2>De l’affiche à la vidéo</h2></div><StatusBadge status={videoState} /></div>
          <div className="admin-media-fields">
            <label className={`admin-file-drop ${preview || published || locked ? 'disabled' : ''}`} htmlFor="admin-content-poster"><Icon name="film" /><strong>{poster ? poster.name : content?.poster_path ? 'Changer l’affiche' : 'Choisir une affiche'}</strong><span>JPG, PNG ou WebP · 8 Mo maximum</span><input id="admin-content-poster" name="poster" type="file" accept="image/jpeg,image/png,image/webp" disabled={preview || published || locked} onChange={choosePoster} aria-label="Choisir l’affiche du contenu" /></label>
            <p className="admin-media-help admin-poster-help">L’affiche est accessible avec son lien dès l’envoi, même si le contenu reste en brouillon.</p>
            <div className="admin-video-upload">
              <div className="admin-video-label"><Icon name="play" /><div><strong>Fichier vidéo</strong><span>{asset?.status === 'ready' ? 'La vidéo traitée est prête.' : video ? `${video.name} · ${fileSize(video.size)}` : 'MP4, MOV ou WebM · 10 Go maximum'}</span></div></div>
              {asset?.status !== 'ready' && <><label className="admin-field admin-video-file-label" htmlFor="admin-content-video">Choisir le fichier<input id="admin-content-video" name="video" aria-label="Choisir le fichier vidéo" type="file" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm" onChange={chooseVideo} disabled={preview || published || locked || phase === 'paused' || phase === 'verifying'} /></label><label className="admin-field" htmlFor="admin-video-duration">Durée maximale de la vidéo<select id="admin-video-duration" name="maxDurationSeconds" aria-label="Durée maximale de la vidéo" aria-describedby="admin-duration-help" value={durationLimit} onChange={event => setDurationLimit(Number(event.target.value))} disabled={preview || published || locked || phase === 'paused'}><option value={1800}>30 minutes</option><option value={3600}>1 heure</option><option value={7200}>2 heures</option><option value={10800}>3 heures</option><option value={14400}>4 heures</option></select><small id="admin-duration-help">Choisissez une durée supérieure à celle du fichier. Ce réglage concerne le chargement, pas l’abonnement.</small></label></>}
              {progress.total > 0 && phase !== 'idle' && <div className="admin-upload-progress"><div><span>{phase === 'paused' ? 'Envoi suspendu' : phase === 'verifying' || phase === 'waiting' ? 'Envoi terminé' : 'Envoi de la vidéo'}</span><strong>{completion} %</strong></div><progress max="100" value={completion} aria-label="Progression du chargement vidéo" /><small>{fileSize(progress.sent)} / {fileSize(progress.total)}</small></div>}
              <div className="admin-upload-actions">{phase === 'uploading' ? <button className="admin-button secondary" onClick={pauseUpload}>Suspendre l’envoi</button> : phase === 'paused' ? <><button className="admin-button" onClick={resumeUpload}>Reprendre l’envoi</button><button className="admin-button secondary" onClick={stopUpload}>Arrêter l’envoi</button></> : asset?.status !== 'ready' && <button className="admin-button" disabled={!video || !canEdit || locked || ['verifying', 'waiting', 'stopped'].includes(phase)} onClick={startUpload}><Icon name="arrow-up-right" />{phase === 'starting' ? 'Préparation…' : 'Envoyer la vidéo'}</button>}
                {content?.id && <button className="admin-button secondary" disabled={preview || locked} onClick={() => synchronizeVideo()}>Vérifier le traitement</button>}
                {asset?.status === 'ready' && <button className="admin-button secondary" disabled={preview || locked} onClick={openPreview}><Icon name="play" />Prévisualiser</button>}
              </div>
              <p className="admin-media-help">{asset?.status === 'ready' ? 'Pour remplacer une vidéo déjà prête, créez un nouveau brouillon.' : 'Le transfert peut être suspendu puis repris tant que cet écran reste ouvert. La publication reste une action séparée.'}</p>
            </div>
          </div>
          {previewUrl && <div className="admin-video-preview"><div><strong>Aperçu privé</strong><button className="admin-icon-button" aria-label="Fermer l’aperçu vidéo" onClick={() => setPreviewUrl('')}><Icon name="x" /></button></div><iframe title="Aperçu privé du contenu" src={previewUrl} allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="no-referrer" /></div>}
        </section>
      </div>
      <aside className="admin-editor-preview"><div className="admin-panel"><p className="admin-eyebrow">CÔTÉ SPECTATEUR</p><div className="admin-poster-preview">{cover ? <img src={cover} alt="Aperçu de l’affiche" /> : <div className="admin-poster-placeholder"><span>epizo.</span><Icon name="film" /><small>Votre affiche</small></div>}<span className="admin-poster-gradient" /><div><span>{values.tier === 'plus' ? 'PLUS' : 'EPIZO ORIGINAL'}</span><h3>{values.title || 'Le titre de votre histoire'}</h3></div></div><p className="admin-preview-meta">{values.genre} · {language} · {values.year}</p><p className="admin-preview-synopsis">{values.synopsis || 'Le synopsis apparaîtra dans la fiche présentée aux spectateurs.'}</p><div className="admin-destination"><Icon name={values.content_type === 'story' ? 'stories' : 'library'} /><div><small>Rubrique de destination</small><strong>{values.content_type === 'story' ? 'Histoires' : 'Bibliothèque · Films'}</strong>{values.featured && <span>Également proposé à la une</span>}</div></div><div className="admin-publish-checklist"><span className={content?.id ? 'complete' : ''}><Icon name={content?.id ? 'check' : 'info'} />Fiche enregistrée</span><span className={content?.poster_path ? 'complete' : ''}><Icon name={content?.poster_path ? 'check' : 'info'} />Affiche associée</span><span className={asset?.status === 'ready' ? 'complete' : ''}><Icon name={asset?.status === 'ready' ? 'check' : 'info'} />Vidéo prête à lire</span></div>{published ? <button className="admin-button secondary admin-full" disabled={locked} onClick={() => setConfirmArchive(true)}>Archiver ce contenu</button> : <button className="admin-button admin-full" disabled={!readyToPublish || locked} onClick={publish}><Icon name="arrow-up-right" />Publier sur Epizo</button>}<p className="admin-publish-note">{dirty && !preview ? 'Enregistrez vos modifications avant de publier.' : 'Seuls les contenus publiés apparaissent dans les rubriques utilisateur.'}</p>{confirmArchive && <div className="admin-archive-confirm" role="alert"><p>Retirer ce contenu du catalogue utilisateur ? Il restera disponible dans vos archives.</p><button className="admin-button secondary" onClick={() => setConfirmArchive(false)}>Annuler</button><button className="admin-button" disabled={locked} onClick={archive}>Confirmer l’archivage</button></div>}</div></aside>
    </div>
  </div>;
}
