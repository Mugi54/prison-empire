# PRISON EMPIRE

Jeu de gestion pénitentiaire en vue isométrique, jouable dans le navigateur (ordinateur, souris + clavier).
React + TypeScript + Vite, rendu Canvas 2D, sauvegardes IndexedDB. Aucune ressource externe : tout est dessiné par le code.

## Lancer le jeu

```bash
npm install
npm run dev          # http://localhost:5173
```

Autres commandes :

| Commande | Effet |
|---|---|
| `npm run build` puis `npm run preview` | Version de production (avec service worker pour le jeu hors connexion) |
| `npm run build:single` | Tout le jeu dans **un seul fichier** `dist-single/index.html`, jouable par double-clic |
| `npm test` | Tests du moteur (Vitest) |
| `npx vite-node scripts/calib.ts` | Simulation sans interface de 10 jours par établissement (équilibrage, performances) |

## Commandes en jeu

- **Glisser** : déplacer la caméra (clic droit-glisser quand un outil est actif) · **Molette** : zoom · **Flèches / ZQSD** : déplacement
- **Clic** : sélectionner un personnage, une salle ou un équipement
- **Espace** : pause · **1 / 2 / 3** : vitesse · **Échap / clic droit** : annuler l'outil

## Architecture

```
src/
  engine/          Moteur de simulation — aucun import de React ni du DOM
    types.ts         État de jeu (objet JSON pur, directement sérialisable)
    data.ts          Catalogues : salles, mobilier, métiers, programmes, noms
    rooms.ts         Données dérivées de la carte : grilles, chemins (BFS), état des salles
    construction.ts  Salles, portes, mobilier, murs, redimensionnement, démolition
    inmates.ts       Détenus : besoins, routines, déplacements, relations, arrivées/libérations
    staff.ts         Personnel : recrutement, horaires, affectation, fatigue, carrière
    economy.ts       Revenus/dépenses continus, clôture quotidienne, dettes, contrats
    security.ts      Couverture, tension, incidents et réponses
    events.ts        Événements dynamiques conditionnés par l'état réel, inspection
    research.ts      Arbre de recherche (4 branches, 20 projets)
    progression.ts   Missions de carrière, scénarios, réputation, statistiques
    setup.ts         Nouvelle partie : établissements, scénarios, bac à sable
    simulation.ts    Boucle (1 tick = 1 minute de jeu), horloge, calendrier
  render/renderer.ts Rendu isométrique (tri en profondeur, personnages, aperçus)
  save/db.ts         IndexedDB : emplacements, sauvegarde auto, migrations de version
  ui/                Interface React (contrôleur, carte, panneaux, fiches, menu)
tests/engine.test.ts Tests des systèmes essentiels
```

Principes :

- **Le moteur est indépendant de l'interface.** `tick(state)` fait avancer la partie d'une minute ; il tourne aussi bien dans Node (tests, `calib.ts`) que dans le navigateur.
- **La simulation ne s'arrête pas quand un menu est ouvert** : elle est pilotée par un minuteur du contrôleur, pas par l'affichage.
- **Performances** : déplacements à chaque minute (peu coûteux) ; besoins et décisions calculés pour un cinquième de la population par minute ; chemins par champs de distance mis en cache par salle ; rendu interpolé entre deux ticks. Mesuré : ~1,2 s de calcul par *journée de jeu* pour 1 000 détenus (moteur seul).
- **Aléatoire déterministe** : la graine vit dans la sauvegarde, une partie rechargée reprend exactement la même simulation (testé).

## Ce que contient cette version

- Menu principal, trois modes : **Carrière** (4 établissements, 8 missions enchaînées, catégories), **Scénarios** (6, avec objectifs/délai/échec), **Bac à sable** (budget, terrain, détenus, difficulté, dotations, événements, règles).
- **Construction** : 25 types de salles en 5 catégories, 27 équipements, portes, murs d'enceinte, redimensionnement, déplacement du mobilier, suppression avec remboursement, aperçu et coût avant validation. Une salle n'est opérationnelle qu'avec porte + mobilier requis + personnel affecté (+ recherche éventuelle).
- **Détenus** individuels : identité, portrait, personnalité (7), profil, dossier, 8 besoins, état psychologique, compétences, relations (amitiés, rivalités, alliances, conflits), historique, routine selon un **régime quotidien modifiable** heure par heure.
- **Personnel** : 9 métiers, recrutement, licenciement, formation, augmentation, promotion, congés, horaires, affectation, fatigue, satisfaction, démissions.
- **Économie** : 5 sources de revenus, 12 postes de dépenses, tableau de bord, historique, prévisions, emprunts, contrats, conséquences progressives du déficit.
- **Sécurité** : couverture (surveillants, postes, caméras), rondes, confinement général, fouilles, objets interdits ; 7 types d'incidents avec plusieurs réponses aux conséquences différentes.
- **Événements** : 10 événements à choix multiples + inspection périodique notée sur l'état réel.
- **Réinsertion** : 6 programmes, inscriptions automatiques ou individuelles, effet sur les libérations et la réputation.
- **Recherche** : arbre visuel, 4 branches × 5 projets.
- **Sauvegardes** : automatique (chaque jour de jeu + onglet masqué), 5 emplacements manuels, chargement, suppression, version de format et migration.

## Simplifications assumées (à faire évoluer)

- Les travaux sont **instantanés** : pas de stock de matériaux ni d'ouvriers. Les « besoins » d'une salle sont son mobilier, son personnel et son coût d'entretien.
- Tout le mobilier occupe une case, sans rotation ; les personnages peuvent traverser le mobilier.
- Le personnel hors service quitte la carte (pas de vie privée simulée).
- L'équilibrage a été réglé par simulations automatiques de 10–12 jours, pas par de longues parties humaines : les scénarios sont vérifiés au démarrage et à l'échec, **leur difficulté réelle reste à ajuster en jouant**.
- Le rendu n'a été vérifié en navigateur que jusqu'à ~90 détenus ; au-delà, seul le moteur a été mesuré.
- Pas de son, pas de support tactile, pas de tests automatisés de l'interface dans `npm test` (les scripts `scripts/e2e*.cjs` sont des vérifications Playwright manuelles sur `npm run preview`).

## Feuille de route

1. Chantiers avec durée, ouvriers et matériaux ; mobilier multi-cases et rotation.
2. Zones de sécurité par niveau, quartiers dédiés par profil de détenu, visites et parloirs.
3. Équilibrage approfondi des scénarios et de la carrière longue ; nouveaux événements en chaîne.
4. Rendu : LOD par lots au-delà de 500 personnages, animations d'activité, ambiance sonore.
