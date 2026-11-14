# F2A MANAGER

Logiciel de gestion de **F2A TRAVAUX – Société de Fluides et Travaux** (chauffage central, ventilation, climatisation, plomberie, sanitaire).

Il comprend un site public, une application de gestion (clients, devis, factures, paiements, rapports) et un espace client. L'interface est bilingue français/arabe, avec la mise en page RTL pour l'arabe.

| Couche | Technologies |
|---|---|
| Frontend | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, Recharts, lucide-react |
| Backend | Python 3.13, FastAPI, SQLAlchemy 2, Alembic, Pydantic 2 |
| Base de données | PostgreSQL 16 (UUID, `NUMERIC(12,3)` pour les montants en TND) |
| Sécurité | JWT d'accès 15 min + refresh token opaque en cookie httpOnly (rotation et détection de réutilisation), Argon2id, RBAC configurable |
| Documents | ReportLab (PDF FR/AR avec RTL), openpyxl (Excel) |

---

## Démarrage rapide (développement)

Prérequis : Python 3.12 ou plus, Node 20 ou plus, PostgreSQL 16.

```bash
# 1. Base de données
sudo -u postgres psql -c "CREATE USER f2a WITH PASSWORD 'f2a_dev_password' CREATEDB;"
sudo -u postgres createdb -O f2a f2a_manager
sudo -u postgres createdb -O f2a f2a_test          # pour les tests

# 2. Backend
cd backend
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env                                # puis renseigner SECRET_KEY (openssl rand -hex 32)
alembic upgrade head
python -m app.seed --demo                           # rôles, paramètres, admin et données de démonstration
uvicorn app.main:app --reload --port 8000           # documentation API : http://localhost:8000/api/docs

# 3. Frontend (dans un autre terminal)
cd frontend
npm install
cp .env.example .env.local
npm run dev                                         # http://localhost:3000
```

### Comptes de démonstration (`--demo`)

| Rôle | Email | Mot de passe |
|---|---|---|
| Administrateur | admin@f2a.tn | Admin2026! |
| Gestionnaire | gestionnaire@f2a.tn | Gestion2026! |
| Comptable | comptable@f2a.tn | Compta2026! |
| Client (portail) | client@f2a.tn | Client2026! |

> ⚠️ Changez ces mots de passe avant toute mise en production. Le compte admin de production se définit avec `ADMIN_EMAIL` et `ADMIN_PASSWORD`.

### Tests

```bash
cd backend && python -m pytest -q        # 39 tests unitaires et API (base PostgreSQL f2a_test)
cd frontend && npm test                  # calculs, formatage TND, complétude de la traduction arabe
cd frontend && npx tsc --noEmit && npm run build
```

### Déploiement (Docker)

```bash
cp .env.example .env        # renseigner POSTGRES_PASSWORD, SECRET_KEY, ADMIN_PASSWORD, PUBLIC_URL
docker compose up -d --build
```

### Mise en ligne sur un serveur (VPS) avec HTTPS

1. Chez le vendeur du domaine, créez un enregistrement **A** `f2a-travaux.com` → IP du serveur (et un **A** ou **CNAME** pour `www`).
2. Sur le serveur (Ubuntu 24.04) :
   ```bash
   curl -fsSL https://get.docker.com | sh
   git clone -b claude/f2a-manager-app-8qkc4a https://github.com/islemammar702-source/F2a.git
   cd F2a && cp .env.example .env && nano .env   # DOMAIN, PUBLIC_URL, mots de passe forts, COOKIE_SECURE=true
   docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
   ```
3. Ouvrez `https://votre-domaine.com` : Caddy obtient le certificat HTTPS automatiquement (ports 80 et 443 ouverts).

La pile comprend PostgreSQL, l'API (migrations et seed automatiques au démarrage), le frontend et un service de **sauvegarde quotidienne** (`pg_dump` et archive des documents dans `./backups`, rétention configurable). Placez un reverse proxy TLS (Caddy ou Nginx) devant le port 3000 et laissez `COOKIE_SECURE=true`.

---

## Architecture

