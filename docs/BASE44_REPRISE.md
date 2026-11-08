# Epizo — reprise dans Base Code

État au 8 novembre 2026, branche `epizo-basecode-setup`.
Ce document décrit la reprise du dépôt existant dans l'environnement Base Code : corrections, contrôles réellement exécutés, limites, configurations manquantes et distinction entre aperçu et production. Il ne remplace pas `docs/BACKEND_SETUP.md` ni `docs/AUTH_SETUP.md`, qui restent les guides de configuration des services.

Aucun service externe n'a été créé, aucun paiement n'a été activé, aucun abonnement n'a été souscrit, aucune branche n'a été fusionnée dans `master` et rien n'a été publié en production.

## 1. Ce qui a changé

| Fichier | Changement | Raison |
| --- | --- | --- |
| `src/services/payments.js` | `import { Configured, supabase }` devient `import { backendConfigured, supabase }` depuis `../lib/supabase.js` | `Configured` n'est pas exporté par `src/lib/supabase.js` ; le module exporte `backendConfigured`, déjà utilisé dans ce même service. Sans cette correction, le bundle ne se construit pas. |
| `docs/BASE44_REPRISE.md` | Ce document | Traçabilité de la reprise, des contrôles et des tâches restantes. |

Aucun autre fichier source, migration, fonction Edge, style ou texte d'interface n'a été modifié. Le design cinéma/classeur, React/Vite, Supabase (Auth, PostgreSQL, RLS, Edge Functions) et Cloudflare Stream restent en place. Aucun contrôle de rôle, d'abonnement ou de MFA n'a été contourné, et le backend n'a pas été migré vers Base44.

### Écoute Vite dans l'environnement Base Code

Aucune modification de `vite.config.js` n'a été nécessaire. L'aperçu démarre le serveur de développement du dépôt avec `--host 0.0.0.0 --port 3000` (options en ligne de commande), et l'hôte du proxy est accepté via la variable d'environnement fournie par la plateforme `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS`, que Vite ajoute à `allowedHosts`. La liste `allowedHosts` du dépôt n'est donc ni remplacée ni élargie à `*`.

Contrôle effectué : une requête avec l'en-tête `Host` du bac à sable répond `200`, une requête avec un hôte étranger répond `403`.

Cette configuration appartient au dépôt d'environnement Base Code, pas au dépôt applicatif ; elle ne change pas le comportement d'un déploiement classique.

## 2. Contrôles exécutés

Tous les contrôles ci-dessous ont été lancés dans le conteneur de développement, sur le code de cette branche.

| Commande / contrôle | Résultat |
| --- | --- |
| Installation `npm ci` depuis `package-lock.json` | OK (au démarrage du service, dépendances dans un volume dédié) |
| `npm test` (`node --test tests/*.test.js`) | **32 tests, 32 réussis, 0 échec** |
| `npm run build` (`vite build`) | **Succès**, 127 modules transformés, `dist/` généré. Avertissement non bloquant : un chunk principal de 795 kB dépasse le seuil de 500 kB |
| Aperçu sur le port 3000 | Serveur Vite du dépôt, sources servies à l'état non compilé (`/src/main.jsx`), donc en mode développement avec rechargement |
| Accueil `#accueil` | Rendus : héros cinéma, navigation, titres du catalogue de présentation ; aucune erreur console |
| Catalogue `#films` | Rendus : classeur, filtres, 8 affiches, mention « Catalogue de présentation » ; aucune erreur console |
| Connexion `#connexion` | Rendus : formulaire e-mail, onglets inscription/récupération, boutons Google/Apple désactivés, message « Les comptes ne sont pas encore activés » ; aucune erreur console |
| Administration `#admin` (backend non configuré) | Rendus : bannière « Aperçu de votre espace administrateur », état « Backend non connecté », compteurs vides, actions de publication désactivées. Aucun droit réel, aucun rôle accordé |

