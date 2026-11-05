# Epizo — React, authentification et administration

Version 2.0. Projet React + Vite à poursuivre dans VS Code. Il comprend l’interface cinéma, le classeur d’affiches, les écrans d’authentification, le back-office éditorial et le code du backend Supabase / Cloudflare Stream.

**Les intégrations sont écrites, mais aucun service externe n’a été créé ou activé par cette livraison.** Sans configuration, le catalogue de présentation reste consultable et l’administration s’affiche en aperçu vide. Les connexions et les transferts restent désactivés. Après configuration, le catalogue réel provient de la base commune et aucune donnée fictive ne remplace silencieusement une erreur serveur.

## Démarrer dans VS Code

Installer Node.js 22.12 ou ultérieur, extraire l’archive puis ouvrir le dossier contenant `package.json` :

```sh
npm install
npm run dev
```

Ouvrir `http://127.0.0.1:5173/`.

| Adresse locale | Écran |
| --- | --- |
| `http://127.0.0.1:5173/#accueil` | Accueil et classeur |
| `http://127.0.0.1:5173/#connexion` | Connexion, inscription et récupération |
| `http://127.0.0.1:5173/#compte` | Profil du membre et abonnement réel |
| `http://127.0.0.1:5173/#admin` | Epizo Studio, administration |

L’aperçu de l’administration ne donne aucun droit réel. Avec le backend configuré, seuls les rôles éditeur/administrateur validés côté serveur et une session avec second facteur peuvent utiliser le back-office.

## Ce qui est implémenté

### Comptes

- Connexion Google et Apple avec flux OAuth PKCE.
- Inscription et connexion par e-mail/mot de passe, confirmation d’adresse et récupération de mot de passe.
- Inscription et connexion par numéro de téléphone avec code SMS Supabase OTP, après activation d’un fournisseur SMS.
- Session gérée par Supabase, déconnexion et modification du nom affiché.
- Rôles `member`, `editor`, `admin`, stockés dans la base et jamais déduits d’un rôle envoyé lors de l’inscription.
- Activation et vérification TOTP pour les éditeurs et administrateurs, avec contrôle AAL2 côté serveur et base de données.

### Catalogue éditorial

1. Créer un brouillon et renseigner le titre, les synopsis FR/EN, la rubrique Film/Histoire, le genre, la langue, l’offre et la mise en avant.
2. Charger une affiche JPG/PNG/WebP, jusqu’à 8 Mio.
3. Transférer la vidéo vers Cloudflare Stream par TUS : progression, pause et reprise dans l’éditeur ouvert. Limite par défaut : 10 Gio, durée maximale déclarée jusqu’à 4 h.
4. Attendre le traitement vidéo, confirmé par le fournisseur au serveur.
5. Publier explicitement. Le serveur exige les informations obligatoires, une affiche existante et une vidéo prête.
6. Le titre apparaît dans sa rubrique côté spectateur. Les contenus mis en avant peuvent apparaître à l’accueil. Archiver retire le titre du catalogue public.

Le catalogue se rafraîchit après une publication dans le même onglet, au retour sur la page et toutes les 60 secondes tant qu’elle est visible. Un abonnement Realtime est aussi prévu si la table est activée dans la publication Supabase ; le rafraîchissement périodique reste le mécanisme de secours.

### Suivi et sécurité

- Nombre d’utilisateurs, contenus publiés/brouillons, traitements en cours et activité agrégée.
- Liste paginée des utilisateurs, dernière connexion et présence cumulée sur 30 jours.
- Événements d’administration et de traitement vidéo ; signaux tels que des accès refusés répétés, à examiner par l’équipe.
- Présence limitée aux sessions connectées lorsque la page est visible, avec plafonnement serveur et protection contre le double comptage entre onglets.

Cette présence n’est pas une mesure exacte du visionnage. Les journaux d’échecs Google/Apple/Supabase Auth, les alertes réseau et la détection de compromission nécessitent une intégration d’exploitation complémentaire ; le tableau ne promet pas de détecter toute intrusion.

### Lecture

Un membre demande une autorisation de lecture au backend. Celui-ci vérifie le contenu publié, la vidéo prête, l’abonnement actif et l’offre Mobile/Plus, puis émet une URL Cloudflare signée. L’offre simulée du navigateur n’a aucune autorité sur ce contrôle. Le lecteur staff peut prévisualiser une vidéo prête avec le rôle et le second facteur requis.

## Activer les services

Lire les deux guides, dans cet ordre :

1. [docs/BACKEND_SETUP.md](docs/BACKEND_SETUP.md) — base, migrations, rôles, Cloudflare, fonctions serveur, secrets, premier administrateur et rétention.
2. [docs/AUTH_SETUP.md](docs/AUTH_SETUP.md) — configuration e-mail/SMTP, téléphone/SMS, Google, Apple, callbacks et MFA.

