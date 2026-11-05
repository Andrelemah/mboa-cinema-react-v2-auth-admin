# Activer le backend Epizo

Le dossier contient une application React, une migration PostgreSQL et quatre fonctions serveur. Les comptes de service, les secrets OAuth, les vidéos et les abonnements réels ne sont pas créés par le code livré. Sans configuration, l'application doit afficher un état non connecté ; aucune donnée de démonstration ne représente un véritable utilisateur ou une intrusion détectée.

## 1. Architecture et périmètre

**Supabase** gère Auth, les profils, les rôles, le catalogue, les abonnements et les journaux. **Cloudflare Stream** reçoit les vidéos directement depuis le navigateur par TUS, les prépare et fournit le lecteur signé. Le fichier vidéo ne transite pas par le serveur React ou par une fonction Supabase.

Le même catalogue alimente le back-office et l'espace public : une fiche reste en brouillon jusqu'à ce que la vidéo soit prête, l'affiche présente et les métadonnées renseignées. L'action « Publier » rend la fiche visible aux utilisateurs. Une nouvelle lecture demande au serveur une autorisation liée à l'abonnement. Une liste locale de favoris ou un forfait simulé dans le navigateur ne confère aucun droit de lecture.

Cette livraison comprend : connexion par e-mail/mot de passe, OTP SMS par téléphone (après configuration d’un fournisseur dans Supabase Auth), confirmation d'adresse, récupération de mot de passe, branchements OAuth Google et Apple, MFA TOTP pour le personnel, création et édition de fiches, transfert TUS, préparation vidéo, publication/archivage, consultation des utilisateurs, activité estimée et signaux opérationnels. Elle **ne comprend pas encore** l'encaissement, un webhook de paiement, les applications natives/Smart TV, la limitation effective du nombre de lectures simultanées, la preuve qu'un appareil est un téléphone, le DRM ni une intégration complète SIEM/WAF.

Les montants de 3 000 et 5 000 FCFA restent une hypothèse commerciale. Ne pas commercialiser la promesse « téléphone uniquement » ou « quatre lectures simultanées » avant les contrôles serveur correspondants. La table `subscriptions` est prête pour un futur webhook de paiement vérifié ; seul un service privilégié peut y écrire. Il n'existe pas d'activation d'abonnement depuis le navigateur.

## 2. Préparer Supabase

Créer un projet Supabase réservé à Epizo, conserver son URL et sa clé **publishable** destinée au navigateur, puis installer le CLI Supabase officiel dans l'environnement de développement. Utiliser un projet de préproduction pour la première mise en service. Depuis le dossier du projet React :

```sh
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

La migration `supabase/migrations/202611020001_mboa_backend.sql` crée les tables, index, droits, politiques RLS, RPC et le bucket `posters`. La lancer sur un projet vide ou examiner les conflits de noms dans un projet existant. Elle refuse de convertir silencieusement un bucket `posters` existant avec d'autres paramètres. Ne pas ajouter de politiques Storage permissives à côté de celles fournies : les politiques permissives s'additionnent.

La migration crée sept codes de langue de départ : `fr`, `en`, `bas`, `dua`, `fub`, `ewo`, `und-bamileke`. Le dernier est un marqueur de produit non normalisé à préciser avec les créateurs : « bamiléké » regroupe plusieurs langues, il faut sélectionner la langue réelle et son code avant de figer le catalogue. Le choix exact des cinq langues camerounaises reste à valider ; une simple étiquette n'est pas une traduction de l'interface ni un sous-titre.

### Auth e-mail et redirections

Dans Auth / URL Configuration, définir l'URL du site de production et autoriser les callbacks exacts de cette application. Pour une installation à la racine de `https://votre-domaine.cm` :

```text
https://votre-domaine.cm/#connexion
https://votre-domaine.cm/?auth_action=recovery#connexion
```

En développement, ajouter les mêmes formes avec `http://127.0.0.1:5173` et/ou `http://localhost:5173`. En cas de déploiement dans un sous-dossier, inclure aussi ce chemin. Éviter les jokers en production. Le fichier `config.toml` fournit les redirections locales ; les paramètres du projet hébergé se règlent dans son tableau de bord et ne sont pas tous appliqués par `db push`.

Activer la confirmation e-mail et une longueur minimale de 12 caractères, puis configurer un SMTP de production et vérifier l'envoi réel des confirmations/récupérations. Contrôler les quotas, les limites Auth, les modèles d'e-mail et la configuration du domaine d'envoi. En cas de personnalisation d'un modèle, conserver le lien de confirmation Auth attendu. Le flux PKCE doit être testé en ouvrant le lien dans le même navigateur qui a commencé la connexion ; un autre navigateur n'a pas le vérificateur local.