Les tests couvrent les décisions de droits serveur, les origines autorisées, les signatures Cloudflare/Paystack, la migration SQL sous PGlite (RLS, rôles, MFA, publication, abonnements) et les utilitaires du catalogue. Ils ne constituent pas une recette d'intégration réelle.

**Non vérifié automatiquement dans cet aperçu :** connexion réelle, inscription par e-mail ou téléphone, OAuth Google/Apple, enrôlement TOTP, transfert Cloudflare Stream, lecture signée, paiement Paystack réel, webhook de paiement réel et écrans réservés à un rôle administrateur authentifié. Tous dépendent de services externes non configurés.

## 3. Comment fonctionne l'aperçu

L'aperçu Base Code exécute **le serveur de développement Vite du dépôt** sur le port 3000, sources montées en direct. C'est un environnement de développement, pas un hébergement de production : pas de HTTPS public garanti, pas de compilation optimisée, pas de CDN, pas de sauvegarde, pas de domaine définitif.

Faute de configuration Supabase, l'application démarre dans son mode prévu : catalogue local de présentation (`src/data/catalogue.js`) et administration en aperçu vide. Ce mode est explicite dans l'interface et ne simule ni compte, ni abonnement, ni paiement.

## 4. Configurations manquantes

Rien n'est requis pour démarrer l'aperçu. Pour un environnement réel, les valeurs suivantes sont manquantes. **Aucun secret ne doit être collé dans un fichier versionné ni dans une conversation** : ils se saisissent dans les tableaux de bord des fournisseurs concernés, ou dans le stockage chiffré de secrets de l'environnement.

### 4.1 Configuration publique du navigateur (`VITE_`, visible par tous)

À déclarer dans l'environnement de build ou le fichier `.env.local` local (jamais commité) :

| Variable | Rôle |
| --- | --- |
| `VITE_SUPABASE_URL` | URL du projet Supabase (préproduction puis production) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Clé **publishable** (ou ancienne `anon`) — jamais `service_role` ni `sb_secret_` |
| `VITE_AUTH_GOOGLE_ENABLED` | À passer à `true` uniquement après un parcours Google validé |
| `VITE_AUTH_APPLE_ENABLED` | À passer à `true` uniquement après un parcours Apple validé |

Valeurs actuelles : absentes. `backendConfigured` vaut donc `false` et l'application reste en mode présentation.

### 4.2 Secrets serveur (fonctions Edge Supabase)

À saisir via `supabase secrets set --env-file …` ou le tableau de bord Supabase. Noms seuls, aucune valeur ici.

| Variable | Service | Rôle |
| --- | --- | --- |
| `APP_ORIGIN` | Supabase / webhook | Origines navigateur exactes autorisées (aucun `*`) |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Stream | Compte |
| `CLOUDFLARE_STREAM_API_TOKEN` | Cloudflare Stream | Transfert, état, signature |
| `STREAM_CUSTOMER_CODE` | Cloudflare Stream | Hôte du lecteur signé |
| `STREAM_WEBHOOK_SECRET` | Cloudflare Stream | Vérification HMAC du webhook vidéo |
| `MAX_VIDEO_BYTES` | Cloudflare Stream | Plafond facultatif (10 GiB par défaut) |
| `PAYMENTS_ENABLED` | Paystack | Reste `false` tant que le parcours test n'est pas validé ; aucune activation faite ici |
| `PAYSTACK_SECRET_KEY` | Paystack | Clé secrète serveur uniquement |
| `PAYSTACK_CURRENCY` | Paystack | Devise (`XAF` prévue) |
| `PAYSTACK_SUBUNIT_FACTOR` | Paystack | Facteur d'unité monétaire (XAF sans décimale : `1`) |
| `PAYSTACK_CHANNELS` | Paystack | `card,mobile_money` |
| `PAYSTACK_PLAN_MOBILE_AMOUNT` | Paystack | Montant de l'offre Mobile (hypothèse : 3 000) |
| `PAYSTACK_PLAN_PLUS_AMOUNT` | Paystack | Montant de l'offre Plus (hypothèse : 5 000) |
| `PAYSTACK_CALLBACK_URL` | Paystack | Retour après paiement, sur une origine autorisée |

