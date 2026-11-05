# Epizo — Première direction produit

État : interface React et socle d’authentification/back-office implémentés ; services externes non activés. Marché de départ : Cameroun. Langue principale de cette présentation : français.

## Décisions de l’utilisateur

- Construire la plateforme et son expérience visuelle avant le chantier de production des films.
- Adopter des abonnements fondés sur le catalogue, les appareils autorisés et le nombre de lectures simultanées.
- Retirer le modèle de consommation de temps. Les durées affichées dans le catalogue correspondent uniquement à la durée des œuvres.
- S’inspirer des usages établis de Netflix et Prime Video, avec une identité visuelle originale, une interface professionnelle et des interactions fluides.
- Conserver les objectifs de films et histoires produits par l’équipe, d’une première audience au Cameroun, de sept langues et de plusieurs catégories d’appareils.

## Offres utilisées pour explorer l’interface

| Offre | Prix indicatif | Appareils de lecture prévus | Lectures simultanées | Accès |
| --- | ---: | --- | ---: | --- |
| Découverte | Gratuit | Consultation du catalogue | 0 dans cette version | Catalogue, favoris et futurs extraits |
| Mobile | 3 000 FCFA / 30 jours | Téléphone | 1 | Sélection de films et d’histoires |
| Plus | 5 000 FCFA / 30 jours | Appareils compatibles | 4 | Catalogue complet |

Les montants sont les exemples proposés par l’utilisateur. Ils ne constituent pas des tarifs commerciaux validés. L’expression « trois autres utilisateurs » est interprétée comme le titulaire et trois autres lectures, soit quatre lectures simultanées au total. Cette interprétation doit être confirmée avant implémentation commerciale.

La période de 30 jours et le renouvellement manuel sont des hypothèses de travail. MTN Mobile Money et Orange Money sont les moyens de paiement envisagés pour le site. Aucun paiement n’est encaissé par cette version. Les flux d’achat dans les applications distribuées en boutique devront suivre les règles applicables à leur marché et à leur boutique.

## Appareils et profils

- Web et Mac via un site responsive, Android mobile, Android/Google TV, Samsung Tizen et LG webOS restent dans le périmètre visé.
- La présente livraison est un site web responsive ; elle n’est pas une application native Android ou TV et n’est pas une certification de compatibilité avec tous les téléviseurs.
- Un profil, un utilisateur autorisé, un appareil enregistré et une lecture simultanée sont des notions distinctes.
- L’offre Plus décrit quatre lectures simultanées ; elle ne définit pas encore la politique de partage du compte ou du foyer.
- Les versions minimales des systèmes et les modèles de télévision doivent être précisés avant le développement et les tests des applications correspondantes.

## Langues

L’objectif reste français, anglais et cinq langues camerounaises sélectionnées. La liste provisoire est Bassa, Duala, Fulfulde, Ewondo et une langue du groupe bamiléké à choisir. La variété de Fulfulde et les noms publics doivent être confirmés avec les intervenants linguistiques.

Les textes natifs non validés ne sont pas inventés dans ce prototype. Il faut distinguer la langue de l’interface, les textes du catalogue, les sous-titres et l’audio. Les langues associées aux œuvres fictives illustrent un futur classement ; aucune piste audio n’est annoncée comme déjà produite.

## Catalogue de présentation

Tous les titres, synopsis, années et durées de `src/data/catalogue.js` sont des éléments fictifs destinés à tester le design. Aucun acteur, palmarès, nombre de vues, classement ou date de sortie réelle n’est affirmé. Le catalogue n’inclut aucun film à regarder et doit être présenté comme un catalogue de démonstration.

Les cartes, favoris, recherche, filtres, détails, navigation et comparaison d’offres peuvent fonctionner localement. Les préférences éventuellement conservées dans le navigateur ne sont ni une authentification, ni un abonnement commercial, ni une garantie de sécurité d’accès.

## Contrôle d’accès de la future version commerciale

Le serveur devra prendre la décision d’accès à partir de l’abonnement vérifié, de sa période de validité, du titre demandé, de la catégorie d’appareil autorisée et des sessions actives.

Il faudra notamment :

- Vérifier les paiements côté serveur, leur montant, leur devise et leur état final ; dédupliquer les notifications.
- Gérer les états en attente, actif, expiré, annulé et remboursé selon des règles explicites.
- Enregistrer les droits de chaque offre et les catégories de titres qu’elle ouvre.
- Émettre des autorisations de lecture protégées et intégrer la protection de contenu retenue.
- Acquérir une place de lecture de façon atomique, avec renouvellement de session et expiration des sessions abandonnées, pour appliquer la limite de lectures simultanées.
- Permettre à l’utilisateur de consulter et révoquer ses sessions et appareils.
- Ne pas considérer la taille d’écran, le choix local d’une offre ou le simple User-Agent comme une preuve suffisante d’autorisation d’appareil.
- Tester les reprises de connexion, changements d’appareil, achats répétés et notifications de paiement retardées.

## Périmètre à estimer après validation du design

1. Interface et parcours web, mobile et télévision.
2. Authentification, abonnements, droits d’accès, profils et contrôle des sessions.
3. Paiements réels et exploitation des remboursements et renouvellements.
4. Catalogue administrable, traitement vidéo, pistes audio et sous-titres.
5. Applications et validation sur chaque plateforme native retenue.
6. Traductions et revue linguistique.
7. Hébergement, diffusion vidéo, support et maintenance.

Le budget n’est pas encore défini. Aucune date de sortie ni estimation commerciale ferme n’est promise. Le développement de films, scripts et voix forme un chantier séparé de la livraison de l’interface.

## Livraison 2 — Comptes et administration

Le frontend conserve le classeur et lit désormais le catalogue partagé Supabase lorsqu’il est configuré. Les parcours Google, Apple et e-mail, le second facteur du personnel, les rôles, l’édition de brouillons, les affiches et le transfert Cloudflare Stream sont implémentés. Les contenus ne deviennent publics qu’après une décision de publication contrôlée côté serveur.

Les autorisations de lecture contrôlent déjà l’abonnement serveur, sa validité et le niveau du catalogue. Les paiements, les places de lecture simultanée, les catégories d’appareil et le DRM restent à implémenter avant l’ouverture commerciale.

Le back-office distingue une présence visible et connectée d’un temps de visionnage vérifié. Ses alertes sont des signaux limités aux événements intégrés et ne constituent pas un système exhaustif de détection d’intrusion.

Voir le README et les guides `docs/BACKEND_SETUP.md` et `docs/AUTH_SETUP.md` pour le périmètre actuel, les configurations et les validations encore requises.
