# Vérifications de la livraison 2.0

Vérifications effectuées dans l’environnement de développement le 2 novembre 2026. Aucun compte externe ni identifiant de production n’était configuré.

## Code et base de données

- `npm run check` : les cinq fichiers de tests passent, puis le build Vite de production réussit.
- Les tests de sécurité couvrent les origines autorisées, rôle et second facteur, taille/durée des transferts, HMAC valide/falsifié/périmé, états vidéo, droits de lecture, expiration et alertes.
- La migration réelle est exécutée sous PGlite avec des schémas Auth/Storage de test. Les contrôles vérifient l’isolation des comptes, les droits par colonne et RLS, l’impossibilité de se donner un rôle ou abonnement, la publication conditionnée, l’ordre des événements vidéo, la présence et les limites de débit.
- Les tests de catalogue vérifient les filtres/recherche, préférences, destination film/histoire, niveau d’offre et origine du lecteur signé.
- `deno check` réussit sur les quatre fonctions Edge. L’exécutable Deno temporaire utilisé pour cette vérification n’est pas une dépendance à télécharger avec l’archive.
- Le build sépare les écrans compte, authentification et administration en modules chargés à la demande. Vite signale encore un module principal supérieur à 500 ko avant compression (environ 155 ko gzip) ; ce message n’empêche pas la compilation. Une optimisation plus fine pourra accompagner la mesure réelle des performances réseau.

## Interface dans le navigateur

- Connexion et inscription : écrans affichés, champs et fournisseurs désactivés en l’absence de configuration, aucun faux succès.
- Administration : vue d’ensemble, contenus, utilisateurs et sécurité consultables en aperçu ; compteurs sans données affichés par des tirets, mutations indisponibles.
- Éditeur : sélection Histoires et Bassa répercutée dans l’aperçu de la fiche et la destination ; enregistrement/envoi/publication désactivés sans backend.
- Libellés des champs reliés explicitement aux contrôles ; septième langue planifiée affichée comme restant à préciser.
- Classeur public : passage au titre suivant et ouverture de sa fiche de présentation toujours fonctionnels après intégration.
- Vue desktop : absence de débordement horizontal observée.
- Connexion et administration dans deux vues de 390 × 844 px : largeur utile et largeur du contenu toutes deux de 375 px, sans débordement horizontal. Ces vues intégrées ne remplacent pas un test sur appareil physique.

## Revue des transitions de session

- Les réponses d’identité périmées sont invalidées après déconnexion/changement de compte.
- Le renouvellement de session du même utilisateur n’interrompt plus l’éditeur ni le lecteur.
- Le résultat d’autorisation vidéo est lié à l’utilisateur et au film, empêchant la réutilisation visuelle d’un ancien résultat lors d’un changement.
- Une récupération de mot de passe authentifiée ferme les anciennes fenêtres modales ; une simple variable d’URL ne l’active pas.
- Une annulation du parcours de récupération déconnecte la session avant retour au catalogue.

Ces points ont fait l’objet d’une revue de code ; aucun flux OAuth/TOTP réel n’est annoncé comme validé.

## À vérifier avec les services réels

Inscription, délivrabilité SMTP, confirmation, récupération, Google et Apple sur le domaine final, TOTP du personnel, dépôt d’une vidéo réelle, préparation Cloudflare, webhook signé, publication et lecteur avec abonnement de test géré côté serveur. Les appareils physiques, Safari, applications natives et téléviseurs n’ont pas été testés.

Les contrôles ci-dessus ne constituent ni un audit de sécurité complet ni une validation de tous les services de production. Les guides d’activation précisent les étapes de préproduction et les fonctions qui restent à construire.
