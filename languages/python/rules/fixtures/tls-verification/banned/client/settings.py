import os

DEBUG = os.environ.get("DEBUG") == "1"
VERIFY_TLS = os.environ.get("VERIFY_TLS", "1") != "0"
