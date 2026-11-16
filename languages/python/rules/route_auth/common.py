import ast
from collections import namedtuple

from checks.common import words_of

Handler = namedtuple("Handler", "name node context auth public")
AUTH_WORDS = {
    "auth",
    "authenticate",
    "authenticated",
    "authorize",
    "authorized",
    "authorization",
    "current",
    "token",
    "permission",
    "permissions",
    "role",
    "roles",
    "login",
    "principal",
    "jwt",
    "oauth2",
    "bearer",
    "apikey",
    "scope",
    "scopes",
    "guard",
    "require",
    "requires",
    "required",
    "verify",
    "security",
    "admin",
    "superuser",
    "staff",
}
PUBLIC_WORDS = {
    "login",
    "logout",
    "signin",
    "signup",
    "register",
    "token",
    "health",
    "healthz",
    "ping",
    "ready",
    "readiness",
    "liveness",
    "version",
    "public",
    "webhook",
    "webhooks",
    "callback",
    "docs",
    "openapi",
    "metrics",
    "status",
    "schema",
    "reset",
    "forgot",
    "verify",
    "oauth",
    "sso",
}
THRESHOLD = 0.9
MINIMUM = 5


def last_name(node):
    if isinstance(node, ast.Call):
        node = node.func
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        return node.attr
    return None


def is_auth_name(name):
    return bool(name) and bool(set(words_of(name)) & AUTH_WORDS)


def is_public(*texts):
    words = {word for text in texts if text for word in words_of(text)}
    return bool(words & PUBLIC_WORDS)


def string_value(node):
    return (
        node.value
        if isinstance(node, ast.Constant) and isinstance(node.value, str)
        else ""
    )


def class_bases(node):
    return [last_name(base) for base in node.bases if last_name(base)]


def keyword_value(call, name):
    return next((k.value for k in call.keywords if k.arg == name), None)