Copier `.env.example` vers `.env.local`, puis renseigner uniquement les valeurs publiques :

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
VITE_AUTH_GOOGLE_ENABLED=false
VITE_AUTH_APPLE_ENABLED=false
```

Remplacer les deux valeurs d’exemple. Passer chaque fournisseur à `true` seulement après sa configuration dans Supabase. Redémarrer Vite après tout changement d’environnement. Les clés Cloudflare, le secret Apple, le secret du webhook et la clé Supabase `service_role` restent côté serveur : jamais dans une variable `VITE_`.

La promotion du premier administrateur est une opération opérateur explicitement documentée, après création et vérification de son compte. Le navigateur ne contient aucune fonction pour se promouvoir lui-même.

## Organisation du dossier

| Chemin | Rôle |
| --- | --- |
| `src/pages/AuthPage.jsx` | Connexion, inscription, récupération |
| `src/context/AuthContext.jsx` | Sessions et identité vérifiée |
| `src/components/auth/AdminMfaGate.jsx` | Second facteur administratif |
| `src/pages/AdminPage.jsx` | Back-office Epizo Studio |
| `src/components/admin/` | Tableau de bord, utilisateurs, sécurité, éditeur |
| `src/services/admin.js` | Appels d’administration et transfert TUS |
| `src/context/CatalogContext.jsx` | Catalogue publié partagé avec le backend |
| `src/components/ProtectedPlayer.jsx` | Lecteur protégé par autorisation serveur |
| `src/components/ActivityReporter.jsx` | Présence connectée et visible |
| `src/pages/` et `src/components/FilmBinder.jsx` | Expérience cinéma et navigation |
| `src/data/catalogue.js` | Données fictives pour l’aperçu non configuré |
| `src/styles/` | Design cinéma, classeur, connexion et administration |
| `supabase/migrations/` | Tables, droits, politiques RLS et fonctions SQL |
| `supabase/functions/` | API admin, lecture, activité et webhook vidéo |
| `docs/BACKEND_CONTRACT.md` | Contrat API partagé |
| `tests/` | Tests du catalogue, du lecteur et des protections serveur |
| `public/assets/` | Visuels inclus et provenance |

Modifier le code dans `src/`, `public/` et `supabase/`. Le dossier `dist/` est généré par Vite et sera remplacé à la prochaine compilation.

## Commandes

| Commande | Utilité |
| --- | --- |
| `npm install` | Installer les dépendances |
| `npm run dev` | Développer avec actualisation automatique |
| `npm test` | Exécuter les tests Node, dont l’isolation SQL sous PGlite |
| `npm run build` | Compiler le frontend dans `dist/` |
| `npm run preview` | Servir la compilation à `http://127.0.0.1:4173` |
| `npm run check` | Tests puis compilation |

Garder `package-lock.json` en versionnement. Utiliser `npm ci` sur un checkout propre pour installer exactement ce fichier. Arrêter un serveur par Ctrl+C.

## Limites de cette livraison

- Aucun compte Supabase/Google/Apple/Cloudflare ni serveur SMTP/SMS n’a été créé ou configuré ici. L’envoi des e-mails/SMS, les callbacks OAuth, l’enrôlement TOTP réel et un transfert/traitement vidéo réel doivent être validés dans votre environnement.
- Paiements MTN/Orange Money et renouvellements non connectés. Les offres restent indicatives. La simulation de choix d’offre est désactivée lorsque le backend réel est configuré.
- Les limites de lectures simultanées, l’autorisation par catégorie d’appareil et le DRM ne sont pas encore implémentés. Une URL signée ne constitue pas à elle seule une protection DRM. Une URL déjà émise reste utilisable jusqu’à son expiration.
- Favoris et préférences de langue encore stockés localement, sans synchronisation entre appareils. Les profils familiaux de l’ancienne démo ne sont pas des identités d’authentification.
- Applications natives Android, macOS et Smart TV non livrées ; il s’agit d’une application web responsive.
- Les cinq langues camerounaises restent une sélection provisoire ; le choix précis de la langue bamiléké et les traductions/pistes réelles restent à valider.
- Avant ouverture commerciale : finaliser la politique de confidentialité et la suppression de compte, configurer la rétention, le monitoring, les sauvegardes et les tests des intégrations réelles.

Ce dossier est une copie autonome. Les changements locaux ne modifient pas automatiquement l’ancien site hébergé. Déployer `dist/` et les fonctions Supabase par leurs workflows respectifs après configuration.

## Documentation de référence

[Supabase Auth](https://supabase.com/docs/guides/auth) · [MFA](https://supabase.com/docs/guides/auth/auth-mfa) · [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) · [Cloudflare Stream](https://developers.cloudflare.com/stream/) · [React](https://react.dev/learn/) · [Vite](https://vite.dev/guide/)
