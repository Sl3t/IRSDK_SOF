# IRSDK SOF Agent — Plan de Projet Complet

> **Version** : 2.1 — 2026-02-22
> **Statut** : EN DÉVELOPPEMENT
> **Stack** : HTML / CSS / JS / PHP + Bridge Node.js (IRSDK)
> **Serveur** : Laragon (PHP 8.x + Apache) sur SIM PC 1
> **BDD** : Microsoft Access (.mdb) via ODBC
> **Design** : Dark cockpit SimHub — palette validée

---

## Table des matières

- [A. Architecture Générale](#a-architecture-générale)
- [B. Module 1 — Bridge IRSDK (Node.js)](#b-module-1--bridge-irsdk-nodejs)
- [C. Module 2 — Backend PHP](#c-module-2--backend-php)
- [D. Module 3 — Base de données](#d-module-3--base-de-données)
- [E. Module 4 — Moteur de calcul SOF](#e-module-4--moteur-de-calcul-sof)
- [F. Module 5 — Moteur de décision GO/NO-GO](#f-module-5--moteur-de-décision-gonogo)
- [G. Module 6 — Analyse approfondie des pilotes](#g-module-6--analyse-approfondie-des-pilotes)
- [H. Module 7 — Interface Frontend](#h-module-7--interface-frontend)
- [I. Module 8 — Intégration API REST iRacing](#i-module-8--intégration-api-rest-iracing)
- [J. Arborescence fichiers prévue](#j-arborescence-fichiers-prévue)
- [K. Informations en attente](#k-informations-en-attente)

---

## A. Architecture Générale

### A.1 — Setup physique : 2 simulateurs + accès tablette/mobile

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        RÉSEAU LOCAL                                      │
│                                                                          │
│  ┌─────────────────────────┐     ┌─────────────────────────┐            │
│  │    SIM PC 1 (serveur)   │     │      SIM PC 2           │            │
│  │                         │     │                         │            │
│  │  iRacing Simulator      │     │  iRacing Simulator      │            │
│  │         │                │     │                         │            │
│  │    Mémoire partagée     │     │  (pas d'installation    │            │
│  │         │                │     │   supplémentaire)       │            │
│  │         ▼                │     │                         │            │
│  │  ┌─────────────────┐   │     └─────────────────────────┘            │
│  │  │ Bridge Node.js  │   │                                             │
│  │  │ (IRSDK → WS)    │   │                                             │
│  │  └────────┬────────┘   │                                             │
│  │           │ WebSocket   │                                             │
│  │           ▼             │                                             │
│  │  ┌─────────────────┐   │                                             │
│  │  │  Serveur PHP     │   │     ┌─────────────┐  ┌─────────────┐      │
│  │  │  (WAMP/XAMPP)    │◀──┼─────│  Tablette   │  │  Téléphone  │      │
│  │  │                  │   │     │  (navigateur)│  │  (navigateur)│      │
│  │  └────────┬─────────┘   │     └─────────────┘  └─────────────┘      │
│  │           │              │                                            │
│  │  ┌────────▼─────────┐   │                                            │
│  │  │  Base de données  │   │                                            │
│  │  └────────┬─────────┘   │                                            │
│  │           │              │                                            │
│  │  ┌────────▼─────────┐   │                                            │
│  │  │ iRacing Data API │   │                                            │
│  │  │ (REST / OAuth2)  │   │                                            │
│  │  └──────────────────┘   │                                            │
│  └─────────────────────────┘                                            │
└──────────────────────────────────────────────────────────────────────────┘
```

### A.2 — Deux sources de données complémentaires

| Source | Installée sur | Données | Temps réel ? |
|--------|--------------|---------|:---:|
| **IRSDK** (mémoire partagée) | SIM PC 1 uniquement | Pilotes en session, temp piste, temp air, adhérence, état piste, météo live | **Oui** |
| **iRacing Data API** (REST) | Appel depuis le serveur PHP | Historique, résultats, profils pilotes, séries, calendrier, temps au tour | Non (historique) |

### A.3 — Flux de données

```
                    DONNÉES LIVE (IRSDK)                    DONNÉES HISTORIQUES (API REST)
                          │                                           │
     Temp piste, temp air │                                           │ Profils pilotes
     Adhérence, wetness   │                                           │ Résultats passés
     Pilotes en session   │                                           │ Temps au tour
     Type de session      │                                           │ Séries / calendrier
                          ▼                                           ▼
                 ┌─────────────────────────────────────────────────────────┐
                 │                    SERVEUR PHP                          │
                 │                                                         │
                 │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
                 │  │ Moteur SOF   │  │ Analyse      │  │ Moteur       │  │
                 │  │ (calcul)     │  │ Pilotes      │  │ Décision     │  │
                 │  └──────────────┘  └──────────────┘  └──────────────┘  │
                 │                          │                              │
                 │                  ┌───────▼────────┐                     │
                 │                  │  Base de données │                    │
                 │                  └────────────────┘                     │
                 └─────────────────────────┬───────────────────────────────┘
                                           │
                                    ┌──────▼──────┐
                                    │  INTERFACE   │
                                    │  WEB         │
                                    │              │
                                    │  GO 73%      │
                                    │  ██████░░░   │
                                    └─────────────┘
                                     Tablette / Tel
                                     / PC / 2nd écran
```

### A.4 — Prérequis machine

**SIM PC 1 (serveur) :**
- Windows 10/11 avec iRacing installé
- Node.js (v18+ recommandé) — pour le bridge IRSDK
- PHP 8.x (via WAMP, XAMPP ou Laragon) — pour le serveur web
- Base de données (type à confirmer)

**SIM PC 2 :**
- Rien à installer — accès via navigateur web sur le réseau local

**Tablette / Téléphone :**
- Navigateur web moderne — accès via `http://[IP_SIM_PC_1]`

> **⚠️ INFO ATTENDUE [A.4a]** : Quel serveur local PHP utilisez-vous ? (WAMP / XAMPP / Laragon / autre) et quelle version de PHP ?
> **⚠️ INFO ATTENDUE [A.4b]** : Node.js est-il déjà installé sur le SIM PC 1 ? Si oui, quelle version (`node -v`) ?

---

## B. Module 1 — Bridge IRSDK (Node.js)

### B.1 — Rôle
Processus léger Node.js qui tourne en arrière-plan **sur le SIM PC 1** et sert de pont entre l'IRSDK (mémoire partagée) et l'application web. Il capture les données **que l'API REST ne peut pas fournir**.

### B.2 — Données capturées (exclusives IRSDK)

#### B.2.1 — Conditions de piste et météo live

| Variable IRSDK | Type | Description | Importance décision |
|----------------|------|-------------|:---:|
| `TrackSurfaceTemp` | float (°C) | **Température de la surface de piste** | 🔴 Critique |
| `AirTemp` | float (°C) | **Température de l'air** au start/finish | 🔴 Critique |
| `TrackWetness` | enum | **Niveau d'humidité/adhérence de la piste** (sec → détrempé) | 🔴 Critique |
| `TrackDynamicTrack` | - | **Évolution du grip** (rubber buildup, marbles) | 🟠 Important |
| `WeatherDeclaredWet` | bool | **Piste déclarée mouillée** (pneus pluie autorisés) | 🔴 Critique |
| `Skies` | enum | Couverture nuageuse (0=clear, 1=partly, 2=mostly, 3=overcast) | 🟡 Utile |
| `WeatherType` | enum | Type météo (0=constant, 1=dynamique) | 🟡 Utile |
| `AirDensity` | float (kg/m³) | Densité de l'air | 🟢 Bonus |
| `AirPressure` | float (Hg) | Pression atmosphérique | 🟢 Bonus |
| `RelativeHumidity` | float (%) | Humidité relative | 🟡 Utile |
| `FogLevel` | float (%) | Niveau de brouillard | 🟡 Utile |
| `WindVel` | float (m/s) | Vitesse du vent | 🟡 Utile |
| `WindDir` | float (rad) | Direction du vent | 🟡 Utile |

#### B.2.2 — Informations de session live

| Variable IRSDK | Description |
|----------------|-------------|
| `SessionInfo.Sessions[]` | Type de session active (Practice, Qualifying, Race) |
| `SessionInfo.Sessions[].SessionType` | Distinction officiel / hosted / test |
| `WeekendInfo.TrackName` | Circuit actuel |
| `WeekendInfo.SeriesDisplayName` | Série en cours |

#### B.2.3 — Liste des pilotes en session (temps réel)

| Champ IRSDK (DriverInfo.Drivers[]) | Description |
|-------------------------------------|-------------|
| `UserName` | Nom du pilote |
| `UserID` | ID iRacing unique |
| `IRating` | iRating actuel |
| `LicLevel` / `LicSubLevel` / `LicString` | Licence (ex: "B 3.45") |
| `CarNumber` | Numéro de voiture |
| `CarPath` / `CarScreenName` | Voiture utilisée |
| `CarClassID` | Classe de voiture |
| `IsSpectator` | Spectateur (exclu du SOF) |
| `CarIsAI` | IA (exclu du SOF) |
| `ClubName` | Club / Pays |
| `DivisionName` | Division |
| `CurDriverIncidentCount` | Incidents en cours de session |

### B.3 — Format des messages WebSocket (JSON)

```json
{
  "type": "session_update",
  "timestamp": "2026-02-22T19:30:00Z",
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
  "track_conditions": {
    "track_surface_temp_c": 38.2,
    "air_temp_c": 22.5,
    "track_wetness": "dry",
    "weather_declared_wet": false,
    "dynamic_track": "moderately_rubbered",
    "skies": "partly_cloudy",
    "weather_type": "dynamic",
    "air_density_kgm3": 1.207,
    "air_pressure_hg": 29.92,
    "relative_humidity_pct": 45.0,
    "fog_level_pct": 0.0,
    "wind_speed_ms": 3.2,
    "wind_direction_rad": 1.57
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

### B.4 — Fonctionnalités du bridge

| ID | Fonctionnalité | Détail |
|----|----------------|--------|
| B.4.1 | Connexion IRSDK | Détection automatique quand iRacing est lancé / en session |
| B.4.2 | Lecture conditions piste | TrackSurfaceTemp, AirTemp, TrackWetness, grip, météo |
| B.4.3 | Lecture DriverInfo | Extraction de tous les pilotes avec iRatings |
| B.4.4 | Lecture SessionInfo | Type de session, série, circuit |
| B.4.5 | Serveur WebSocket | Écoute sur `ws://[IP_SIM_PC_1]:8182` (accessible réseau local) |
| B.4.6 | Émission temps réel | Push à chaque mise à jour IRSDK (pilote entre/sort, conditions changent) |
| B.4.7 | Heartbeat | Indicateur de connexion iRacing active ou non |
| B.4.8 | Auto-reconnexion | Si iRacing redémarre ou change de session |
| B.4.9 | Throttle | Maximum 1 émission toutes les 2 secondes (anti-spam) |

### B.5 — Package Node.js
- `irsdk-node` (natif C++, TypeScript, actif) ou `node-irsdk` (legacy mais éprouvé)
- `ws` pour le serveur WebSocket

### B.6 — Lancement
- Script `npm start` ou fichier `start-bridge.bat` pour lancer en un clic
- Option : démarrage automatique avec Windows (tâche planifiée)

---

## C. Module 2 — Backend PHP

### C.1 — Rôle
Serveur web central qui :
1. Reçoit les données live du bridge (via WebSocket interne ou polling)
2. Appelle l'API REST iRacing pour les données historiques
3. Exécute les moteurs de calcul (SOF, analyse pilotes, décision)
4. Persiste tout en base de données
5. Sert l'interface web aux clients (tablette, téléphone, PC)

### C.2 — Endpoints PHP (API interne)

| ID | Endpoint | Méthode | Description |
|----|----------|---------|-------------|
| C.2.1 | `/api/session/live` | GET | Données live de la session en cours (bridge IRSDK) |
| C.2.2 | `/api/session/history` | GET | Historique des sessions enregistrées |
| C.2.3 | `/api/series/list` | GET | Liste de toutes les séries iRacing |
| C.2.4 | `/api/series/favorites` | GET/POST | Gérer les séries favorites |
| C.2.5 | `/api/series/{id}/sessions` | GET | Sessions actives pour une série |
| C.2.6 | `/api/sof/calculate` | POST | Calcul SOF à partir d'une liste d'iRatings |
| C.2.7 | `/api/decision/evaluate` | POST | Évaluation GO/NO-GO avec score % |
| C.2.8 | `/api/driver/me` | GET | Mon profil (iRating, SR, historique) |
| C.2.9 | `/api/driver/{id}/analyze` | GET | Analyse approfondie d'un pilote sur un circuit |
| C.2.10 | `/api/driver/{id}/recent` | GET | Dernières courses d'un pilote |
| C.2.11 | `/api/conditions/live` | GET | Conditions piste en temps réel |
| C.2.12 | `/api/iracing/auth` | POST | Authentification OAuth2 iRacing |
| C.2.13 | `/api/settings` | GET/POST | Configuration de l'application |

### C.3 — Logique côté serveur

| ID | Fonctionnalité | Détail |
|----|----------------|--------|
| C.3.1 | Relay WebSocket | Reçoit les données du bridge Node.js et les redistribue aux clients |
| C.3.2 | Persistance | Chaque session détectée → enregistrement en BDD |
| C.3.3 | Calcul SOF | Moteur de calcul (voir Module 4) |
| C.3.4 | Analyse pilotes | Enrichissement profil via API REST (voir Module 6) |
| C.3.5 | Moteur de décision | Score GO/NO-GO en % (voir Module 5) |
| C.3.6 | Cache API | Mise en cache des appels iRacing API (rate limiting) |
| C.3.7 | Gestion séries | Catalogue, favoris, sessions actives |
| C.3.8 | Gestion config | Préférences utilisateur (seuils, objectifs) |

---

## D. Module 3 — Base de données

### D.1 — Type de BDD

> **⚠️ INFO ATTENDUE [D.1]** : Quand vous dites "MDB", précisez :
> - **(a)** MariaDB / MySQL
> - **(b)** Microsoft Access (.mdb / .accdb)
> - **(c)** MongoDB
> - **(d)** Autre

### D.2 — Schéma prévu (8 tables)

#### D.2.1 — `drivers` (Pilotes rencontrés)
| Champ | Type | Description |
|-------|------|-------------|
| id | INT (PK, auto) | Identifiant interne |
| iracing_user_id | INT (unique) | ID iRacing du pilote |
| user_name | VARCHAR(100) | Nom iRacing |
| current_irating | INT | Dernier iRating connu |
| current_sr | DECIMAL(4,2) | Dernier Safety Rating connu |
| license_class | VARCHAR(10) | Classe licence (R, D, C, B, A, Pro) |
| club_name | VARCHAR(50) | Club/pays |
| division | VARCHAR(20) | Division |
| is_me | BOOLEAN | Marqueur "c'est moi" |
| tag | VARCHAR(20) NULL | Tag perso : "propre", "dangereux", "ami", etc. |
| notes | TEXT NULL | Notes personnelles sur ce pilote |
| updated_at | DATETIME | Dernière mise à jour |

#### D.2.2 — `sessions` (Sessions enregistrées)
| Champ | Type | Description |
|-------|------|-------------|
| id | INT (PK, auto) | Identifiant interne |
| iracing_subsession_id | INT | ID subsession iRacing |
| session_type | VARCHAR(20) | Practice / Qualifying / Race |
| is_official | BOOLEAN | Session officielle ou non |
| series_id | INT (FK) | Référence vers favorite_series |
| series_name | VARCHAR(100) | Nom de la série |
| track_name | VARCHAR(100) | Circuit |
| track_config | VARCHAR(100) | Configuration du circuit |
| car_class | VARCHAR(50) | Classe de voiture |
| sof | INT | Strength of Field calculé |
| driver_count | INT | Nombre de pilotes |
| min_irating | INT | iRating minimum du champ |
| max_irating | INT | iRating maximum du champ |
| median_irating | INT | iRating médian du champ |
| std_dev_irating | INT | Écart-type des iRatings |
| my_irating_at_time | INT | Mon iRating au moment |
| track_temp_c | DECIMAL(4,1) | Température piste (°C) — IRSDK |
| air_temp_c | DECIMAL(4,1) | Température air (°C) — IRSDK |
| track_wetness | VARCHAR(20) | État d'adhérence — IRSDK |
| weather_declared_wet | BOOLEAN | Piste mouillée déclarée — IRSDK |
| grip_state | VARCHAR(30) | État du grip (rubber buildup) — IRSDK |
| skies | VARCHAR(20) | Couverture nuageuse |
| wind_speed_ms | DECIMAL(4,1) | Vitesse du vent |
| humidity_pct | DECIMAL(4,1) | Humidité relative |
| decision | VARCHAR(10) | GO / NOGO / NULL |
| decision_score | DECIMAL(5,2) | Score de recommandation (0-100%) |
| decision_details | JSON | Détail de chaque critère et son score |
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
| track_experience_score | DECIMAL(5,2) | Score expérience sur ce circuit (0-100) |
| avg_pace_on_track | VARCHAR(10) | Temps moyen sur ce circuit |
| avg_quali_on_track | VARCHAR(10) | Temps quali moyen sur ce circuit |
| avg_incidents_on_track | DECIMAL(4,1) | Incidents moyens sur ce circuit |
| races_on_track | INT | Nombre de courses sur ce circuit |
| danger_score | DECIMAL(5,2) | Score de dangerosité (0-100) |
| finish_position | INT NULL | Position finale (si course terminée) |
| incidents | INT NULL | Incidents (si course terminée) |

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

#### D.2.5 — `favorite_series` (Séries favorites)
| Champ | Type | Description |
|-------|------|-------------|
| id | INT (PK, auto) | Identifiant interne |
| iracing_series_id | INT (unique) | ID série iRacing |
| series_name | VARCHAR(100) | Nom de la série |
| category | VARCHAR(20) | Road / Oval / Dirt Road / Dirt Oval |
| license_group | VARCHAR(10) | Rookie, D, C, B, A, Pro |
| is_favorite | BOOLEAN | Sélectionné par l'utilisateur |
| last_sof_avg | INT | Dernier SOF moyen connu |
| current_track | VARCHAR(100) | Circuit de la semaine en cours |
| current_car_classes | VARCHAR(200) | Classes de voitures |
| race_interval_minutes | INT | Fréquence des courses (ex: 60, 120) |
| updated_at | DATETIME | Dernière mise à jour |

#### D.2.6 — `driver_track_stats` (Cache des stats pilote par circuit)
| Champ | Type | Description |
|-------|------|-------------|
| id | INT (PK, auto) | Identifiant interne |
| driver_id | INT (FK) | Référence vers drivers |
| track_name | VARCHAR(100) | Circuit |
| track_config | VARCHAR(100) | Configuration |
| car_class | VARCHAR(50) | Classe de voiture |
| races_count | INT | Nombre de courses sur ce circuit |
| best_quali_time | VARCHAR(10) | Meilleur temps qualif |
| avg_quali_time | VARCHAR(10) | Temps qualif moyen |
| best_race_lap | VARCHAR(10) | Meilleur tour en course |
| avg_race_pace | VARCHAR(10) | Pace moyenne en course |
| lap_consistency | DECIMAL(4,2) | Régularité (écart-type en secondes) |
| avg_finish_position | DECIMAL(4,1) | Position d'arrivée moyenne |
| avg_incidents | DECIMAL(4,1) | Incidents moyens par course |
| dnf_rate | DECIMAL(4,2) | Taux d'abandon (%) |
| best_finish | INT | Meilleure position |
| worst_finish | INT | Pire position |
| last_raced_at | DATETIME | Dernière course sur ce circuit |
| cached_at | DATETIME | Date de mise en cache (expire après 24h) |

#### D.2.7 — `api_cache` (Cache des réponses API iRacing)
| Champ | Type | Description |
|-------|------|-------------|
| id | INT (PK, auto) | Identifiant interne |
| endpoint | VARCHAR(200) | URL de l'endpoint appelé |
| params_hash | VARCHAR(64) | Hash des paramètres (unicité) |
| response_data | LONGTEXT / JSON | Données de la réponse |
| expires_at | DATETIME | Date d'expiration du cache |
| created_at | DATETIME | Date de création |

#### D.2.8 — `settings` (Configuration)
| Champ | Type | Description |
|-------|------|-------------|
| key | VARCHAR(50) (PK) | Clé du paramètre |
| value | TEXT | Valeur |
| updated_at | DATETIME | Dernière modification |

**Paramètres dans `settings` :**
- `my_iracing_user_id` — Votre ID iRacing
- `my_iracing_name` — Votre nom iRacing
- `irating_target` — Objectif iRating
- `sr_minimum` — SR minimum acceptable pour engager
- `sof_ratio_threshold` — Seuil ratio SOF/iRating perso
- `iracing_oauth_client_id` — OAuth2 client ID
- `iracing_oauth_client_secret` — OAuth2 secret (chiffré)
- `iracing_oauth_token` — Token actif (chiffré)
- `iracing_oauth_refresh_token` — Refresh token (chiffré)
- `bridge_ws_host` — IP du bridge WebSocket (défaut: localhost)
- `bridge_ws_port` — Port du bridge WebSocket (défaut: 8182)
- `cache_ttl_driver_stats` — Durée cache stats pilote (défaut: 86400 = 24h)
- `cache_ttl_series` — Durée cache séries (défaut: 3600 = 1h)
- `decision_weights` — JSON des poids des critères de décision

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
| E.2.7 | Mon percentile | Mon percentile dans le champ (ex: "top 25%") |

### E.3 — Recalcul dynamique
Le SOF est recalculé **à chaque événement** provenant du bridge IRSDK :
- Un pilote rejoint la session → recalcul
- Un pilote quitte la session → recalcul
- Fréquence max : toutes les 2 secondes (throttle du bridge)

---

## F. Module 5 — Moteur de décision GO/NO-GO

### F.1 — Principe
Le moteur produit un **score de 0 à 100%** basé sur des critères pondérés. Chaque critère produit un sous-score, et le score final est la somme pondérée. **L'utilisateur peut voir le détail de chaque critère** pour comprendre la recommandation.

### F.2 — Critères de décision

| ID | Critère | Poids | Source | Description |
|----|---------|:-----:|--------|-------------|
| F.2.1 | **Ratio SOF / Mon iRating** | 20% | IRSDK + BDD | SOF < mon iR → favorable. SOF > mon iR → défavorable |
| F.2.2 | **Position estimée dans le champ** | 15% | IRSDK | Rang de mon iRating parmi les autres |
| F.2.3 | **Gain/Perte iRating probable** | 15% | Calcul Elo | Estimation delta iR selon position probable |
| F.2.4 | **Qualité réelle du champ (expérience circuit)** | 15% | API REST | % de pilotes ayant de l'expérience sur ce circuit |
| F.2.5 | **Score de dangerosité du champ** | 10% | API REST | Incidents moyens des pilotes sur ce circuit |
| F.2.6 | **Conditions de piste** | 10% | IRSDK | Temp piste, adhérence, wetness, météo |
| F.2.7 | **Safety Rating actuel** | 10% | API/BDD | Si SR bas → risque de relégation |
| F.2.8 | **Nombre de participants** | 5% | IRSDK | Champ plein = plus d'enjeu |

### F.3 — Détail du critère F.2.6 : Conditions de piste

| Sous-critère | Impact | Logique |
|--------------|--------|---------|
| Température piste > 40°C | Négatif | Surchauffe pneus, dégradation rapide |
| Température piste < 15°C | Négatif | Pneus froids, moins de grip |
| Température piste 20-35°C | Positif | Conditions optimales |
| TrackWetness ≠ dry | Négatif fort | Risque d'aquaplaning, incidents |
| WeatherDeclaredWet = true | Négatif fort | Course sous la pluie |
| Météo dynamique | Neutre à négatif | Imprévisibilité |
| Grip "heavily_rubbered" | Positif | Piste bien gommée |
| Grip "green" | Négatif léger | Piste verte, moins de grip |

### F.4 — Score et affichage

```
┌─────────────────────────────────────────────┐
│           RECOMMANDATION                     │
│                                              │
│              GO  73%                         │
│         ████████████░░░░░                    │
│                                              │
│  Détail des critères :                       │
│  ├── SOF vs iRating      ████████░░  82%    │
│  ├── Position estimée     ███████░░░  70%    │
│  ├── Gain iR probable     ████████░░  78%    │
│  ├── Qualité du champ     ██████░░░░  62%    │
│  ├── Dangerosité          ███████░░░  73%    │
│  ├── Conditions piste     █████████░  85%    │
│  ├── Safety Rating        ██████░░░░  65%    │
│  └── Nb participants      ███████░░░  68%    │
│                                              │
│  💡 SOF inférieur à votre iRating de 200pts  │
│     Champ expérimenté mais propre sur Spa.   │
│     Conditions de piste optimales (32°C).    │
│     Bonne opportunité de gain d'iRating.     │
└─────────────────────────────────────────────┘
```

### F.5 — Estimation gain/perte iRating par position

| Position estimée | Delta iRating estimé |
|:---:|:---:|
| P1 | +85 |
| P5 | +42 |
| P10 | +8 |
| P15 (ma position estimée) | -12 |
| P20 | -38 |
| DNF | -65 |

> Basé sur une approximation de la formule Elo/Glicko utilisée par iRacing.

### F.6 — Seuils de recommandation (configurables)

Valeurs par défaut (modifiables dans Réglages) :

| Score | Recommandation | Couleur |
|:---:|:---:|:---:|
| 75-100% | **GO** | 🟢 Vert `#00FF00` |
| 50-74% | **NEUTRE** — à votre appréciation | 🟡 Jaune `#FFFF00` |
| 0-49% | **NO-GO** | 🔴 Rouge `#FF0000` |

> ✅ **VALIDÉ** : Seuils configurables dans la page Réglages (table `settings`, clés `threshold_go` et `threshold_nogo`).

---

## G. Module 6 — Analyse approfondie des pilotes

### G.1 — Rôle
Pour chaque pilote détecté dans une session, l'app va chercher son **historique réel sur le circuit en cours** via l'API REST iRacing. Cela permet de distinguer un pilote "fort sur le papier" (iRating élevé) d'un pilote "réellement préparé" sur ce circuit.

### G.2 — Workflow d'analyse

```
Session détectée (IRSDK) → Liste de 24 pilotes
       │
       ▼ Pour chaque pilote :
  ┌────────────────────────────────────────────────────┐
  │  1. Vérifier le cache BDD (table driver_track_stats)│
  │     → Si < 24h : utiliser le cache                  │
  │     → Si > 24h ou absent : appeler l'API            │
  │                                                      │
  │  2. Appels API REST :                                │
  │     → /data/stats/member_recent_races (user_id)      │
  │     → Filtrer par circuit actuel                     │
  │     → /data/results/lap_data (subsession_id)         │
  │                                                      │
  │  3. Calculer les indicateurs :                       │
  │     → Nombre de courses sur ce circuit               │
  │     → Meilleur temps quali                           │
  │     → Pace moyenne en course                         │
  │     → Régularité (écart-type des tours)              │
  │     → Incidents moyens                               │
  │     → Taux de DNF                                    │
  │                                                      │
  │  4. Stocker en cache BDD                             │
  └────────────────────────────────────────────────────┘
```

### G.3 — Profil pilote généré

```
┌───────────────────────────────────────────────────────┐
│  John Doe                           iRating: 2500     │
│  Licence: B 3.45 | Club: France | Div 2              │
│                                                       │
│  ── Expérience à Spa-Francorchamps (GT3) ──          │
│                                                       │
│  Courses ce circuit :    3 (cette saison)             │
│  Meilleur quali :        2:17.342                     │
│  Pace course moyenne :   2:18.105                     │
│  Régularité :            ±0.4s (très régulier)        │
│  Résultats :             P3, P5, P8                   │
│  Incidents moyens :      2.3x / course                │
│  Taux d'abandon :        0%                           │
│                                                       │
│  Score expérience circuit : 88/100                    │
│  Score dangerosité :        15/100 (propre)           │
│                                                       │
│  Tag perso : [Pilote propre ▼]                        │
│  Notes : "Rapide mais fair-play, bon en peloton"      │
└───────────────────────────────────────────────────────┘
```

### G.4 — Indicateurs par pilote

| ID | Indicateur | Calcul | Signification |
|----|-----------|--------|---------------|
| G.4.1 | Score expérience circuit | 0-100 basé sur nb courses + ancienneté | Connait-il le circuit ? |
| G.4.2 | Pace quali | Meilleur temps quali sur ce circuit | Vitesse pure |
| G.4.3 | Pace course | Meilleur tour + moyenne en course | Vitesse en conditions réelles |
| G.4.4 | Régularité | Écart-type des temps au tour | Constant ou erratique ? |
| G.4.5 | Propreté | Incidents moyens par course sur ce circuit | Risque de contact |
| G.4.6 | Taux DNF | % d'abandons sur ce circuit | Fiabilité / gestion de course |
| G.4.7 | Tendance résultats | Positions moyennes et récentes | En forme ou en difficulté ? |
| G.4.8 | Score de dangerosité | 0-100 composite (incidents + DNF + irrégularité) | Faut-il l'éviter ? |

### G.5 — Synthèse globale du champ

| Indicateur global | Description |
|-------------------|-------------|
| % pilotes expérimentés sur ce circuit | Beaucoup = champ compétitif et prévisible |
| % pilotes novices sur ce circuit | Beaucoup = risque d'incidents au T1 |
| Pace quali moyenne du champ | Permet de situer VOTRE pace |
| Score de dangerosité moyen | Champ propre ou chaotique ? |
| Pilotes tagués "dangereux" présents | Alerte visuelle |
| Pilotes tagués "ami" présents | Info pratique |

### G.6 — Priorisation des appels API (rate limiting)

| Priorité | Pilotes | Raison |
|----------|---------|--------|
| 1 (immédiat) | Pilotes dans ±300 iRating de moi | Concurrents directs |
| 2 (rapide) | Pilotes déjà en cache (refresh si > 24h) | Peu coûteux |
| 3 (différé) | Pilotes très au-dessus ou en-dessous | Moins d'impact sur ma course |
| 4 (optionnel) | Pilotes sans historique sur le circuit | Peu de données à récupérer |

---

## H. Module 7 — Interface Frontend

### H.1 — Parcours utilisateur complet

```
┌─────────────────────────────────────────────────────────────┐
│  PAGE 1 — SÉRIES                                            │
│                                                              │
│  Catalogue de toutes les séries iRacing                      │
│  → Filtres : Road / Oval / Dirt / Licence                    │
│  → Cocher les séries favorites (sauvegardé en BDD)           │
│  → Affichage du circuit actuel de la semaine par série       │
└──────────────────────┬──────────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  PAGE 2 — DASHBOARD (séries favorites)                       │
│                                                              │
│  Pour chaque série favorite :                                │
│  → Prochaine course dans X minutes                           │
│  → Circuit actuel de la semaine                              │
│  → Sessions actives maintenant (Practice/Quali/Race)         │
│  → SOF moyen récent                                          │
│  → Nombre de pilotes inscrits                                │
│  → Indicateur conditions piste (si IRSDK connecté)           │
│  → Quick GO/NOGO si des données sont dispo                   │
└──────────────────────┬──────────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  PAGE 3 — ANALYSE SESSION                                    │
│                                                              │
│  Clic sur une session spécifique :                           │
│  → Conditions piste (temp piste, air, adhérence, météo)      │
│  → Liste des pilotes avec iRatings                           │
│  → SOF calculé + stats (médian, écart-type, distribution)    │
│  → Recommandation GO/NOGO avec score %                       │
│  → Détail de chaque critère de décision                      │
│  → Estimation gain/perte iRating par position                │
│  → Analyse approfondie du champ (expérience circuit)         │
└──────────────────────┬──────────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  PAGE 4 — FICHE PILOTE                                       │
│                                                              │
│  Clic sur un pilote :                                        │
│  → Profil complet (iRating, SR, club, division)              │
│  → Historique sur ce circuit (pace, quali, incidents)         │
│  → Courses récentes tous circuits                            │
│  → Tag personnel + notes                                     │
│  → Score dangerosité                                         │
└─────────────────────────────────────────────────────────────┘

+ PAGE 5 — MON PROFIL : Évolution iRating, SR, historique courses
+ PAGE 6 — HISTORIQUE : Sessions passées, décisions prises, résultats
+ PAGE 7 — RÉGLAGES : Config (credentials, seuils, poids critères, BDD)
```

### H.2 — Dashboard (Page 2) — Composants détaillés

| ID | Composant | Description |
|----|-----------|-------------|
| H.2.1 | **Barre de statut** | Connexion bridge IRSDK (vert/rouge) + connexion API iRacing (vert/rouge) |
| H.2.2 | **Cartes séries favorites** | Une carte par série : nom, circuit, prochaine course, SOF moyen |
| H.2.3 | **Sessions actives** | Liste des sessions en cours pour les séries favorites |
| H.2.4 | **Quick score** | Mini indicateur GO/NOGO par session active |
| H.2.5 | **Conditions live** | Panneau conditions piste si IRSDK connecté (temp, grip, météo) |
| H.2.6 | **Mon iRating** | Affichage de mon iRating actuel + tendance récente |

### H.3 — Analyse Session (Page 3) — Composants détaillés

| ID | Composant | Description |
|----|-----------|-------------|
| H.3.1 | **Panneau conditions piste** | Temp piste, temp air, adhérence, wetness, météo (données IRSDK) |
| H.3.2 | **Jauge SOF** | Affichage visuel du SOF avec positionnement de mon iRating |
| H.3.3 | **Compteur pilotes** | Nombre de pilotes (live si IRSDK connecté) |
| H.3.4 | **Panneau GO/NOGO** | Score % + jauge + couleur + explication |
| H.3.5 | **Détail critères** | Barres de progression pour chaque critère de décision |
| H.3.6 | **Tableau gain/perte iR** | Estimation par position (P1 → P24 + DNF) |
| H.3.7 | **Grille pilotes** | Tableau triable : nom, iRating, licence, expérience circuit, dangerosité |
| H.3.8 | **Distribution iRating** | Histogramme de répartition des iRatings |
| H.3.9 | **Synthèse champ** | % expérimentés, % novices, dangerosité moyenne |
| H.3.10 | **Ticker temps réel** | Log : "Pilote X rejoint (iR 2300)", "SOF recalculé : 2450" |

### H.4 — Design & Thème

| ID | Aspect | Description |
|----|--------|-------------|
| H.4.1 | **Thème général** | Dark cockpit / telemetry HUD — style SimHub dashboard |
| H.4.2 | **Palette couleurs** | ✅ VALIDÉ — voir détail ci-dessous |
| H.4.3 | **Typographie** | Monospace technique : **Roboto Mono** (données), **Orbitron** (titres/chiffres) |
| H.4.4 | **Animations** | Transitions fluides, glow sur données live, pulse sur GO/NOGO |
| H.4.5 | **Responsive** | ✅ VALIDÉ — Tous appareils : tablette + téléphone + desktop |
| H.4.6 | **Graphiques** | ApexCharts (dark theme natif) |
| H.4.7 | **Couleurs GO/NOGO** | Vert `#00FF00` (GO) / Jaune `#FFFF00` (NEUTRE) / Rouge `#FF0000` (NOGO) |

#### H.4.2 — Palette couleurs validée (style SimHub cockpit)

| Variable CSS | Couleur | Hex | Usage |
|-------------|---------|-----|-------|
| `--bg-primary` | Noir pur | `#000000` | Fond principal |
| `--bg-card` | Noir léger | `#0A0A0A` | Fond des cartes/panneaux |
| `--bg-card-hover` | Gris très sombre | `#141414` | Hover sur cartes |
| `--border` | Gris sombre | `#1E1E1E` | Bordures de panneaux |
| `--text-primary` | Blanc | `#FFFFFF` | Texte principal / données |
| `--text-secondary` | Gris | `#808080` | Labels, texte secondaire |
| `--text-muted` | Gris foncé | `#4A4A4A` | Texte désactivé |
| `--accent-cyan` | Cyan | `#00BFFF` | Headers, titres de sections |
| `--accent-green` | Vert vif | `#00FF00` | Positif, GO, gains, favorable |
| `--accent-red` | Rouge | `#FF0000` | Négatif, NOGO, pertes, dangereux |
| `--accent-yellow` | Jaune | `#FFFF00` | Attention, neutre, warnings |
| `--accent-orange` | Orange | `#FF8C00` | Highlight, sélection active |
| `--accent-purple` | Violet | `#A855F7` | Classe/catégorie accent 1 |
| `--accent-blue` | Bleu | `#3B82F6` | Classe/catégorie accent 2 |

**Principes de design :**
- Zéro décoration inutile — tout est data
- Color-coding par sens : vert = favorable, rouge = défavorable, jaune = attention
- Très lisible en un coup d'oeil (éclairage faible, stress de course)
- Layout dense, grille, pas d'espace perdu
- Référence visuelle : dashboard SimHub racing telemetry

---

## I. Module 8 — Intégration API REST iRacing

### I.1 — Authentification
- **OAuth2** (obligatoire depuis décembre 2025)
- Endpoint token : `POST https://oauth.iracing.com/oauth2/token`
- Deux flows possibles :
  - **Authorization Code** (interactif — l'utilisateur se connecte via iRacing)
  - **Password Limited Grant** (script/backend — avec client_id + client_secret)
- Stockage sécurisé des tokens en BDD (table `settings`, chiffré)
- Refresh automatique du token avant expiration

### I.2 — Endpoints iRacing utilisés

| ID | Endpoint iRacing | Usage dans l'app | Fréquence |
|----|------------------|------------------|-----------|
| I.2.1 | `/data/series/get` | Catalogue complet des séries | 1x/jour |
| I.2.2 | `/data/season/list` | Séries actives cette saison | 1x/jour |
| I.2.3 | `/data/season/race_guide` | Prochaines courses, horaires, circuits | Toutes les 5 min |
| I.2.4 | `/data/member/get` | Mon profil (iRating, SR) | À chaque ouverture |
| I.2.5 | `/data/member/chart_data` | Historique iRating pour graphiques | 1x/session |
| I.2.6 | `/data/stats/member_recent_races` | Dernières courses d'un pilote | Par pilote analysé |
| I.2.7 | `/data/results/get` | Résultats détaillés d'une subsession | Par course analysée |
| I.2.8 | `/data/results/lap_data` | Temps au tour détaillés | Par course analysée |
| I.2.9 | `/data/results/season_results` | Résultats de saison (SOF historiques) | 1x/jour |
| I.2.10 | `/data/lookup/drivers` | Recherche de pilotes | Sur demande |

### I.3 — Cache & Rate Limiting

| Stratégie | Détail |
|-----------|--------|
| Cache BDD | Chaque réponse API est cachée (table `api_cache`) |
| TTL configurable | Séries: 24h, Race guide: 5min, Stats pilote: 24h, Résultats: permanent |
| Priorisation | Pilotes proches de mon iRating en premier |
| Batch | Étalement des appels sur plusieurs secondes |
| Retry | Backoff exponentiel en cas d'erreur 429 (rate limit) |

### I.4 — Package PHP
- `mwgg/iracing-php` (Composer) — wrapper PHP de l'API `/data`
- Ou implémentation maison (curl + OAuth2)

> **⚠️ INFO ATTENDUE [I.1]** : Avez-vous déjà des credentials OAuth2 iRacing ? Sinon il faut les demander via https://support.iracing.com

---

## J. Arborescence fichiers prévue

```
IRSDK_SOF/
│
├── projet.md                          # Ce fichier
├── .gitattributes                     # Existant
│
├── bridge/                            # MODULE 1 — Bridge Node.js (SIM PC 1)
│   ├── package.json
│   ├── server.js                      # Serveur WebSocket principal
│   ├── irsdk-reader.js                # Lecture IRSDK + parsing
│   ├── parsers/
│   │   ├── session-parser.js          # Parsing SessionInfo + WeekendInfo
│   │   ├── driver-parser.js           # Parsing DriverInfo
│   │   └── conditions-parser.js       # Parsing conditions piste + météo
│   └── start-bridge.bat               # Lanceur Windows double-clic
│
├── api/                               # MODULE 2 — Backend PHP
│   ├── config.php                     # Configuration BDD + constantes
│   ├── db.php                         # Connexion base de données
│   ├── helpers.php                    # Fonctions utilitaires
│   ├── session/
│   │   ├── live.php                   # GET — session live (IRSDK)
│   │   └── history.php                # GET — historique sessions
│   ├── series/
│   │   ├── list.php                   # GET — catalogue séries
│   │   ├── favorites.php              # GET/POST — séries favorites
│   │   └── sessions.php              # GET — sessions actives d'une série
│   ├── sof/
│   │   └── calculate.php              # POST — calcul SOF
│   ├── decision/
│   │   └── evaluate.php               # POST — évaluation GO/NOGO (score %)
│   ├── driver/
│   │   ├── me.php                     # GET — mon profil
│   │   ├── analyze.php                # GET — analyse pilote sur circuit
│   │   └── stats.php                  # GET — stats détaillées
│   ├── conditions/
│   │   └── live.php                   # GET — conditions piste temps réel
│   ├── iracing/
│   │   ├── auth.php                   # POST — OAuth2 iRacing
│   │   ├── proxy.php                  # GET — proxy API iRacing (avec cache)
│   │   └── cache.php                  # Gestion du cache API
│   └── settings/
│       └── index.php                  # GET/POST — configuration
│
├── db/                                # MODULE 3 — Base de données
│   └── schema.sql                     # Script de création (8 tables)
│
├── css/                               # MODULE 7 — Styles
│   ├── variables.css                  # Variables CSS (couleurs, fonts, spacing)
│   ├── main.css                       # Reset + styles globaux + layout
│   ├── components.css                 # Composants réutilisables (cartes, jauges, badges)
│   ├── pages/
│   │   ├── series.css                 # Page séries
│   │   ├── dashboard.css              # Page dashboard
│   │   ├── session.css                # Page analyse session
│   │   ├── driver.css                 # Page fiche pilote
│   │   ├── profile.css                # Page mon profil
│   │   ├── history.css                # Page historique
│   │   └── settings.css               # Page réglages
│   ├── responsive.css                 # Media queries (mobile, tablette, desktop)
│   └── animations.css                 # Animations, transitions, glow effects
│
├── js/                                # MODULE 7 — JavaScript Frontend
│   ├── app.js                         # Point d'entrée, navigation SPA
│   ├── websocket.js                   # Connexion WebSocket au bridge
│   ├── api.js                         # Appels API PHP
│   ├── sof-engine.js                  # Calcul SOF côté client (temps réel)
│   ├── decision-engine.js             # Moteur de décision GO/NOGO
│   ├── charts.js                      # Graphiques (ApexCharts / Chart.js)
│   ├── components/
│   │   ├── status-bar.js              # Barre de statut connexions
│   │   ├── series-card.js             # Carte série favorite
│   │   ├── session-card.js            # Carte session active
│   │   ├── conditions-panel.js        # Panneau conditions piste
│   │   ├── sof-gauge.js              # Jauge SOF
│   │   ├── decision-panel.js          # Panneau GO/NOGO avec score %
│   │   ├── criteria-detail.js         # Détail des critères de décision
│   │   ├── irating-simulator.js       # Estimation gain/perte par position
│   │   ├── driver-grid.js             # Grille des pilotes
│   │   ├── driver-profile.js          # Fiche pilote détaillée
│   │   ├── irating-chart.js           # Graphique distribution iRating
│   │   ├── field-summary.js           # Synthèse globale du champ
│   │   └── event-ticker.js            # Ticker temps réel
│   └── utils/
│       ├── formatters.js              # Formatage nombres, dates, temps au tour
│       └── storage.js                 # LocalStorage pour préférences UI
│
├── assets/                            # Ressources statiques
│   ├── fonts/                         # Polices racing
│   └── img/                           # Images, icônes, logos
│
├── index.html                         # Page principale (SPA)
│   ├── #series                        # Vue séries
│   ├── #dashboard                     # Vue dashboard
│   ├── #session/{id}                  # Vue analyse session
│   ├── #driver/{id}                   # Vue fiche pilote
│   ├── #profile                       # Vue mon profil
│   ├── #history                       # Vue historique
│   └── #settings                      # Vue réglages
│
└── README.md                          # Documentation d'installation
```

---

## K. Décisions validées

### Réponses reçues

| Ref | Question | Réponse |
|-----|----------|---------|
| **[A.4a]** | Serveur PHP | ✅ **Laragon** (léger, auto-config, PHP 8.x + Apache) |
| **[A.4b]** | Node.js sur SIM PC 1 | ✅ **À installer** (v20 LTS recommandé) |
| **[D.1]** | Type de BDD | ✅ **Microsoft Access (.mdb)** via ODBC PHP |
| **[D.2]** | Connexion BDD | ✅ Fichier local `irsdk_sof.mdb` (pas de serveur, accès ODBC direct) |
| **[I.1]** | OAuth2 iRacing | ⏳ **À demander** via https://support.iracing.com |
| **[H.4.2]** | Palette couleurs | ✅ **Dark cockpit SimHub** (noir pur + cyan/vert/rouge/jaune) |
| **[H.4.5]** | Responsive | ✅ **Tous appareils** (tablette + téléphone + desktop) |
| **[H.4]** | Référence visuelle | ✅ **Dashboard SimHub** — cockpit telemetry HUD |
| **[F.6]** | Seuils GO/NOGO | ✅ **Configurables** dans les réglages |
| **[F.2]** | Critères de décision | ✅ Validés (8 critères pondérés) |

### En attente

| Ref | Question | Statut |
|-----|----------|--------|
| **[I.1]** | Credentials OAuth2 iRacing (client_id + client_secret) | À demander par l'utilisateur |

> **Note** : L'app peut être développée et testée sans les credentials OAuth2. L'authentification iRacing sera le dernier module à brancher.

---

> **Version 2.1** — Toutes les décisions d'architecture et de design validées. Développement lancé.
>
> Chaque section indexée (A.1, B.2.3, F.2.6, H.3.4, etc.) peut être référencée directement dans vos retours.
