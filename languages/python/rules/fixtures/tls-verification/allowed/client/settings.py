import os

CA_BUNDLE = os.environ.get("CA_BUNDLE") or "/etc/ssl/certs/ca-certificates.crt"
