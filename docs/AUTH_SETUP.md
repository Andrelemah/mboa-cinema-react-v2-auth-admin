# Authentification Epizo

Cette version utilise **Supabase Auth** pour les comptes par e-mail, téléphone (code SMS), Google et Apple. L’application React appelle le même projet Supabase que le catalogue et le back-office. Les rôles viennent de la base de données ; le navigateur ne peut pas créer un administrateur.

Le code est prêt à raccorder à vos services. Aucun projet Supabase, compte fournisseur, secret OAuth ni service d’envoi d’e-mails n’est créé automatiquement. Sans configuration, le catalogue de présentation reste consultable et les formulaires d’authentification sont désactivés.

## 1. Configurer le projet

Appliquer d’abord la migration et la configuration serveur décrites dans le guide de déploiement du dépôt. L’authentification attend la table `profiles` et la fonction SQL `get_my_role()` définies dans [BACKEND_CONTRACT.md](./BACKEND_CONTRACT.md).

Créer un fichier `.env.local` à la racine du projet React, à partir de `.env.example`, puis renseigner :

```dotenv
VITE_SUPABASE_URL=https://VOTRE_REFERENCE.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=VOTRE_CLE_PUBLIABLE
VITE_AUTH_GOOGLE_ENABLED=false
VITE_AUTH_APPLE_ENABLED=false
```

Le tableau de bord Supabase fournit l’URL du projet et sa clé **publishable** (`sb_publishable_…`). Une ancienne clé `anon` reste acceptée. Les exemples ci-dessus ne sont pas des identifiants valides. Redémarrer Vite après une modification du fichier ; pour un site publié, reconstruire et redéployer le bundle.

**Toutes les variables `VITE_` sont accessibles aux visiteurs.** Ne jamais y placer une clé `service_role`, une clé `sb_secret_…`, un secret Google/Apple, un fichier Apple `.p8` ou un jeton vidéo. Le client refuse certaines clés secrètes reconnaissables, mais ce contrôle ne peut pas protéger un secret déjà inséré dans un bundle : dans ce cas, révoquer la clé exposée et reconstruire le site.

Les fournisseurs Google et Apple restent désactivés tant que leur variable ne vaut pas exactement `true`. Activer un bouton uniquement après avoir configuré le fournisseur côté Supabase et validé son parcours sur le domaine cible.

## 2. Autoriser les URL de retour

Dans **Authentication → URL Configuration**, définir la **Site URL** du déploiement. Ajouter à la liste des redirections les URL exactes produites par ce projet, par exemple :

```text
http://localhost:5173/#connexion
http://localhost:5173/?auth_action=recovery#connexion
https://votre-domaine.cm/#connexion
https://votre-domaine.cm/?auth_action=recovery#connexion
```

Si Vite est lancé sur `127.0.0.1`, ajouter les deux URL correspondantes : `localhost` et `127.0.0.1` sont des origines différentes. Si le site est servi sous un chemin, par exemple `/cinema/`, conserver ce chemin dans les URL et configurer la valeur `base` de Vite. Éviter les jokers larges en production. Le domaine de staging doit avoir ses propres entrées explicites.

Les retours OAuth utilisent le flux **PKCE**, puis le SDK échange le code avec Supabase. L’application ne prend pas de destination externe fournie par un visiteur. Seules les routes Epizo autorisées peuvent être mémorisées pour le retour, dont `compte` et `admin`.

