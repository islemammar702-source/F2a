"""Catalogue of permissions and default role mapping."""

PERMISSIONS: dict[str, tuple[str, str]] = {
    # code: (module, description)
    "dashboard.view": ("dashboard", "Voir le tableau de bord"),
    "users.view": ("users", "Voir les utilisateurs"),
    "users.manage": ("users", "Créer / modifier / désactiver les utilisateurs"),
    "roles.manage": ("roles", "Gérer les rôles et permissions"),
    "clients.view": ("clients", "Voir les clients"),
    "clients.manage": ("clients", "Créer / modifier / archiver les clients"),
    "requests.view": ("requests", "Voir les demandes de devis"),
    "requests.manage": ("requests", "Traiter les demandes de devis"),
    "quotes.view": ("quotes", "Voir les devis"),
    "quotes.manage": ("quotes", "Créer / modifier / envoyer les devis"),
    "invoices.view": ("invoices", "Voir les factures"),
    "invoices.manage": ("invoices", "Créer / modifier / annuler les factures"),
    "payments.view": ("payments", "Voir les paiements"),
    "payments.manage": ("payments", "Enregistrer / annuler les paiements"),
    "reports.view": ("reports", "Consulter les rapports financiers"),
    "settings.manage": ("settings", "Modifier les paramètres de l'entreprise"),
    "activity.view": ("activity", "Voir le journal d'activité"),
}

DEFAULT_ROLES = {
    "admin": {
        "name_fr": "Administrateur", "name_ar": "مدير النظام", "is_client_role": False,
        "permissions": list(PERMISSIONS.keys()),
    },
    "manager": {
        "name_fr": "Gestionnaire", "name_ar": "مسيّر", "is_client_role": False,
        "permissions": [
            "dashboard.view", "clients.view", "clients.manage", "requests.view", "requests.manage",
            "quotes.view", "quotes.manage", "invoices.view", "invoices.manage", "payments.view", "activity.view",
        ],
    },
    "accountant": {
        "name_fr": "Comptable", "name_ar": "محاسب", "is_client_role": False,
        "permissions": [
            "dashboard.view", "clients.view", "invoices.view", "payments.view", "payments.manage", "reports.view",
        ],
    },
    "client": {"name_fr": "Client", "name_ar": "حريف", "is_client_role": True, "permissions": []},
}