### Google

Créer un client OAuth Web dans Google Cloud et configurer l'écran de consentement avec les domaines appropriés. Ajouter le callback Supabase affiché dans le fournisseur Google — généralement `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback` — dans les URI de redirection Google. Enregistrer le Client ID et le Client Secret dans **Supabase Auth / Providers / Google**. Mettre `VITE_AUTH_GOOGLE_ENABLED=true` seulement après un test de connexion réussi. Le bouton Google accepte un compte Google ; « Gmail » n'est pas un protocole d'authentification distinct.

### Apple

Configurer Sign in with Apple dans Apple Developer : identifiants requis, Services ID pour le Web, domaine et Return URL fournie par Supabase. Générer le secret client selon les instructions Apple/Supabase et l'enregistrer côté fournisseur Supabase avec les identifiants demandés. Ne jamais placer la clé `.p8` ou ce secret dans React. Le secret OAuth Apple nécessite un renouvellement régulier ; la documentation Supabase indique au moins tous les six mois pour ce flux. Planifier cette rotation dans l'exploitation. Passer `VITE_AUTH_APPLE_ENABLED=true` après validation du retour de connexion et de l'adresse privée Apple. L'application Web n'est pas, à elle seule, une application iOS native.

Références officielles : [Google dans Supabase](https://supabase.com/docs/guides/auth/social-sign-in/auth-google), [Apple dans Supabase](https://supabase.com/docs/guides/auth/social-sign-in/auth-apple), [redirections Auth](https://supabase.com/docs/guides/auth/redirect-urls), [authentification par mot de passe](https://supabase.com/docs/guides/auth/passwords).

## 3. Activer le premier administrateur

Créer le compte du propriétaire avec le formulaire normal et confirmer son adresse. Vérifier son UUID dans Supabase Auth. Dans l'éditeur SQL du projet, ouvrir `supabase/bootstrap-admin.sql`, remplacer uniquement le marqueur par cet UUID vérifié, puis exécuter le script en tant que propriétaire du projet. L'opération est manuelle et journalisée ; le formulaire d'inscription ne peut pas accorder un rôle privilégié.

Activer TOTP MFA dans Supabase Auth. Le propriétaire se connecte, ouvre `#admin` (également accessible depuis « Mon compte »), enregistre son application d'authentification, puis valide le code. Le serveur exige un JWT vérifié de niveau `aal2` en plus du rôle `admin` ou `editor`. Le simple affichage d'un écran d'administration ne donne aucun accès aux données.

Les rédacteurs peuvent être nommés de la même manière, par un opérateur autorisé dans SQL, en attribuant le rôle `editor` à un UUID confirmé. Ils gèrent les contenus mais n'accèdent pas à la liste complète des utilisateurs ni au journal de sécurité. Prévoir une procédure interne de récupération MFA pour le propriétaire ; aucun bouton public ne contourne ce contrôle.

Référence : [MFA TOTP de Supabase](https://supabase.com/docs/guides/auth/auth-mfa/totp).

## 4. Configurer Cloudflare Stream et les secrets serveur

Activer Stream sur le compte Cloudflare choisi. Créer un jeton API limité au compte et aux droits Stream nécessaires aux transferts, à la lecture d'état et à la signature. Copier l'Account ID et le code client figurant dans une URL de lecteur `customer-<CODE>.cloudflarestream.com`. Le code client n'est pas l'Account ID.

Copier `supabase/.env.example` vers `supabase/.env.local`, compléter les valeurs et protéger ce fichier. Ne pas le publier, l'inclure dans une archive destinée à des tiers ou le committer.

| Variable serveur | Valeur |
| --- | --- |
| `APP_ORIGIN` | Origines exactes autorisées, séparées par des virgules, par exemple `https://votre-domaine.cm`. Sans chemin ni slash final. |
| `CLOUDFLARE_ACCOUNT_ID` | Identifiant du compte Cloudflare, 32 caractères hexadécimaux. |
| `CLOUDFLARE_STREAM_API_TOKEN` | Jeton API Stream privé. |
| `STREAM_CUSTOMER_CODE` | Code de l'hôte du lecteur, sans `customer-` et sans domaine. |
| `STREAM_WEBHOOK_SECRET` | Secret généré par Cloudflare pour l'abonnement webhook Stream. |
| `MAX_VIDEO_BYTES` | Plafond facultatif : `10737418240` par défaut, soit 10 GiB. |

Les variables `SUPABASE_URL`, `SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_ROLE_KEY` sont injectées dans les fonctions hébergées. La clé privilégiée n'est jamais transmise au navigateur. Aucun secret serveur ne doit commencer par `VITE_`.

Après avoir rempli les valeurs serveur :

```sh
supabase secrets set --env-file supabase/.env.local
supabase functions deploy admin-api
supabase functions deploy activity-heartbeat
supabase functions deploy playback-token
supabase functions deploy stream-webhook
```

Les trois premières fonctions conservent `verify_jwt=true`. Seul le webhook a `verify_jwt=false`, car il vérifie lui-même une signature HMAC Cloudflare sur les octets du corps brut et un horodatage de moins de cinq minutes. Ne pas désactiver le contrôle JWT des API utilisateur pour contourner un problème de configuration.

Dans Cloudflare Stream, créer ou configurer l'abonnement webhook vers :

```text
https://YOUR_PROJECT_REF.supabase.co/functions/v1/stream-webhook
```

Récupérer le secret généré, le placer dans `STREAM_WEBHOOK_SECRET` puis mettre à jour les secrets Supabase si nécessaire. Stream dispose d'un webhook par compte : examiner celui qui existe déjà avant de le remplacer, ou prévoir un relais signé si le compte héberge plusieurs applications. Aucun webhook ni jeton n'a été créé automatiquement par ce projet.

Références : [transferts directs](https://developers.cloudflare.com/stream/uploading-videos/direct-creator-uploads/), [TUS et identifiant vidéo](https://developers.cloudflare.com/stream/uploading-videos/resumable-uploads/), [webhooks et signature](https://developers.cloudflare.com/stream/manage-video-library/using-webhooks/), [lecture signée](https://developers.cloudflare.com/stream/viewing-videos/securing-your-stream/), [sécurité des fonctions Supabase](https://supabase.com/docs/guides/functions/auth).

## 5. Brancher React

Renseigner les variables publiques de développement dans `.env.local`, ou les variables de build de l'hébergeur :

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_PUBLISHABLE_KEY
VITE_AUTH_GOOGLE_ENABLED=false
VITE_AUTH_APPLE_ENABLED=false
```

La clé **publishable**, ou l'ancienne clé **anon**, peut être utilisée ici. La clé `service_role`, une clé `sb_secret_`, un secret OAuth ou un jeton Stream ne peut pas l'être. Les variables Vite sont intégrées au bundle lors du build : redémarrer le serveur de développement ou reconstruire le site après modification. Activer chaque fournisseur OAuth seulement une fois sa configuration validée.

```sh
npm install
npm run dev
```

Le navigateur utilisera Supabase pour la session, les fiches et les API. Le routage par hash reste compatible avec un hébergement statique ; ce dernier n'exécute pas les fonctions Edge. Si une Content Security Policy est définie sur l'hébergeur, autoriser explicitement le projet Supabase pour les connexions/images, les transferts Stream pour `connect-src`, le lecteur `https://customer-<CODE>.cloudflarestream.com` pour `frame-src` et la source d'image `data:` nécessaire à l'enrôlement TOTP. Tester cette politique sur les véritables domaines.

## 6. Parcours d'une publication

1. Se connecter comme administrateur/rédacteur et valider TOTP.
2. Créer une fiche, avec son titre, son synopsis, son type `film`/`story`, son genre, sa langue et son niveau `mobile`/`plus`.
3. Charger une affiche JPEG, PNG ou WebP de moins de 8 MiB. Les affiches se trouvent dans un bucket **public**, y compris celles de brouillons ; ne pas y mettre de document confidentiel. Les vidéos restent soumises à la lecture signée.
4. Choisir une vidéo et sa durée maximale. Le serveur réserve un transfert TUS, impose `requiresignedurls`, et remet une URL de transfert à usage limité au navigateur. Ne pas conserver cette URL dans des logs ou localStorage. Cloudflare réserve de la capacité correspondant à la durée maximale jusqu'au traitement du fichier.
5. Attendre la fin du transfert et de la préparation. Le webhook signé ou l'action de rafraîchissement lit l'état fournisseur. La fin de la barre de progression ne signifie pas que l'encodage est prêt.
6. Publier. La RPC verrouille et vérifie la fiche, l'affiche et la vidéo prête avant de la rendre visible dans le catalogue.
7. Vérifier côté visiteur qu'une actualisation du catalogue affiche la fiche dans la bonne section. Les vidéos ne sont lisibles par un membre qu'avec une ligne d'abonnement active et du niveau requis ; le personnel à AAL2 peut prévisualiser sans abonnement.

Un contenu publié doit être archivé avant toute modification de métadonnées. Pour remplacer une vidéo déjà prête, créer une nouvelle fiche dans cette première version. Il n'existe pas de suppression distante des vidéos existantes depuis le back-office. Les transferts abandonnés, affiches non utilisées et anciennes vidéos doivent être examinés par l'opérateur ; leur nettoyage n'est pas automatisé ici.

## 7. Activité, erreurs et sécurité

La présence est envoyée au maximum une fois par minute par le navigateur visible. Le serveur utilise son heure, sérialise les mises à jour par utilisateur et plafonne le temps ajouté à 75 secondes par battement ; plusieurs onglets ne multiplient pas le temps crédité. Le nombre obtenu reste une **estimation de présence**, susceptible d'être manipulée par le client, et ne prouve pas qu'un film a été regardé. Les heures affichées sont à adapter à `Africa/Douala` ; les événements sont stockés en UTC.

Le journal distingue les événements serveur des diagnostics clients non fiables. Un client ne peut envoyer que `ui_error` avec un nom de composant autorisé, pas de texte libre, de pile d'erreur, d'URL, de mot de passe ou de jeton. Les refus administrateur répétés et les échecs vidéo peuvent produire des alertes à examiner. La fenêtre d'analyse utilise au plus les 500 événements les plus récents sur 24 heures ; le journal en affiche 200. Les échecs de connexion rejetés directement par Supabase Auth et les requêtes bloquées avant exécution ne sont pas tous présents dans ce journal. Les suivre aussi dans les journaux Auth/infrastructure et configurer leurs limites de débit.

`purge_operational_history()` supprime les sessions et agrégats de plus de 30 jours, les événements de plus de 90 jours et les compteurs de limite de plus de deux jours. Planifier cet appel **quotidiennement** depuis un outil serveur de confiance ou Supabase Cron après validation de la durée de conservation. La migration crée la fonction, mais ne crée pas de tâche planifiée. Sans cette tâche, la purge n'a pas lieu. Documenter cette collecte dans la politique de confidentialité, limiter l'accès au personnel autorisé et définir la procédure d'export/suppression de compte avant le lancement.

Un jeton vidéo a une durée égale à la durée du film plus 15 minutes, plafonnée à cinq heures et à la date d'expiration de l'abonnement. La révocation d'un abonnement ou l'archivage empêche l'émission de nouveaux jetons ; un jeton déjà délivré peut fonctionner jusqu'à son expiration. Une URL signée est un droit de lecture temporaire transmissible et n'empêche pas une capture d'écran ou un partage pendant sa validité. La limitation des lectures simultanées, le contrôle des appareils et le DRM demandent des mécanismes supplémentaires.

## 8. Vérifications disponibles et recette réelle

```sh
npm test
deno check supabase/functions/admin-api/index.ts supabase/functions/activity-heartbeat/index.ts supabase/functions/playback-token/index.ts supabase/functions/stream-webhook/index.ts
```

Les tests `backend-security.test.js` couvrent les décisions de droits, les origines, les limites de transfert, l'authenticité/fraîcheur des signatures, les droits de lecture et les alertes. `backend-rls.test.js` exécute la migration dans PostgreSQL embarqué PGlite avec des schémas Auth/Storage de test : isolation entre comptes, droits par rôle/MFA, impossibilité d'auto-attribuer un rôle/abonnement, publication contrôlée, événements hors ordre, estimation de présence et limites atomiques.

Ces contrôles locaux ne valident pas une configuration OAuth réelle, la délivrabilité SMTP, la facturation Stream, un transfert sur réseau mobile ou le déploiement Supabase. La recette de préproduction doit effectuer une inscription/confirmation/récupération, une connexion Google/Apple, le MFA du personnel, un véritable transfert puis une lecture, un test de contenu Plus refusé au forfait Mobile, un webhook signé valide/invalide et un test de membre incapable d'accéder aux utilisateurs ou aux brouillons. Vérifier que l'UID seul ne lit pas la vidéo et qu'une clé privée n'apparaît jamais dans le bundle ou les requêtes navigateur.

Le contrat exact des champs, actions, retours et codes d'erreur est dans `docs/BACKEND_CONTRACT.md`.