`SUPABASE_URL`, `SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_ROLE_KEY` sont fournis automatiquement aux fonctions hébergées ; ils ne doivent jamais apparaître dans le bundle navigateur.

### 4.3 Services à provisionner (hors code)

- Projet Supabase de préproduction, migrations `supabase/migrations/*` appliquées (`supabase db push`).
- Authentification : SMTP d'envoi réel, confirmation d'adresse, longueur minimale de 12 caractères, URL de redirection exactes du futur domaine.
- Fournisseurs OAuth Google et Apple (identifiants et secret côté Supabase uniquement ; rotation du secret Apple avant six mois).
- Fournisseur SMS pour l'OTP téléphone, avec limites anti-abus et suivi des coûts.
- Support TOTP MFA activé, puis promotion manuelle du premier administrateur via `supabase/bootstrap-admin.sql` (opération opérateur, hors interface).
- Compte Cloudflare Stream, jeton API limité, webhook Stream signé.
- Compte marchand Paystack, clés de **test** d'abord, webhook signé.
- Tâche planifiée quotidienne pour `purge_operational_history()`, absente par défaut.
- Sauvegardes, supervision, politique de rétention et de suppression de compte.

## 5. Paiements : état factuel

Le dépôt contient déjà des fonctions Paystack écrites et testées partiellement :

- `paystack-checkout` : statut de configuration, création d'une session hébergée, vérification serveur d'une référence.
- `paystack-webhook` : vérification de la signature HMAC-SHA512 sur le corps brut, contrôle du montant, de la devise et du canal, puis écriture d'abonnement par la RPC serveur uniquement.
- Migration `202611040001_epizo_payments.sql` : table `payment_transactions`, fonction `complete_paystack_transaction`, écriture réservée à `service_role`.

**Aucune intégration réelle n'est validée** : aucun compte Paystack n'existe pour ce projet, aucune session de paiement n'a été créée, aucun webhook n'a été reçu, aucun abonnement n'a été activé, et `PAYMENTS_ENABLED` reste à `false`. Les tests locaux vérifient la logique de signature, les montants et les droits SQL, pas un encaissement.

Points à confirmer avant toute activation :

- Disponibilité d'un compte marchand Paystack pour une entité camerounaise, et couverture réelle de MTN Mobile Money et Orange Money sur ce compte. Ces deux moyens passent par le canal `mobile_money` du fournisseur ; aucun essai réel n'a été fait ici.
- Devise `XAF` et absence de décimales : Paystack attend un montant en plus petite unité ; `PAYSTACK_SUBUNIT_FACTOR=1` est une hypothèse à valider avec le fournisseur.
- Tarifs 3 000 / 5 000 FCFA : hypothèses produit, non validées commercialement.
- Renouvellement : le modèle actuel est un renouvellement manuel de 30 jours, pas un prélèvement récurrent automatique.
- Remboursements, litiges, délais de notification et déduplication des webhooks.

## 6. Limites connues du MVP actuel

