# iR SOF Agent — Guide d'installation

> Application d'aide à la décision pour iRacing
> Analyse SOF, conditions piste, profils pilotes → recommandation GO / NO-GO

---

## Table des matières

1. [Prérequis](#1-prérequis)
2. [Installation sur SIM PC 1](#2-installation-sur-sim-pc-1)
3. [Configuration du pare-feu Windows](#3-configuration-du-pare-feu-windows)
4. [Obtenir les credentials OAuth2 iRacing](#4-obtenir-les-credentials-oauth2-iracing)
5. [Premier lancement](#5-premier-lancement)
6. [Accès depuis les autres appareils](#6-accès-depuis-les-autres-appareils)
7. [Dépannage](#7-dépannage)

---

## 1. Prérequis

### SIM PC 1 (le serveur)

| Logiciel | Version | Téléchargement |
|----------|---------|----------------|
| **Windows** | 10 ou 11 | Déjà installé |
| **iRacing** | Dernière version | Déjà installé |
| **Laragon** | 6.x (Full) | https://laragon.org/download/ |
| **Node.js** | 20 LTS | https://nodejs.org/ |

### SIM PC 2 / Tablette / Téléphone

Rien à installer — un navigateur web moderne suffit (Chrome, Firefox, Edge, Safari).

---

## 2. Installation sur SIM PC 1

### Étape 2.1 — Installer Laragon

1. Téléchargez **Laragon Full** depuis https://laragon.org/download/
2. Lancez l'installateur, gardez les options par défaut
3. Laragon s'installe dans `C:\laragon\`
4. Lancez Laragon → cliquez **"Démarrer tout"** (Start All)
5. Vérifiez : ouvrez `http://localhost` dans votre navigateur → vous devez voir la page d'accueil Laragon

### Étape 2.2 — Installer Node.js

1. Téléchargez **Node.js 20 LTS** depuis https://nodejs.org/
2. Lancez l'installateur, gardez les options par défaut
3. Vérifiez : ouvrez un terminal (cmd) et tapez :
   ```
   node -v
   ```
   Vous devez voir `v20.x.x`

### Étape 2.3 — Installer le projet iR SOF Agent

**Option A — Téléchargement ZIP :**
1. Téléchargez le ZIP : https://github.com/Sl3t/IRSDK_SOF/archive/refs/heads/claude/iracing-sof-agent-6c0XZ.zip
2. Décompressez dans `C:\laragon\www\IRSDK_SOF\`

**Option B — Git clone :**
```
cd C:\laragon\www
git clone -b claude/iracing-sof-agent-6c0XZ https://github.com/Sl3t/IRSDK_SOF.git
```

**Structure attendue :**
```
C:\laragon\www\IRSDK_SOF\
├── api/
├── bridge/
├── css/
├── db/
├── js/
├── index.html
├── projet.md
└── README.md
```

### Étape 2.4 — Installer les dépendances du bridge Node.js

Ouvrez un terminal (cmd ou PowerShell) :

```
cd C:\laragon\www\IRSDK_SOF\bridge
npm install
```

Cela installe les packages `node-irsdk` et `ws`.

### Étape 2.5 — Créer la base de données Access

1. Ouvrez **Microsoft Access** (ou utilisez un outil gratuit comme MDB Viewer)
2. Créez une nouvelle base de données vide :
   - Emplacement : `C:\laragon\www\IRSDK_SOF\db\irsdk_sof.mdb`
3. Exécutez les requêtes SQL du fichier `db/schema.sql` pour créer les 8 tables

**Alternative sans Access :** Si vous n'avez pas Microsoft Access, le fichier `.mdb` sera créé automatiquement au premier lancement de l'app via PHP ODBC (il faudra que le driver Microsoft Access soit installé — voir section Dépannage).

### Étape 2.6 — Vérifier la configuration PHP ODBC

Laragon inclut PHP, mais il faut vérifier que le driver ODBC Access est disponible :

1. Ouvrez `http://localhost/IRSDK_SOF/api/config.php` dans le navigateur
2. Si vous voyez un écran blanc ou une erreur ODBC, installez le driver :
   - Téléchargez "Microsoft Access Database Engine 2016 Redistributable"
   - https://www.microsoft.com/en-us/download/details.aspx?id=54920
   - Installez la version **32 bits** si votre PHP est 32 bits (cas le plus fréquent avec Laragon)
   - Ou la version **64 bits** si votre PHP est 64 bits

---

## 3. Configuration du pare-feu Windows

Pour que les autres appareils (SIM PC 2, tablette, téléphone) puissent accéder à l'app, il faut ouvrir 2 ports dans le pare-feu Windows du SIM PC 1 :

### Port 80 (Apache / Laragon — interface web)

1. Ouvrez le **Pare-feu Windows** (taper "pare-feu" dans la barre de recherche)
2. Cliquez **"Paramètres avancés"** (à gauche)
3. Cliquez **"Règles de trafic entrant"** → **"Nouvelle règle"**
4. Type : **Port**
5. Protocole : **TCP**, Port : **80**
6. Action : **Autoriser la connexion**
7. Profil : cochez **Privé** (votre réseau domestique)
8. Nom : `Laragon HTTP`

### Port 8182 (Bridge WebSocket — données live IRSDK)

Répétez la même procédure avec :
- Port : **8182**
- Nom : `iR SOF Bridge WebSocket`

### Trouver l'adresse IP du SIM PC 1

Ouvrez un terminal et tapez :
```
ipconfig
```

Cherchez **"Adresse IPv4"** dans la section de votre carte réseau (Wi-Fi ou Ethernet).
Exemple : `192.168.1.10`

**Notez cette adresse** — c'est celle que les autres appareils utiliseront.

---

## 4. Obtenir les credentials OAuth2 iRacing

L'API REST iRacing nécessite une authentification OAuth2 depuis décembre 2025. Voici la procédure pas à pas :

### Étape 4.1 — Aller sur la page d'enregistrement

Rendez-vous sur :
**https://oauth.iracing.com/oauth2/book/client_registration.html**

### Étape 4.2 — Contacter iRacing

Cliquez sur le lien **"contact us"** sur cette page, ou allez directement créer un ticket de support :
**https://support.iracing.com/support/tickets/new**

### Étape 4.3 — Rédiger votre demande

**IMPORTANT** : Envoyez la demande depuis l'adresse email de votre compte iRacing.

Voici un modèle de message à envoyer :

---

> **Sujet :** OAuth2 Client Registration Request — Personal Data API Access
>
> Hello,
>
> I would like to request OAuth2 client credentials to access the iRacing /data API for personal use.
>
> Here are the required details:
>
> - **Client Name:** iR SOF Agent
> - **Client Type:** Server-side
> - **Grant Type:** Password Limited
> - **Developer Name:** [Votre nom]
> - **Developer Email:** [Votre email iRacing]
> - **Developer URL:** (none — personal local use only)
> - **Audiences:** data-server
> - **Redirect URIs:** (not required for Password Limited)
>
> This is a personal tool running locally on my computer to analyze session data and race statistics. It will only access my own account data.
>
> Thank you for your help.

---

### Étape 4.4 — Attendre la réponse

- Le délai est d'environ **5 à 10 jours ouvrés**
- iRacing vous enverra un email avec :
  - `client_id` — votre identifiant client
  - `client_secret` — votre clé secrète

### Étape 4.5 — Configurer dans l'application

1. Ouvrez l'app dans votre navigateur → page **Réglages** (`#settings`)
2. Saisissez votre `client_id` et `client_secret`
3. Saisissez votre **email iRacing** (c'est votre username)
4. Saisissez votre **mot de passe iRacing**
5. Cliquez **"Tester la connexion API"**
6. Si le test passe → vous êtes connecté à l'API iRacing

### Important — Sécurité

- Le `client_secret` est chiffré en base de données (AES-256)
- Vos credentials ne quittent **jamais** votre PC
- Ne partagez jamais votre `client_secret` avec qui que ce soit
- L'app n'envoie vos credentials **qu'à** `oauth.iracing.com` (le serveur officiel iRacing)

---

## 5. Premier lancement

### 5.1 — Démarrer Laragon

1. Lancez Laragon
2. Cliquez **"Démarrer tout"** (Apache + MySQL démarrent)
3. Vérifiez : `http://localhost/IRSDK_SOF/` → vous devez voir l'app

### 5.2 — Démarrer le bridge IRSDK

**Option A — Double-clic :**
- Double-cliquez sur `C:\laragon\www\IRSDK_SOF\bridge\start-bridge.bat`

**Option B — Terminal :**
```
cd C:\laragon\www\IRSDK_SOF\bridge
npm start
```

La console affichera :
```
[iR SOF Bridge] WebSocket server started on ws://0.0.0.0:8182
[iR SOF Bridge] Waiting for iRacing...
```

### 5.3 — Lancer iRacing

1. Lancez iRacing normalement
2. Rejoignez une session (officielle ou hosted)
3. Le bridge détecte automatiquement iRacing :
```
[iR SOF Bridge] iRacing connected!
[iR SOF Bridge] Session detected: PRACTICE — VRS GT Sprint Series — Spa-Francorchamps
[iR SOF Bridge] 18 drivers found, SOF: 2347
```

### 5.4 — Ouvrir l'app

1. Ouvrez `http://localhost/IRSDK_SOF/` dans votre navigateur
2. L'indicateur IRSDK passe au **vert**
3. Naviguez vers le **Dashboard** → vous verrez les données live

### 5.5 — Configuration initiale (page Réglages)

Allez dans **Réglages** (`#settings`) et remplissez :

| Paramètre | Valeur |
|-----------|--------|
| Mon iRacing User ID | Votre ID numérique iRacing |
| Mon nom iRacing | Votre nom d'affichage |
| Objectif iRating | Votre objectif (ex: 2500) |
| SR minimum | Seuil de SR en dessous duquel ne pas courir (ex: 3.00) |
| OAuth2 Client ID | (quand vous l'aurez reçu) |
| OAuth2 Client Secret | (quand vous l'aurez reçu) |

---

## 6. Accès depuis les autres appareils

### Depuis le SIM PC 2

Ouvrez un navigateur et allez à :
```
http://192.168.1.10/IRSDK_SOF/
```
(remplacez `192.168.1.10` par l'IP réelle de votre SIM PC 1)

### Depuis la tablette / téléphone

1. Connectez-vous au **même réseau Wi-Fi** que le SIM PC 1
2. Ouvrez le navigateur (Chrome, Safari...)
3. Tapez : `http://192.168.1.10/IRSDK_SOF/`

### Astuce : créer un raccourci sur l'écran d'accueil

**Sur iPad / iPhone (Safari) :**
1. Ouvrez l'URL dans Safari
2. Appuyez sur le bouton **Partager** (carré avec flèche)
3. Sélectionnez **"Sur l'écran d'accueil"**
4. L'app apparaît comme une icône sur l'écran

**Sur Android (Chrome) :**
1. Ouvrez l'URL dans Chrome
2. Menu ⋮ → **"Ajouter à l'écran d'accueil"**

---

## 7. Dépannage

### L'app ne charge pas dans le navigateur

| Problème | Solution |
|----------|---------|
| Page blanche | Vérifiez que Laragon est démarré (icône verte) |
| Erreur 404 | Vérifiez que le dossier est bien dans `C:\laragon\www\IRSDK_SOF\` |
| Erreur PHP | Vérifiez la version PHP dans Laragon (Menu → PHP → Version → 8.x) |

### L'indicateur IRSDK reste rouge

| Problème | Solution |
|----------|---------|
| Bridge pas lancé | Lancez `start-bridge.bat` |
| iRacing pas en session | Entrez dans une session (Practice, Quali, Race) |
| Erreur `node-irsdk` | Relancez `npm install` dans le dossier bridge |
| Port 8182 bloqué | Vérifiez le pare-feu Windows (section 3) |

### L'API iRacing ne se connecte pas

| Problème | Solution |
|----------|---------|
| Pas de credentials | Demandez-les à iRacing (section 4) |
| Erreur 401 | Vérifiez client_id / client_secret dans les réglages |
| Erreur 429 | Rate limit atteint — attendez quelques minutes |

### Les autres appareils ne peuvent pas se connecter

| Problème | Solution |
|----------|---------|
| Connection refused | Ouvrez les ports 80 et 8182 dans le pare-feu (section 3) |
| Timeout | Vérifiez que les appareils sont sur le même réseau Wi-Fi |
| Mauvaise IP | Relancez `ipconfig` pour vérifier l'IP du SIM PC 1 |

### Erreur ODBC / Base de données

| Problème | Solution |
|----------|---------|
| Driver ODBC introuvable | Installez "Microsoft Access Database Engine 2016" (section 2.6) |
| 32 bits vs 64 bits | PHP Laragon est souvent 32 bits → installez le driver 32 bits |
| Fichier .mdb non trouvé | Créez le fichier dans `db/irsdk_sof.mdb` (section 2.5) |

---

## Démarrage automatique (optionnel)

Pour que le bridge se lance automatiquement au démarrage de Windows :

1. Appuyez `Win + R` → tapez `shell:startup` → Entrée
2. Créez un raccourci vers `C:\laragon\www\IRSDK_SOF\bridge\start-bridge.bat`
3. Le bridge démarrera automatiquement avec Windows

Laragon peut aussi être configuré pour démarrer automatiquement :
- Laragon → Préférences → Général → cocher **"Démarrer Laragon au démarrage de Windows"**

---

> **Support** : pour toute question sur le projet, consultez le fichier `projet.md` ou ouvrez une issue sur le repo GitHub.
