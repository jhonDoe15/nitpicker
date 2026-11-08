SECRET_NAME_WORDS = [
    "password",
    "passwd",
    "pwd",
    "passphrase",
    "secret",
    "token",
    "credentials?",
    "apikey",
    "privatekey",
    "accesskey",
    "secretkey",
    "authkey",
    "signingkey",
    "encryptionkey",
    "hmackey",
    "jwtkey",
]
SECRET_VALUE_SUFFIXES = [
    "value",
    "raw",
    "str",
    "string",
    "text",
    "plain",
]
MARKER_TOKEN_WORDS = [
    "eos",
    "bos",
    "pad",
    "unk",
    "cls",
    "sep",
    "mask",
]
PASSPHRASE_NAME_WORDS = [
    "password",
    "passwd",
    "passphrase",
]
SECRET_VALUE_LENGTH = 6
SECRET_CHARACTER_CLASSES = 3
PASSPHRASE_LENGTH = 8
PLACEHOLDER_PATTERNS = [
    r"\*+\w{0,4}",
    r"x+",
    r"<.*>",
    r"\[.*\]",
    r"\$\{.*\}",
    r"\$[A-Za-z_]\w*",
    r"\{\{.*\}\}",
    r"\{\w*\}",
    r"%s",
    r"%\(\w+\)s",
    r":[A-Za-z_]+",
    r"changeme",
    r"change-me",
    r"todo",
    r"example",
    r"dummy",
    r"placeholder",
    r"redacted",
    r"none",
    r"null",
    r"undefined",
    r"your[-_ ].*",
]
NOT_SECRET_PATTERNS = [
    r"[A-Z][A-Z0-9_]+",
    r"[A-Za-z]+(?:[._:/-][A-Za-z]+)+",
    r"[a-z][a-z0-9_-]*(?:[./][a-z0-9_-]+)+",
    r"(?:~|\.{1,2})?(?:/[\w.-]+)+/?",
    r"\^.*\$",
]
IDENTIFIER_PATTERNS = [
    r"[a-z][a-z0-9]*(?:[_-][a-z0-9]+)+",
    r"[a-z]+(?:[A-Z][a-z0-9]*)+",
]
CREDENTIAL_SHAPES = [
    r"\bAKIA[0-9A-Z]{16}\b",
    r"\bgh[pousr]_[A-Za-z0-9]{30,}",
    r"\bxox[abprs]-[A-Za-z0-9-]{10,}",
    r"-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----",
    r"\b[rs]k_(?:live|test)_[A-Za-z0-9]{20,}",
    r"\bsk-(?:proj|ant|live|test)-[A-Za-z0-9_-]{20,}",
    r"\bdjango-insecure-\S{6,}",
]
EMBEDDED_SECRET_PATTERNS = [
    r"^[a-z][a-z0-9+.-]*://[^\s/:@]+:([^\s/@]+)@",
    r"^(?:bearer|basic|token)\s+(\S+)$",
    r"[?&;]password=([^&;\s]+)",
]