```
F2a/
├── backend/
│   ├── app/
│   │   ├── core/         config, sécurité (Argon2, JWT), dépendances d'accès, catalogue des permissions
│   │   ├── db/           moteur SQLAlchemy, session
│   │   ├── models/       auth, crm, sales (devis/factures/paiements), system (paramètres, documents, notifs, logs)
│   │   ├── schemas/      validation Pydantic des entrées/sorties
│   │   ├── services/     calculs, numérotation, PDF, stockage, rapports, audit, mail, rate-limit
│   │   ├── api/routes/   auth, users/roles, clients, quotes, invoices, payments, dashboard/reports, settings, portal, public
│   │   └── seed.py
│   ├── alembic/          migrations
│   └── tests/
├── frontend/
│   └── src/
│       ├── app/(public)/ site public : /, /about, /services, /projects, /contact, /request-quote
│       ├── app/(app)/    application : /dashboard, /clients, /quotes, /invoices, /payments, /reports, /users, /roles, /settings, /requests, /profile
│       ├── app/portal/   espace client : /portal, /portal/quotes, /portal/invoices, /portal/payments, /portal/profile
│       ├── app/login, app/reset-password
│       ├── components/   UI, shell, éditeur de devis/factures, graphiques…
│       └── lib/          client API, auth, i18n (fr.ts / ar.ts), formatage TND
├── deploy/backup.sh
└── docker-compose.yml
```

Le navigateur ne communique qu'avec Next.js. Les appels `/api/*` sont relayés vers FastAPI (même origine), ce qui permet un cookie de refresh `httpOnly; SameSite=Strict` limité à `/api/auth`. Aucun secret n'est exposé au frontend.

---

## Compte rendu des phases

