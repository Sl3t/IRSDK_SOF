# IRSDK SOF Agent — Plan de Projet Complet

> **Version** : 1.0 — 2026-02-07
> **Statut** : En attente de validation et compléments d'information
> **Stack** : HTML / CSS / JS / PHP + Bridge Node.js (IRSDK)

---

## Table des matières

- [A. Architecture Générale](#a-architecture-générale)
- [B. Module 1 — Bridge IRSDK (Node.js)](#b-module-1--bridge-irsdk-nodejs)
- [C. Module 2 — Backend PHP](#c-module-2--backend-php)
- [D. Module 3 — Base de données](#d-module-3--base-de-données)
- [E. Module 4 — Moteur de calcul SOF](#e-module-4--moteur-de-calcul-sof)
- [F. Module 5 — Moteur de décision Race/NoRace](#f-module-5--moteur-de-décision-racenorace)
- [G. Module 6 — Interface Frontend](#g-module-6--interface-frontend)
- [H. Module 7 — Intégration API REST iRacing (historique)](#h-module-7--intégration-api-rest-iracing-historique)
- [I. Arborescence fichiers prévue](#i-arborescence-fichiers-prévue)
- [J. Informations en attente](#j-informations-en-attente)

---

## A. Architecture Générale

```
┌─────────────────────────────────────────────────────────────┐
│                   PC Windows (iRacing)                       │
│                                                              │
│  ┌──────────┐    Mémoire     ┌──────────────────┐           │
│  │ iRacing  │───partagée────▶│  Bridge Node.js  │           │
│  │   Sim    │                │  (irsdk-node)    │           │
│  └──────────┘                └────────┬─────────┘           │
│                                       │ WebSocket           │
│                                       │ ws://localhost:8182  │
│                                       ▼                      │
│                              ┌──────────────────┐           │
│  ┌──────────────┐            │  Serveur PHP     │           │
│  │  Navigateur  │◀──HTTP────▶│  (localhost)     │           │
│  │  (UI Web)    │            │                  │           │
│  │              │◀──WS──────▶│  + WebSocket     │           │
│  └──────────────┘            │    proxy/relay   │           │
│         ▲                    └────────┬─────────┘           │
│         │                             │                      │
│         │                    ┌────────▼─────────┐           │
│         │                    │  Base de données  │           │
│         │                    │  (MDB — à définir)│           │
│         │                    └──────────────────┘           │
│         │                             │                      │
│         │                    ┌────────▼─────────┐           │
│         │                    │  iRacing Data API │           │
│         └────────────────────│  (REST - historique)│         │
│                              └──────────────────┘           │
└─────────────────────────────────────────────────────────────┘
```

### A.1 — Flux de données principal
1. iRacing sim écrit les données en mémoire partagée
2. Le bridge Node.js lit l'IRSDK et émet via WebSocket
3. Le frontend JS se connecte au WebSocket et reçoit les données live
4. PHP gère la logique métier, le stockage en BDD, et l'API REST iRacing

### A.2 — Prérequis machine
- Windows 10/11 avec iRacing installé
- Node.js (v18+ recommandé)
- PHP 8.x (via WAMP, XAMPP ou Laragon)
- Navigateur moderne (Chrome, Firefox, Edge)

> **⚠️ INFO ATTENDUE [A.2]** : Quel serveur local PHP utilisez-vous ? (WAMP / XAMPP / Laragon / autre) et quelle version de PHP ?

---

## B. Module 1 — Bridge IRSDK (Node.js)

### B.1 — Rôle
Processus léger Node.js qui tourne en arrière-plan et sert de pont entre l'IRSDK (mémoire partagée) et l'application web.

### B.2 — Fonctionnalités
| ID | Fonctionnalité | Détail |
|----|----------------|--------|
| B.2.1 | Connexion IRSDK | Détection automatique quand iRacing est lancé / en session |
| B.2.2 | Lecture DriverInfo | Extraction de tous les pilotes : `UserName`, `UserID`, `IRating`, `LicLevel`, `LicSubLevel`, `LicString`, `CarNumber`, `CarPath`, `CarClassID`, `IsSpectator`, `CarIsAI` |
| B.2.3 | Lecture SessionInfo | Type de session (`Practice`, `Qualifying`, `Race`), nom, numéro |
| B.2.4 | Détection session officielle | Distinction officiel vs hosted vs test |
| B.2.5 | Serveur WebSocket | Écoute sur `ws://localhost:8182` |
| B.2.6 | Émission temps réel | Push des données à chaque mise à jour de l'IRSDK (quand un pilote entre/sort) |
| B.2.7 | Heartbeat / statut | Indicateur de connexion iRacing active ou non |
| B.2.8 | Auto-reconnexion | Si iRacing redémarre ou change de session, le bridge se reconnecte |

### B.3 — Format des messages WebSocket (JSON)

```json
{
  "type": "session_update",
  "timestamp": "2026-02-07T19:30:00Z",
  "connection": {
    "iracing_running": true,
    "in_session": true
  },
  "session": {
    "session_type": "Practice",
    "session_name": "PRACTICE",
    "session_num": 0,
    "is_official": true,
    "series_name": "VRS GT Sprint Series",
    "track_name": "Spa-Francorchamps",
    "car_class": "GT3"
  },
  "drivers": [
    {
      "car_idx": 0,
      "user_id": 12345,
      "user_name": "John Doe",
      "irating": 2500,
      "license": "B 3.45",
      "lic_level": 12,
      "lic_sub_level": 345,
      "car_number": "42",
      "car_name": "BMW M4 GT3",
      "car_class_id": 1,
      "is_spectator": false,
      "is_ai": false,
      "club_name": "France",
      "division": "Division 2",
      "incidents": 0
    }
  ],
  "sof": {
    "value": 2347,
    "driver_count": 24,
    "min_irating": 1200,
    "max_irating": 4500,
    "median_irating": 2200
  }
}
```

### B.4 — Package Node.js utilisé
- `irsdk-node` (natif C++, TypeScript, actif) ou `node-irsdk` (legacy mais éprouvé)

> **⚠️ INFO ATTENDUE [B.4]** : Node.js est-il déjà installé sur votre PC ? Si oui, quelle version (`node -v`) ?

### B.5 — Lancement
- Script `npm start` ou fichier `.bat` pour lancer en un clic
- Option : démarrage automatique avec Windows (tâche planifiée)

---

## C. Module 2 — Backend PHP

### C.1 — Rôle
Gestion de la logique métier, persistance en base de données, et proxy vers l'API REST iRacing.

### C.2 — Endpoints PHP (API interne)

| ID | Endpoint | Méthode | Description |
|----|----------|---------|-------------|
| C.2.1 | `/api/session/current` | GET | Retourne la session en cours (données live via bridge) |
| C.2.2 | `/api/session/history` | GET | Historique des sessions enregistrées |
| C.2.3 | `/api/sof/calculate` | POST | Calcul SOF à partir d'une liste d'iRatings |
| C.2.4 | `/api/decision/evaluate` | POST | Évaluation race/no-race avec les critères |
| C.2.5 | `/api/driver/me` | GET | Profil du pilote principal (iRating, SR, historique) |
| C.2.6 | `/api/driver/stats` | GET | Stats détaillées depuis l'API iRacing |
| C.2.7 | `/api/iracing/auth` | POST | Authentification OAuth2 vers l'API iRacing |
| C.2.8 | `/api/settings` | GET/POST | Configuration de l'application |

### C.3 — Logique côté serveur
| ID | Fonctionnalité | Détail |
|----|----------------|--------|
| C.3.1 | Réception WebSocket | PHP relaie ou le JS se connecte directement au bridge |
| C.3.2 | Persistance session | À chaque nouvelle session détectée, enregistrement en BDD |
| C.3.3 | Calcul SOF | Logique de calcul (voir Module 4) |
| C.3.4 | Moteur de décision | Logique go/no-go (voir Module 5) |
| C.3.5 | Cache iRacing API | Mise en cache des appels API REST pour éviter le rate-limiting |
| C.3.6 | Gestion config | Stockage des préférences utilisateur (seuils, objectifs iRating...) |

---

## D. Module 3 — Base de données

### D.1 — Type de BDD

> **⚠️ INFO ATTENDUE [D.1]** : Quand vous dites "MDB", précisez :
> - **(a)** Microsoft Access (.mdb / .accdb)
> - **(b)** MariaDB / MySQL
> - **(c)** MongoDB
> - **(d)** Autre

### D.2 — Schéma prévu (tables/collections)

#### D.2.1 — `drivers` (Pilotes)
| Champ | Type | Description |
|-------|------|-------------|
| id | INT (PK, auto) | Identifiant interne |
| iracing_user_id | INT (unique) | ID iRacing du pilote |
| user_name | VARCHAR(100) | Nom iRacing |
| current_irating | INT | Dernier iRating connu |
| current_sr | DECIMAL(4,2) | Dernier Safety Rating connu |
| license_class | VARCHAR(10) | Classe de licence (R, D, C, B, A, Pro) |
| club_name | VARCHAR(50) | Club/pays |
| division | VARCHAR(20) | Division |
| is_me | BOOLEAN | Marqueur "c'est moi" |
| updated_at | DATETIME | Dernière mise à jour |

#### D.2.2 — `sessions` (Sessions enregistrées)
| Champ | Type | Description |
|-------|------|-------------|
| id | INT (PK, auto) | Identifiant interne |
| iracing_subsession_id | INT | ID subsession iRacing |
| session_type | VARCHAR(20) | Practice / Qualifying / Race |
| is_official | BOOLEAN | Session officielle ou non |
| series_name | VARCHAR(100) | Nom de la série |
| track_name | VARCHAR(100) | Circuit |
| car_class | VARCHAR(50) | Classe de voiture |
| sof | INT | Strength of Field calculé |
| driver_count | INT | Nombre de pilotes |
| min_irating | INT | iRating minimum |
| max_irating | INT | iRating maximum |
| median_irating | INT | iRating médian |
| my_irating_at_time | INT | Mon iRating au moment de la session |
| decision | VARCHAR(10) | GO / SKIP / NULL (si pas encore décidé) |
| decision_score | DECIMAL(5,2) | Score de recommandation |
| created_at | DATETIME | Date/heure de détection |

#### D.2.3 — `session_drivers` (Pilotes par session)
| Champ | Type | Description |
|-------|------|-------------|
| id | INT (PK, auto) | Identifiant interne |
| session_id | INT (FK) | Référence vers sessions |
| driver_id | INT (FK) | Référence vers drivers |
| irating | INT | iRating au moment de la session |
| license_string | VARCHAR(10) | Licence au moment de la session |
| car_number | VARCHAR(10) | Numéro de voiture |
| car_name | VARCHAR(100) | Nom de la voiture |
| finish_position | INT | Position finale (si course terminée) |
| incidents | INT | Nombre d'incidents |

#### D.2.4 — `irating_history` (Historique iRating personnel)
| Champ | Type | Description |
|-------|------|-------------|
| id | INT (PK, auto) | Identifiant interne |
| irating | INT | Valeur iRating |
| sr | DECIMAL(4,2) | Safety Rating |
| series_name | VARCHAR(100) | Série |
| track_name | VARCHAR(100) | Circuit |
| sof | INT | SOF de la course |
| finish_position | INT | Position finale |
| irating_change | INT | Gain/perte d'iRating |
| recorded_at | DATETIME | Date |

#### D.2.5 — `settings` (Configuration)
| Champ | Type | Description |
|-------|------|-------------|
| key | VARCHAR(50) (PK) | Clé du paramètre |
| value | TEXT | Valeur |
| updated_at | DATETIME | Dernière modification |

**Paramètres prévus dans settings :**
- `my_iracing_user_id` — Votre ID iRacing
- `irating_target` — Objectif iRating
- `sr_minimum` — SR minimum pour engager
- `sof_ratio_threshold` — Seuil ratio SOF/iRating perso
- `iracing_oauth_client_id` — OAuth2 client ID
- `iracing_oauth_client_secret` — OAuth2 secret (chiffré)

> **⚠️ INFO ATTENDUE [D.2]** : Éléments de connexion BDD (host, port, nom de base, user, password)

---

## E. Module 4 — Moteur de calcul SOF

### E.1 — Formule SOF standard
```
SOF = Σ(iRating de chaque pilote non-spectateur, non-IA, non-pacecar) / nombre de pilotes
```

### E.2 — Données complémentaires calculées
| ID | Donnée | Formule |
|----|--------|---------|
| E.2.1 | SOF (moyenne) | Moyenne arithmétique des iRatings |
| E.2.2 | SOF médian | Valeur médiane des iRatings |
| E.2.3 | Écart-type | Dispersion des iRatings (champ homogène ou hétérogène) |
| E.2.4 | Min / Max | Bornes du champ |
| E.2.5 | Distribution | Répartition par tranches (0-1k, 1k-2k, 2k-3k, 3k-4k, 4k+) |
| E.2.6 | Mon rang estimé | Position de mon iRating dans le classement des iRatings |
| E.2.7 | Percentile | Mon percentile dans le champ |

### E.3 — Recalcul dynamique
Le SOF est recalculé **à chaque événement** :
- Un pilote rejoint la session → recalcul
- Un pilote quitte la session → recalcul
- Fréquence max : toutes les 2 secondes (anti-spam)

> **⚠️ QUESTION [E.3]** : Voulez-vous le SOF "officiel iRacing" (moyenne simple) ou une version pondérée plus sophistiquée ?

---

## F. Module 5 — Moteur de décision Race/NoRace

### F.1 — Critères de décision proposés

| ID | Critère | Poids par défaut | Description |
|----|---------|-------------------|-------------|
| F.1.1 | Ratio SOF / Mon iRating | 30% | Si SOF << mon iRating → favorable. Si SOF >> mon iRating → défavorable |
| F.1.2 | Position estimée dans le champ | 20% | Basé sur le rang de mon iRating vs les autres |
| F.1.3 | Gain/Perte iRating probable | 20% | Estimation du delta iRating selon ma position probable |
| F.1.4 | Safety Rating actuel | 15% | Si SR est bas, risque accru de relégation |
| F.1.5 | Nombre de participants | 10% | Champ plein = plus compétitif mais plus d'iRating en jeu |
| F.1.6 | Écart-type du champ | 5% | Champ homogène = course plus serrée |

### F.2 — Score de recommandation
- **Score 0-100** calculé à partir des critères pondérés
- **Seuils** :
  - 70-100 : **GO** — Conditions favorables
  - 40-69 : **NEUTRE** — À vous de juger
  - 0-39 : **SKIP** — Conditions défavorables

### F.3 — Affichage de la recommandation
- Indicateur visuel type jauge/feu tricolore
- Détail de chaque critère avec son score individuel
- Texte explicatif généré ("SOF en dessous de votre iRating, bonne opportunité de gain")

### F.4 — Estimation gain/perte iRating

> **⚠️ QUESTION [F.4]** : Voulez-vous une estimation du gain/perte d'iRating selon différents scénarios de résultat ? Exemple :
> - "Si vous finissez P1 → +85 iRating"
> - "Si vous finissez P10 → +12 iRating"
> - "Si vous finissez P20 → -45 iRating"
>
> (Cela nécessite d'implémenter la formule Elo/Glicko d'iRacing, qui est approximative mais assez fiable)

> **⚠️ QUESTION [F.1]** : Voulez-vous ajouter/modifier/supprimer des critères ? Des poids différents ?

---

## G. Module 6 — Interface Frontend

### G.1 — Pages / Vues

| ID | Page | Description |
|----|------|-------------|
| G.1.1 | **Dashboard principal** | Vue temps réel : session en cours, liste pilotes, SOF, recommandation |
| G.1.2 | **Détail session** | Grille complète des pilotes, distribution iRating, statistiques |
| G.1.3 | **Historique sessions** | Liste des sessions passées avec SOF, décisions prises, résultats |
| G.1.4 | **Mon profil / Stats** | Évolution iRating, SR, graphiques, tendances |
| G.1.5 | **Réglages** | Configuration (ID pilote, seuils, connexion BDD, OAuth2) |

### G.2 — Dashboard principal (G.1.1) — Composants détaillés

| ID | Composant | Description |
|----|-----------|-------------|
| G.2.1 | **Barre de statut connexion** | Indicateur live : iRacing connecté / déconnecté / en session |
| G.2.2 | **Info session** | Série, circuit, type (Practice/Quali/Race), officiel/hosted |
| G.2.3 | **Jauge SOF** | Affichage visuel du SOF avec positionnement de mon iRating |
| G.2.4 | **Compteur pilotes** | Nombre de pilotes actuellement en session (live) |
| G.2.5 | **Recommandation GO/SKIP** | Indicateur principal avec score et couleur |
| G.2.6 | **Liste des pilotes** | Tableau triable : nom, iRating, licence, voiture, n° |
| G.2.7 | **Distribution iRating** | Graphique (barres ou histogramme) de la répartition |
| G.2.8 | **Estimation résultats** | Tableau "si je finis Px → delta iRating" |
| G.2.9 | **Ticker temps réel** | Log des événements (pilote rejoint, pilote quitte, SOF recalculé) |

### G.3 — Design & Thème

| ID | Aspect | Description |
|----|--------|-------------|
| G.3.1 | **Thème général** | Dark mode racing |
| G.3.2 | **Palette couleurs** | À définir |
| G.3.3 | **Typographie** | Police racing/sport (ex: Rajdhani, Orbitron, Exo 2) |
| G.3.4 | **Animations** | Transitions fluides, effets glow sur les données live |
| G.3.5 | **Responsive** | Mobile-first : téléphone, tablette, desktop, second écran |
| G.3.6 | **Graphiques** | Chart.js ou ApexCharts pour les visualisations |

> **⚠️ INFO ATTENDUE [G.3.1]** : Avez-vous des références visuelles ? Sites, apps, screenshots dont vous aimez le style ?

> **⚠️ INFO ATTENDUE [G.3.2]** : Palette couleurs souhaitée ?
> - (a) Noir / Rouge racing classique
> - (b) Noir / Bleu iRacing
> - (c) Noir / Vert néon cyberpunk
> - (d) Noir / Orange McLaren
> - (e) Autre — précisez

> **⚠️ QUESTION [G.3.5]** : Quel usage principal en responsive ?
> - (a) Second écran à côté du PC iRacing (priorité desktop)
> - (b) Téléphone posé à côté (priorité mobile)
> - (c) Tablette
> - (d) Tous les trois

> **⚠️ QUESTION [G.2]** : Voulez-vous ajouter/modifier/supprimer des composants du dashboard ?

---

## H. Module 7 — Intégration API REST iRacing (historique)

### H.1 — Authentification
- OAuth2 (obligatoire depuis décembre 2025)
- Stockage sécurisé des tokens en BDD (table `settings`)
- Refresh automatique du token

### H.2 — Endpoints iRacing utilisés

| ID | Endpoint iRacing | Usage dans l'app |
|----|------------------|------------------|
| H.2.1 | `/data/member/get` | Récupérer mon profil (iRating, SR) |
| H.2.2 | `/data/member/chart_data` | Historique iRating pour les graphiques |
| H.2.3 | `/data/stats/member_recent_races` | Dernières courses (résultats, gain/perte) |
| H.2.4 | `/data/results/get` | Détail d'une subsession passée |
| H.2.5 | `/data/season/race_guide` | Prochaines courses disponibles |
| H.2.6 | `/data/series/get` | Infos séries (nom, catégorie) |
| H.2.7 | `/data/lookup/drivers` | Recherche de pilotes |

### H.3 — Cache & Rate Limiting
- Cache local des réponses API (durée configurable)
- Respect du rate limiting iRacing
- Appels batch quand possible

> **⚠️ INFO ATTENDUE [H.1]** : Avez-vous déjà des credentials OAuth2 iRacing ? Sinon, il faudra les demander via le support iRacing.

---

## I. Arborescence fichiers prévue

```
IRSDK_SOF/
│
├── projet.md                      # Ce fichier
├── .gitattributes                 # Existant
│
├── bridge/                        # MODULE 1 — Bridge Node.js
│   ├── package.json
│   ├── server.js                  # Serveur WebSocket principal
│   ├── irsdk-reader.js            # Lecture IRSDK + parsing
│   ├── session-parser.js          # Parsing SessionInfo
│   ├── driver-parser.js           # Parsing DriverInfo
│   └── start.bat                  # Lanceur Windows
│
├── api/                           # MODULE 2 — Backend PHP
│   ├── config.php                 # Configuration BDD + constantes
│   ├── db.php                     # Connexion base de données
│   ├── session/
│   │   ├── current.php            # GET — session en cours
│   │   └── history.php            # GET — historique sessions
│   ├── sof/
│   │   └── calculate.php          # POST — calcul SOF
│   ├── decision/
│   │   └── evaluate.php           # POST — évaluation go/no-go
│   ├── driver/
│   │   ├── me.php                 # GET — mon profil
│   │   └── stats.php              # GET — stats détaillées
│   ├── iracing/
│   │   ├── auth.php               # POST — OAuth2 iRacing
│   │   └── proxy.php              # GET — proxy API iRacing
│   └── settings/
│       └── index.php              # GET/POST — configuration
│
├── db/                            # MODULE 3 — Base de données
│   └── schema.sql                 # Script de création du schéma
│
├── css/                           # MODULE 6 — Styles
│   ├── main.css                   # Styles principaux
│   ├── dashboard.css              # Styles dashboard
│   ├── components.css             # Composants réutilisables
│   ├── responsive.css             # Media queries
│   └── animations.css             # Animations et transitions
│
├── js/                            # MODULE 6 — JavaScript Frontend
│   ├── app.js                     # Point d'entrée, routeur
│   ├── websocket.js               # Connexion WebSocket au bridge
│   ├── sof-engine.js              # Calcul SOF côté client (temps réel)
│   ├── decision-engine.js         # Moteur de décision côté client
│   ├── charts.js                  # Graphiques (distribution, historique)
│   ├── components/
│   │   ├── status-bar.js          # Barre de statut connexion
│   │   ├── sof-gauge.js           # Jauge SOF
│   │   ├── driver-grid.js         # Grille des pilotes
│   │   ├── decision-panel.js      # Panneau recommandation
│   │   ├── irating-chart.js       # Graphique distribution
│   │   └── event-ticker.js        # Ticker temps réel
│   └── utils/
│       ├── api.js                 # Appels API PHP
│       └── formatters.js          # Formatage nombres, dates
│
├── assets/                        # Ressources statiques
│   ├── fonts/                     # Polices racing
│   └── img/                       # Images, icônes, logos
│
├── index.html                     # Page principale (SPA)
├── history.html                   # Page historique
├── stats.html                     # Page stats/profil
└── settings.html                  # Page réglages
```

---

## J. Informations en attente

Récapitulatif de tout ce dont j'ai besoin pour avancer :

### Obligatoire (bloquant)

| Ref | Question | Votre réponse |
|-----|----------|---------------|
| **[A.2]** | Serveur PHP local (WAMP/XAMPP/Laragon) + version PHP ? | ___________ |
| **[B.4]** | Node.js installé ? Version ? | ___________ |
| **[D.1]** | Type de BDD "MDB" : Access / MariaDB / MongoDB / Autre ? | ___________ |
| **[D.2]** | Éléments de connexion BDD (host, port, base, user, pass) | ___________ |

### Important (influence le développement)

| Ref | Question | Votre réponse |
|-----|----------|---------------|
| **[G.3.2]** | Palette couleurs ? (noir/rouge, noir/bleu, néon, orange, autre) | ___________ |
| **[G.3.5]** | Usage responsive prioritaire ? (desktop, mobile, tablette, tous) | ___________ |
| **[H.1]** | Credentials OAuth2 iRacing disponibles ? | ___________ |

### Optionnel (personnalisation)

| Ref | Question | Votre réponse |
|-----|----------|---------------|
| **[E.3]** | SOF officiel (moyenne simple) ou version pondérée ? | ___________ |
| **[F.1]** | Critères de décision OK ? Modifications ? | ___________ |
| **[F.4]** | Estimation gain/perte iRating par position souhaitée ? | ___________ |
| **[G.2]** | Composants dashboard OK ? Ajouts/modifications ? | ___________ |
| **[G.3.1]** | Références visuelles / sites dont vous aimez le style ? | ___________ |

---

> **Note** : Ce plan sera mis à jour au fur et à mesure de vos réponses.
> Chaque section indexée (A.1, B.2.3, G.2.5, etc.) peut être référencée directement dans vos retours.
