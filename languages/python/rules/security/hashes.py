import ast

from checks.common import dotted_name, finding
from security.resolve.booleans import bound_values
from security.resolve.calls import argument, effective_calls
from security.resolve.scopes import where_of
from security.support import exempt

RULE = "weak-hmac"
HMAC_CALLS = {
    "hmac.new": 2,
    "hmac.HMAC": 2,
    "hmac.digest": 2,
    "Crypto.Hash.HMAC.new": 2,
    "Cryptodome.Hash.HMAC.new": 2,
    "cryptography.hazmat.primitives.hmac.HMAC": 1,
}
PADDING = "cryptography.hazmat.primitives.asymmetric.padding."
NO_COLLISION_CALLS = {
    f"{PADDING}OAEP": ("algorithm", 1),
    f"{PADDING}MGF1": ("algorithm", 0),
}
DIGEST_KEYWORDS = {"digestmod", "digest", "algorithm"}
WEAK = {"md5", "md4", "md2"}
WEAK_PREFIXES = ("hashlib.", "Crypto.Hash.", "Cryptodome.Hash.", "_hashlib.openssl_")
WEAK_CLASSES = "cryptography.hazmat.primitives.hashes."
MAX_DEPTH = 4
HASH_RULE = "S303"


def leaves(node, where, depth=0):
    if depth > MAX_DEPTH or node is None:
        return []
    if isinstance(node, ast.Lambda):
        return leaves(node.body, where, depth + 1)
    if isinstance(node, ast.Call):
        name = dotted_name(node.func, where.context.aliases) or ""
        if name == "hashlib.new" and node.args:
            return leaves(node.args[0], where, depth + 1)
        return [(node, where)]
    values = (
        bound_values(node, where) if isinstance(node, (ast.Name, ast.Attribute)) else []
    )
    found = [
        item for value, place in values for item in leaves(value, place, depth + 1)
    ]
    return found or [(node, where)]


def weak_leaf(node, where):
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value.lower() if node.value.lower() in WEAK else None
    target = node.func if isinstance(node, ast.Call) else node
    name = dotted_name(target, where.context.aliases) or ""
    last = name.rsplit(".", 1)[-1].lower().replace("openssl_", "", 1)
    if name.startswith((WEAK_CLASSES,) + WEAK_PREFIXES) and last in WEAK:
        return last
    return None


def digest_of(call, name):
    digest = next((k.value for k in call.keywords if k.arg in DIGEST_KEYWORDS), None)
    return digest or argument(call, HMAC_CALLS[name], "digestmod")


def weak_digest(digest, where):
    return next(
        filter(None, (weak_leaf(*leaf) for leaf in leaves(digest, where))), None
    )


def hmac_finding(node, call, where, path):
    name = dotted_name(call.func, where.context.aliases)
    if name not in HMAC_CALLS:
        return None
    weak = weak_digest(digest_of(call, name), where)
    subject = ".".join(name.split(".")[-2:])
    return finding(path, RULE, f"{subject}({weak})", node) if weak else None


def check(context):
    if exempt(context):
        return []
    found = (
        hmac_finding(node, call, where, context.path)
        for node, call, where, _ in effective_calls(context, where_of)
    )
    return [item for item in found if item is not None]


def allowed_hash_sites(call, where):
    name = dotted_name(call.func, where.context.aliases)
    if name in HMAC_CALLS:
        digest = digest_of(call, name)
    elif name in NO_COLLISION_CALLS:
        keyword_name, index = NO_COLLISION_CALLS[name]
        digest = argument(call, index, keyword_name)
    else:
        return []
    return [
        {"rule": HASH_RULE, "path": place.context.path, "line": leaf.lineno}
        for leaf, place in leaves(digest, where)
        if isinstance(leaf, ast.Call) and hasattr(leaf, "lineno")
    ]


def allowances(context):
    return [
        site
        for _, call, where, _ in effective_calls(context, where_of)
        for site in allowed_hash_sites(call, where)
    ]