Référence : [redirections Supabase](https://supabase.com/docs/guides/auth/redirect-urls) et [flux PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow).

## 3. Comptes par e-mail

Dans **Authentication → Sign In / Providers → Email**, activer le fournisseur e-mail et la **confirmation d’adresse**. Configurer une longueur minimale de **12 caractères** côté serveur, en cohérence avec les formulaires. Les contrôles React améliorent l’expérience ; la politique du serveur fait autorité.

Configurer un **SMTP personnalisé** avant une ouverture au public et vérifier la délivrabilité du domaine d’envoi. Personnaliser les modèles de confirmation et de récupération. Le modèle standard qui utilise `{{ .ConfirmationURL }}` fonctionne avec ce parcours ; ne pas le remplacer par un lien vers la page d’accueil qui perdrait le jeton de vérification. Si vous créez vos propres modèles et routes, suivre la documentation Supabase et tester séparément les URL.

Le parcours est le suivant :

1. La personne crée son compte et reçoit un lien de confirmation.
2. Elle confirme son adresse, puis retrouve son espace Epizo.
3. En cas d’oubli, elle demande un lien de récupération.
4. Le formulaire de nouveau mot de passe apparaît seulement après l’événement vérifié `PASSWORD_RECOVERY` du SDK.

Ajouter `auth_action=recovery` dans une URL ne suffit jamais à autoriser un changement de mot de passe. Avec PKCE, ouvrir le lien dans le **même navigateur et sur la même origine** que ceux utilisés pour lancer la demande : le vérificateur du flux y est conservé par le SDK. Un lien expiré, déjà utilisé ou ouvert sans le vérificateur nécessite une nouvelle demande. Recharger la page après l’événement de récupération peut également nécessiter de recommencer ; l’application ne mémorise pas une autorisation de récupération dans une préférence locale.

Le lien « Annuler et revenir à Epizo » ferme la session de récupération avec une vraie déconnexion avant de revenir au catalogue.

La réponse à une demande de récupération ne révèle pas si l’adresse correspond à un compte. L’interface affiche des erreurs générales et ne copie pas les messages techniques bruts du serveur.

Références : [authentification par mot de passe](https://supabase.com/docs/guides/auth/passwords), [SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [modèles d’e-mails](https://supabase.com/docs/guides/auth/auth-email-templates).

### Connexion par téléphone (code SMS)

Le formulaire propose la connexion ou la création de compte par numéro de téléphone et code à usage unique. Saisir le numéro au format international E.164, par exemple `+2376XXXXXXXX`. La création de compte par téléphone reprend le nom saisi dans le formulaire ; le code SMS est vérifié par Supabase Auth et n’est jamais enregistré dans les préférences du navigateur.

Avant d’activer ce parcours sur un projet :

1. Dans **Authentication → Sign In / Providers → Phone**, activer le fournisseur téléphone.
2. Configurer un fournisseur SMS pris en charge dans les paramètres Auth/SMS du projet et vérifier son expéditeur, son modèle et ses crédits.
3. Configurer des limites d’envoi et des protections anti-abus adaptées à la région ; surveiller les coûts SMS et les échecs de livraison.
4. Tester l’inscription, la connexion d’un numéro existant, un code erroné/expiré et les limites de renvoi sur un environnement de préproduction.

Le code React appelle l’API OTP de Supabase ; aucun fournisseur SMS ni secret de fournisseur n’est intégré au bundle. Tant que le téléphone/SMS n’est pas activé côté Supabase, l’envoi de codes ne peut pas fonctionner. Les numéros restent gérés par Supabase Auth ; le schéma `profiles` existant n’enregistre pas une copie du numéro.

Référence : [connexion par téléphone Supabase](https://supabase.com/docs/guides/auth/phone-login).

## 4. Connexion avec Google

Dans Google Cloud, préparer l’écran de consentement et créer un client OAuth de type **application Web**. Configurer les origines autorisées utilisées par votre application et l’URI de retour fournie par le tableau de bord Supabase, généralement :

```text
https://VOTRE_REFERENCE.supabase.co/auth/v1/callback
```

Copier l’ID client et le secret dans le fournisseur **Google** de Supabase, puis activer ce fournisseur. Garder le secret uniquement chez Supabase, jamais dans React. Terminer les réglages de publication/test du consentement Google adaptés au public du projet. Enfin, définir `VITE_AUTH_GOOGLE_ENABLED=true` et reconstruire le site.

Epizo demande seulement `openid email profile`. Il s’agit de se connecter avec un compte Google, **sans accès à Gmail ni à la boîte de réception**. Aucune saisie du mot de passe Google ne passe par un formulaire Epizo.

Référence : [Google avec Supabase Auth](https://supabase.com/docs/guides/auth/social-sign-in/auth-google).

## 5. Connexion avec Apple

Pour ce parcours Web, configurer **Sign in with Apple** dans votre compte Apple Developer : App ID associé, **Services ID** Web, domaine du site et URL de retour Supabase. Préparer le **Team ID**, le **Key ID** et la clé privée `.p8`, puis générer le secret Apple selon la documentation du fournisseur. Renseigner les identifiants et le secret dans le fournisseur **Apple** de Supabase.

Utiliser l’URL de retour indiquée par Supabase ; avec le domaine standard elle se termine également par `/auth/v1/callback`. Apple impose ses propres contraintes de domaine et de HTTPS : effectuer la validation du parcours Web sur un vrai domaine de staging autorisé, et non en supposant que n’importe quelle adresse `localhost` sera acceptée.

Le secret Apple pour OAuth Web doit être renouvelé **au plus tard tous les six mois**. Programmer sa rotation opérationnelle avant l’échéance pour éviter une interruption de connexion. La clé `.p8` et les secrets restent dans l’environnement serveur ou les outils d’administration autorisés.

Définir ensuite `VITE_AUTH_APPLE_ENABLED=true` et reconstruire le site. Une adresse de relais privé Apple est une adresse utilisateur valide. Le nom complet n’est pas systématiquement disponible dans le retour OAuth ; Epizo utilise le nom du profil lorsqu’il existe et permet de le modifier depuis le compte. Le code livré couvre le Web React ; une future application native iOS/macOS nécessitera sa propre intégration et configuration Apple.

Référence : [Apple avec Supabase Auth](https://supabase.com/docs/guides/auth/social-sign-in/auth-apple).

## 6. Administrateurs, éditeurs et deuxième facteur

Les nouveaux inscrits ont le rôle `member`. Les rôles `editor` et `admin` sont attribués par une opération serveur autorisée décrite dans le guide de déploiement. Ni un champ d’inscription, ni les métadonnées OAuth, ni une valeur du stockage du navigateur ne donnent un rôle équipe.

Après une connexion avec un compte équipe, `#admin` demande un deuxième facteur **TOTP** :

- Première utilisation : configurer une application d’authentification, scanner le QR code ou saisir la clé manuellement, puis vérifier le code à six chiffres.
- Connexions suivantes : saisir le code de cette application pour obtenir une session `aal2`.
- Une configuration non vérifiée peut être annulée ; la page permet également de supprimer les configurations TOTP restées inachevées. Elle ne supprime pas un facteur déjà vérifié.

Activer le support TOTP dans les réglages MFA Supabase et vérifier que la politique d’assurance correspond au déploiement. Le QR code, sa clé et les codes saisis restent dans l’état de l’interface ; ils ne sont pas ajoutés aux journaux d’activité ni aux préférences. Le facteur lui-même est géré par Supabase Auth.

Le rôle et le niveau `aal2` contrôlent l’interface, puis sont **contrôlés de nouveau côté serveur** par les politiques RLS et les Edge Functions. La vérification MFA ne publie pas de film et ne modifie pas de rôle. En cas de perte d’un facteur vérifié, appliquer une procédure de récupération d’équipe contrôlée hors de cette interface ; aucun bouton de contournement n’est fourni.

Référence : [TOTP et assurance MFA](https://supabase.com/docs/guides/auth/auth-mfa/totp).

## 7. Sessions et validation avant ouverture

Le SDK Supabase gère la session et son renouvellement dans le navigateur. Epizo n’enregistre jamais de mot de passe dans `localStorage` ou dans son propre stockage de préférences. La déconnexion de cette version utilise `scope: 'local'` : elle ferme la session du navigateur courant, sans annoncer une déconnexion de tous les appareils.

La vérification d’identité passe par `auth.getUser()`, puis charge le profil, le rôle serveur et le niveau d’assurance. Les rappels `onAuthStateChange` restent synchrones ; les lectures SDK suivantes sont différées pour éviter un verrou d’authentification. Les changements de session invalident les lectures antérieures afin qu’une ancienne réponse ne rétablisse pas l’identité après une déconnexion.

Avant ouverture publique, effectuer avec vos véritables projets : inscription/confirmation, connexion et déconnexion, lien de récupération valide/expiré, Google et Apple sur le domaine final, accès membre refusé au back-office, inscription TOTP, connexion équipe à `aal1` refusée puis à `aal2` autorisée, et nouvelle vérification après expiration de session. Les compilations ou tests locaux sans identifiants ne remplacent pas ces essais de bout en bout.

Servir le site en HTTPS et conserver une politique CSP adaptée aux domaines effectivement utilisés. Les requêtes de rôle et les alertes affichées ne constituent pas, à elles seules, un système de détection autonome des intrusions. Le contrat backend précise les données d’activité collectées et leurs limites.

Références : [événements d’authentification](https://supabase.com/docs/reference/javascript/auth-onauthstatechange), [gestion des sessions](https://supabase.com/docs/guides/auth/sessions).

## Contrat des composants

`AuthProvider` doit entourer `AppProvider`. `useAuth()` expose l’identité, les erreurs de chargement, `recoveryMode`, les rôles et les méthodes ci-dessous. Toutes les méthodes renvoient `{ data, error }` ; les erreurs de transport ne sont pas propagées comme des exceptions non gérées.

```js
signInWithPassword({ email, password })
signUpWithEmail({ email, password, displayName })
sendPhoneOtp({ phone, displayName, shouldCreateUser })
verifyPhoneOtp({ phone, token })
signInWithProvider('google' | 'apple')
requestPasswordReset(email)
updatePassword(password) // exige un événement de récupération authentifié
refreshIdentity()
signOut()
```

`AuthPage` et `AdminMfaGate` utilisent les langues d’interface française et anglaise du contexte Epizo. `AdminMfaGate` fonctionne sans props ; `children` et `onVerified` sont facultatifs. Les langues des films restent gérées dans le catalogue, indépendamment de l’identité et de la langue des messages d’authentification.
