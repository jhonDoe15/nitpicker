DATABASES = {
    "default": {"ENGINE": "django.db.backends.postgresql", "OPTIONS": {"options": "-c statement_timeout=5000"}},
    "replica": {"ENGINE": "django.db.backends.postgresql", "OPTIONS": {"options": "-c statement_timeout=5000"}},
}
