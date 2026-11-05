# Référence MBOA v2 — à comparer avec votre dossier VS Code

Date de préparation : 2 novembre 2026, Cameroun.

## Pourquoi cette archive

Le rapport fourni décrit un dossier frontend uniquement. La dernière livraison préparée ici est une v2 qui contient déjà les sources d’authentification, le back-office et les fonctions serveur. Le rapport et cette archive ne décrivent donc pas les mêmes fichiers. Une ancienne extraction, un autre dossier ouvert ou un périmètre d’audit différent peuvent expliquer cet écart ; sa cause exacte reste à vérifier dans votre VS Code.

Cette archive reprend sans modification les 96 fichiers de la livraison React v2, dans un dossier nommé explicitement `mboa-cinema-react-v2-reference`, et ajoute le présent guide. Elle ne contient pas les changements effectués depuis dans votre ordinateur.

## Repères pour identifier la v2

- `package.json` : version `2.0.0`, dépendances `@supabase/supabase-js` et `tus-js-client`.
- `src/pages/AuthPage.jsx` et `src/context/AuthContext.jsx`.
- `src/pages/AdminPage.jsx` et `src/components/admin/`.
- `src/lib/supabase.js` et `src/context/CatalogContext.jsx`.
- `src/components/ProtectedPlayer.jsx`.
- `supabase/migrations/202611020001_mboa_backend.sql`.
- `supabase/functions/` : admin-api, playback-token, activity-heartbeat, stream-webhook.
- `docs/BACKEND_SETUP.md`, `docs/AUTH_SETUP.md`, `docs/BACKEND_CONTRACT.md`, `docs/VERIFICATION.md`.
- Cinq fichiers de tests, dont `backend-rls.test.js` et `backend-security.test.js`.

## Préserver votre travail actuel

Le rapport indique que votre dossier MBOA est non suivi dans le dépôt Git parent et que des dossiers voisins ont également des modifications. Une sauvegarde locale complète de votre dossier actuel est donc nécessaire avant la fusion ; l’état Git décrit ne prouve pas que votre travail MBOA est déjà protégé par un commit.

1. Sauvegarder le dossier de travail actuel dans un emplacement local privé. Garder les éventuels secrets de configuration privés.
2. Extraire cette archive à côté du dossier actuel, sans remplacer ses fichiers.
3. Donner à Copilot accès aux deux dossiers : le projet actuel à modifier et cette v2 à utiliser comme référence.
4. Comparer les fichiers, leurs dépendances et les points d’entrée. Exclure `node_modules`, `dist` et les caches de la comparaison.
5. Préserver le design, le classeur et les changements utilisateur. Ajouter les éléments manquants et fusionner les fichiers divergents au cas par cas.
6. Ne pas réinitialiser le dépôt parent, nettoyer ses fichiers non suivis ou modifier ses projets voisins.

## Les points d’intégration à fusionner

Copier uniquement les nouveaux écrans ne suffit pas. La v2 relie également les services dans `src/main.jsx`, `src/App.jsx`, `src/context/AppContext.jsx`, les pages d’accueil/catalogue/offres, les dialogues de recherche/détail/lecture et le gestionnaire de modales. Le `package.json` et le lockfile doivent rester cohérents avec les dépendances du projet fusionné.

Après fusion, exécuter les commandes de tests et de compilation prévues par le projet. Les tests de base de données fournis utilisent PGlite pour vérifier localement la migration et les permissions. Ils ne nécessitent pas, à eux seuls, de compte Supabase hébergé.

## Configuration et validation réelles

La présence de ces sources ne signifie pas que les services sont activés. Sans configuration, les formulaires d’authentification sont désactivés et l’administration est un aperçu sans données réelles. Le catalogue de démonstration reste consultable.

Suivre `docs/BACKEND_SETUP.md` et `docs/AUTH_SETUP.md` pour Supabase, l’envoi d’e-mails, Google, Apple, le second facteur et Cloudflare Stream. Les secrets restent côté serveur ; seules les valeurs publiques prévues dans `.env.example` appartiennent à React.

L’ordre de recette conseillé est : e-mail/confirmation → rôle du personnel et MFA → brouillon → affiche et vidéo → traitement confirmé → publication → rubrique utilisateur → lecture avec droits serveur → archivage. Les paiements, les limites effectives de lectures simultanées, les restrictions par appareil et les applications natives restent à vérifier/construire selon l’état de votre dossier après fusion.

## Rapport à actualiser dans VS Code

Mettre à jour `docs/RAPPORT_AVANCEMENT_MBOA.md` après la comparaison et l’intégration : fichiers conservés/ajoutés/fusionnés, résultats des tests, configurations manquantes, essais distants non exécutés et prochaine tâche. Conserver une distinction entre « code présent », « vérifié localement » et « vérifié avec les services réels ».

La validation précédente est décrite dans `docs/VERIFICATION.md`. Aucun nouveau test avec un fournisseur réel n’a été effectué pour ce reconditionnement de l’archive.