### Phase 1 : architecture, base de données, authentification
- **Fichiers** : `backend/app/core/*`, `app/db/session.py`, `app/models/*`, `alembic/versions/0001_initial_schema.py`, `app/api/routes/auth.py`.
- **Tables** : `users`, `roles`, `permissions`, `role_permissions`, `clients`, `quotes`, `quote_items`, `invoices`, `invoice_items`, `payments`, `company_settings`, `activity_logs`, `documents`, `notifications`. Les tables techniques `user_sessions`, `password_reset_tokens`, `document_sequences` et `quote_requests` s'y ajoutent.
- **Schéma** : UUID partout, montants en `NUMERIC(12,3)`, contraintes `CHECK` (quantité > 0, statuts, paiement ≤ total…), index, et un index unique partiel « un devis = une facture active ».
- **Connexion** : Argon2id, protection anti-énumération (même réponse et même temps d'exécution), limitation à 5 tentatives par 15 min, jeton d'accès de 15 min lié à une session révocable, refresh token opaque haché en base.
- **Refresh token** : rotation à chaque usage. Un rejeu au-delà de 10 s révoque toute la famille de sessions (détection de vol).
- **« Se souvenir de moi »** : cookie de 30 jours, sinon session de 12 h. Le lien de réinitialisation du mot de passe est valable 1 h.

### Phase 2 : rôles et permissions
- 17 permissions (`app/core/permissions.py`) et 4 rôles système : Administrateur, Gestionnaire, Comptable, Client.
- Les permissions sont configurables depuis `/roles`, et l'administrateur peut créer des rôles personnalisés.
- Les droits sont contrôlés côté backend sur chaque route (`require_permission`). Le frontend se contente de masquer les menus.
- La suppression d'un compte qui a un historique devient une désactivation (traçabilité). Le système empêche de supprimer ou de désactiver le dernier administrateur.

### Phase 3 : clients (CRM)
- Création, modification, archivage et restauration. Recherche sur le nom, le téléphone, l'email, le matricule et la ville, avec filtres par type, par solde dû et pour les archivés.
- La fiche client regroupe les informations, l'historique des devis, des factures et des paiements, les totaux (facturé, payé, reste) et les documents PDF associés.

### Phase 4 : devis PDF
- Éditeur en 4 étapes : client, informations, lignes (prestation, matériel, main-d'œuvre), taxes et totaux.
- Calcul d'une ligne : `Total HT = Qté × PU HT − Remise`. La TVA est calculée par taux et `TTC = HT + TVA`. Les arrondis se font au millime.
- **Le serveur recalcule tout** : les totaux envoyés par le navigateur sont ignorés.
- Numérotation `DEV-2026-001` avec un verrou `SELECT … FOR UPDATE` (aucun doublon possible).
- Statuts brouillon, envoyé, accepté, refusé, expiré, avec des transitions contrôlées et l'expiration automatique.
- Actions : prévisualiser, modifier, dupliquer, télécharger, imprimer, envoyer par email (SMTP, ou repli `mailto:`), partager par WhatsApp, convertir en facture.
- Le PDF est en français ou en arabe : logo, entreprise, client, tableau, totaux et TVA par taux, conditions, coordonnées bancaires, cadres de signature et cachet.

### Phase 5 : factures PDF
- Création manuelle ou conversion d'un devis accepté. Numérotation `FAC-2026-001`.
- Le timbre fiscal (1,000 DT par défaut) est configurable : `Net à payer = TTC + timbre`.
- **Règles de modification** : tant qu'aucun paiement n'est enregistré, tout est modifiable. Ensuite, seuls les notes, les conditions et l'échéance le sont. Une facture ne peut être annulée que sans paiement, et elle reste dans l'historique avec son motif.
- Le PDF reprend les paiements enregistrés et le solde restant. Un historique complet de la facture et de ses paiements est disponible.

### Phase 6 : paiements
- Plusieurs paiements par facture, chacun dans une transaction avec la facture verrouillée. Le montant ne peut pas dépasser le reste à payer.
- `Reste = Net à payer − Σ paiements validés`. Le statut est calculé automatiquement : non payée, partiellement payée, payée, ou en retard si l'échéance est dépassée avec un solde.
- **Aucune suppression** : une correction se fait par annulation tracée (motif, auteur, date), puis par un nouveau paiement si besoin.
- Les modes de paiement sont configurables. Un justificatif (PDF ou image) peut être joint : type MIME et signature du fichier sont vérifiés, et le fichier est stocké hors de la racine web.

### Phase 7 : tableau de bord financier et rapports
- **Dashboard** : 11 indicateurs, filtres de période (aujourd'hui, semaine, mois, année, période personnalisée), revenus mensuels sur 12 mois, encaissements par mode, derniers devis, factures et paiements, activité récente, alerte en cas de retard.
- **Rapports** : CA facturé, encaissements, restes, impayés avec jours de retard, répartition par mois, par client et par mode de paiement. Export en PDF (FR ou AR) et en Excel.
- Le rapport distingue explicitement **CA facturé, encaissements et bénéfice**. Le bénéfice n'est pas calculé, car les coûts ne sont pas suivis.

### Phase 8 : site public et espace client
- Site public : accueil, entreprise, services, réalisations, contact, demande de devis. Les formulaires sont protégés par un champ piège anti-robot et une limitation de débit.
- Les demandes reçues arrivent dans `/requests`, d'où l'on peut créer le client, puis le devis prérempli.
- **Portail client**, isolé par `client_id` côté serveur. Le client y consulte ses devis (sans les brouillons), peut les accepter ou les refuser avec un commentaire, télécharge ses PDF, consulte ses factures et ses paiements, suit ses demandes et gère son profil.

### Phase 9 : traduction français / arabe
- Les dictionnaires `fr.ts` et `ar.ts` (typés) couvrent l'intégralité de l'interface : pages, formulaires, boutons, notifications, statuts, erreurs.
- Un test vérifie qu'aucune clé arabe ne manque.
- En arabe : `dir="rtl"`, menu à droite, propriétés logiques Tailwind (`ms-`, `start-`…), police Cairo, chiffres latins (usage tunisien), montants au format `1.234,500 د.ت`.
- PDF arabe : mise en forme des lettres (arabic-reshaper), ordre bidirectionnel (python-bidi), tableaux en miroir. Les nombres et téléphones sont protégés afin de ne pas être inversés.

### Phase 10 : tests, sécurité, déploiement
- **Tests backend (39)** : connexion et déconnexion, rotation et réutilisation du refresh token, limitation de débit, réinitialisation du mot de passe, autorisations des 4 rôles, isolation des données entre clients, CRUD clients, calculs HT/TVA/TTC, numérotation, workflow et conversion des devis, paiements multiples (exemple 2 500 → 700 DT), annulation tracée, factures en retard, PDF FR/AR, rapports et exports, formulaires publics, notifications, recherche.
- **Tests frontend** : calculs, formatage TND, complétude de la traduction.
- **Test de bout en bout** (Playwright, en local) : parcours complet devis → envoi → acceptation → facture → paiement, affichage RTL, responsive mobile, redirection du client hors de l'espace de gestion.
- **Sécurité** : en-têtes (`nosniff`, `X-Frame-Options`, `Referrer-Policy`), CORS restreint, documentation API désactivée en production, journal d'activité, fichiers servis uniquement via des routes autorisées.
- **Déploiement** : Dockerfiles, `docker-compose.yml` avec sauvegarde quotidienne, CI GitHub Actions (tests, migrations, `alembic check`, typecheck, build).

---

## Évolutions possibles
- Envoi automatique d'emails et intégration WhatsApp Business API. Les points d'accroche existent déjà : `services/mailer.py` et les notifications.
- Rate-limit partagé (Redis) si l'API tourne sur plusieurs instances.
- Gestion des chantiers et du planning des techniciens.
- Suivi des coûts (achats, main-d'œuvre interne) pour calculer une marge réelle.
