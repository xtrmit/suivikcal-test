# SuiviKcal

Suivi des calories, doux et sans stress. C'est une application web installable (PWA) pour Android et iPhone. Elle fonctionne hors ligne, et les données restent sur le téléphone. L'IA (texte, photo, idées de repas, récap) et la recherche par code-barres passent par n8n.

Le code est dans `F:\CALORY` (le dossier garde le nom de travail du projet).

## Les 3 versions

| Version | Où | Rôle | Icône |
|---|---|---|---|
| **LOCAL** | `http://localhost:8083` sur le PC | Développer et tester à chaud | balise LOCAL |
| **TEST** | `https://xtrmit.github.io/suivikcal-test/` | Valider sur un téléphone | orange, « SuiviKcal T » |
| **PROD** | `https://xtrmit.github.io/suivikcal/` | Usage réel | corail, « SuiviKcal » |

Chaque version garde ses propres données. LOCAL utilise son propre port (8083) pour ne pas se mélanger avec les autres apps lancées sur le PC.

## Accès sur invitation

Personne ne peut utiliser l'app sans validation de l'administrateur :

1. Dans n8n, ouvrir le workflow d'accès (test ou prod), changer le nom dans « Qui invites-tu ? », puis **Execute workflow**. Le lien d'invitation arrive sur Telegram. Il contient aussi l'adresse du serveur, qui n'est donc jamais dans le code.
2. La personne ouvre ce lien sur **son** téléphone. L'app crée une clé secrète propre à ce téléphone (jamais visible, jamais dans le code).
3. L'administrateur reçoit un message Telegram « Nouvel appareil » avec deux boutons : **Valider** ou **Refuser**.
4. Si le même lien est ouvert sur un autre téléphone, c'est refusé et l'administrateur reçoit une alerte.

Le tableau d'appareils dans n8n sert de mini tableau de bord : nom, modèle, statut, dernière utilisation, analyses du jour, alertes. Pour couper un accès, passer le statut à `revoque`.

## Mise en route (une seule fois)

```powershell
cd F:\CALORY
.\tools\setup-github.ps1
```

Ce script relie le dossier à GitHub et crée les dépôts `suivikcal-test` et `suivikcal`.

## Cycle de travail

1. **Tester sur le PC** : `.\tools\serve.ps1`. Chrome s'ouvre sur la version LOCAL. F5 suffit à voir les changements. F12 puis l'icône téléphone simule un mobile.
2. **Envoyer en TEST** : `.\tools\deploy.ps1 test`. Le script propose d'augmenter la version. En ligne 1 à 2 minutes après.
3. **Valider sur le téléphone**, avec l'app « SuiviKcal T » (orange), y compris en mode avion.
4. **Publier en PROD** : `.\tools\deploy.ps1 prod`, puis taper `OUI`. Seul le code déjà passé par TEST est accepté.

## Installer sur un téléphone

- **Android (Chrome)** : ouvrir le lien d'invitation, puis menu ⋮ → **Ajouter à l'écran d'accueil** → **Installer**.
- **iPhone (Safari)** : ouvrir le lien d'invitation et suivre les 3 étapes affichées (installer d'abord, puis coller le lien dans l'app).

Sur iPhone, iOS peut effacer les données d'une app web peu utilisée : faire une sauvegarde de temps en temps (Profil → Exporter).

## Fichiers

```
index.html                 page de l'app
css/app.css                styles (clair / sombre)
js/aliments.js             base d'aliments hors ligne (extrait Ciqual), activités, phrases
js/api.js                  échanges avec n8n (clé de l'appareil, invitation)
js/app.js                  logique de l'app
version.js                 numéro de version (déclenche les mises à jour)
sw.js                      service worker : hors ligne + mise à jour
manifest*.webmanifest      fiches d'installation (PROD / TEST)
icons/                     icônes (corail = PROD, orange = TEST)
fonts/                     Fredoka et Nunito (licence OFL), pour le hors ligne
tools/                     serve.ps1, setup-github.ps1, deploy.ps1, repartir-propre.ps1
```