- **Lecture protégée, sans DRM.** Le serveur émet une URL Cloudflare Stream signée après contrôle de l'abonnement et du niveau d'offre. Une URL déjà émise reste utilisable jusqu'à son expiration ; capture d'écran et partage restent possibles.
- **Lectures simultanées non appliquées.** L'offre Plus annonce quatre lectures, l'offre Mobile une ; aucune réservation atomique de place n'est implémentée.
- **Catégorie d'appareil non prouvée.** La promesse « téléphone uniquement » n'est pas contrôlée côté serveur ; la taille d'écran ou l'agent utilisateur ne constituent pas une preuve.
- **Profils et appareils.** Pas de profils familiaux, pas d'enregistrement d'appareil, pas de révocation de session par appareil depuis l'interface (déconnexion `scope: 'local'`).
- **Applications natives et TV absentes.** Le dépôt livre un site web responsive ; Android, iOS, Android/Google TV, Tizen et webOS ne sont pas développés ni certifiés.
- **Langues.** Sept codes de langue existent en base ; les cinq langues camerounaises restent une sélection provisoire, la langue bamiléké n'est pas tranchée, et aucune traduction native n'est livrée.
- **Consommation de contenu acheté sur mobile.** Aucune application mobile n'existe. Un futur client Android/iOS devrait réutiliser la session Supabase et demander un jeton au serveur (`playback-token`) pour chaque lecture ; il ne peut pas s'appuyer sur un choix d'offre local. Les règles d'achat dans les boutiques (App Store, Play Store) sont à arbitrer avant toute intégration de paiement intégré à l'application.
- **Exploitation.** Purge des données non planifiée par défaut, absence de SIEM/WAF, journal d'activité limité aux événements intégrés, présence estimée et non certifiée.

## 7. Prochaines étapes vers la préproduction

1. Créer le projet Supabase de préproduction, appliquer les migrations, déployer les quatre fonctions existantes plus les deux fonctions Paystack.
2. Renseigner les secrets serveur listés en 4.2 dans Supabase, et `APP_ORIGIN` avec le domaine exact de préproduction.
3. Déclarer `VITE_SUPABASE_URL` et `VITE_SUPABASE_PUBLISHABLE_KEY` dans l'environnement de build de préproduction (valeurs publiques uniquement).
4. Configurer SMTP, confirmation d'adresse, redirections exactes, puis valider inscription, confirmation, récupération et connexion.
5. Activer TOTP, promouvoir un administrateur via `bootstrap-admin.sql`, valider refus à `aal1` et accès à `aal2`.
6. Créer le compte Cloudflare Stream, effectuer un transfert TUS réel, attendre le webhook, publier une fiche et vérifier la lecture d'un membre abonné.
7. Créer un compte Paystack en mode **test**, renseigner les secrets, exécuter un paiement carte et un paiement mobile money de test, vérifier le webhook signé et l'activation d'abonnement. Ne passer `PAYMENTS_ENABLED=true` qu'après succès.
8. Vérifier les refus attendus : membre sans abonnement, offre Mobile sur un contenu Plus, membre sur `#admin`, requête sans jeton, webhook de signature invalide.
9. Planifier la purge quotidienne, les sauvegardes et la supervision ; rédiger la politique de confidentialité et la procédure de suppression de compte.
10. Préparer ensuite le chantier commercial : confirmation des tarifs, de la couverture MTN/Orange Money, des limites d'appareils et de lectures simultanées, puis développement des applications mobiles et TV.

## 8. Aperçu Base Code et hébergement de production

| Aspect | Aperçu Base Code (cette branche) | Hébergement de production |
| --- | --- | --- |
| Serveur | Serveur de développement Vite dans un bac à sable | Site statique compilé (`dist/`) servi en HTTPS derrière un CDN |
| URL | URL temporaire de prévisualisation | Domaine contrôlé par l'équipe Epizo |
| Configuration | Variables d'environnement du bac à sable | Variables de build et secrets des fournisseurs |
| Backend | Supabase non configuré : catalogue de présentation, administration en aperçu | Projet Supabase dédié, migrations et fonctions déployées |
| Paiements | Aucun | Paystack activé après recette en mode test |
| Vidéo | Lecteur inactif | Cloudflare Stream signé |
| Données | Aucune donnée réelle | Données réelles, sauvegardées, avec rétention définie |
| Statut | Développement uniquement, jamais une mise en service | Déploiement explicite après recette et validation |

Rien dans cette branche n'est fusionné dans `master` et rien n'est publié. L'ouverture commerciale reste une décision de l'équipe, après les étapes de la section 7.
