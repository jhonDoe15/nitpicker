import ast

from checks.common import dotted_name, finding
from security.values import argument, lookup, where_of

RULE = "weak-hmac"
HMAC_CALLS = {"hmac.new": 2, "hmac.HMAC": 2, "hmac.digest": 2}
HMAC_CALLS |= {"Crypto.Hash.HMAC.new": 2, "Cryptodome.Hash.HMAC.new": 2}
HMAC_CALLS |= {"cryptography.hazmat.primitives.hmac.HMAC": 1}
DIGEST_KEYWORDS = {"digestmod", "digest", "algorithm"}
WEAK = {"md5", "md4", "md2"}
WEAK_PREFIXES = ("hashlib.", "Crypto.Hash.", "Cryptodome.Hash.", "_hashlib.openssl_")
WEAK_CLASSES = "cryptography.hazmat.primitives.hashes."
MAX_DEPTH = 3


def weak_name(node, where, depth=0):
    if depth > MAX_DEPTH or node is None:
        return None
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value.lower() if node.value.lower() in WEAK else None
    if isinstance(node, ast.Call):
        name = dotted_name(node.func, where.context.aliases) or ""
        last = name.rsplit(".", 1)[-1].lower()
        if name.startswith(WEAK_CLASSES) and last in WEAK:
            return last
        return (
            weak_name(node.args[0], where, depth + 1)
            if name == "hashlib.new" and node.args
            else None
        )
    name = dotted_name(node, where.context.aliases) or ""
    last = name.rsplit(".", 1)[-1].lower().replace("openssl_", "", 1)
    if name.startswith(WEAK_PREFIXES) and last in WEAK:
        return last
    if isinstance(node, ast.Name):
        for kind, value, place in lookup(node.id, where):
            found = kind == "value" and weak_name(value, place, depth + 1)
            if found:
                return found
    return None


def hmac_finding(call, context):
    name = dotted_name(call.func, context.aliases)
    if name not in HMAC_CALLS:
        return None
    where = where_of(call, context)
    digest = next((k.value for k in call.keywords if k.arg in DIGEST_KEYWORDS), None)
    digest = digest or argument(call, HMAC_CALLS[name], "digestmod")
    weak = weak_name(digest, where)
    subject = ".".join(name.split(".")[-2:])
    return finding(context.path, RULE, f"{subject}({weak})", call) if weak else None


def check(context):
    if context.tests:
        return []
    found = (
        hmac_finding(node, context)
        for node in ast.walk(context.tree)
        if isinstance(node, ast.Call)
    )
    return [item for item in found if item is not None]
