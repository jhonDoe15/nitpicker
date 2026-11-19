import ast

STATE_DB = "_state.db"
PINS = {"default", "DEFAULT_DB_ALIAS"}
DERIVING = ("router.db_for_", "connections[", "connections.")


def alias_root(alias):
    return alias.split(".")[0].split("[")[0]


def derived_names(function, alias):
    names = {alias_root(alias)}
    for _ in range(3):
        for node in ast.walk(function):
            if not isinstance(node, ast.Assign):
                continue
            used = {n.id for n in ast.walk(node.value) if isinstance(n, ast.Name)}
            if used & names or derives_alias(node.value):
                names.update(t.id for t in node.targets if isinstance(t, ast.Name))
    return names


def derives_alias(node):
    text = ast.unparse(node)
    return any(part in text for part in DERIVING)


def is_pin(argument):
    if isinstance(argument, ast.Constant):
        return argument.value in PINS
    return ast.unparse(argument).rsplit(".", 1)[-1] in PINS


def names_alias(argument, names):
    if STATE_DB in ast.unparse(argument) or derives_alias(argument):
        return True
    if is_pin(argument):
        return True
    if isinstance(argument, ast.Constant):
        return argument.value in names
    return any(isinstance(n, ast.Name) and n.id in names for n in ast.walk(argument))


def wrong_argument(arguments, names):
    return next((a for a in arguments if not names_alias(a, names)), None)


def keyword_using(call):
    return [k.value for k in call.keywords if k.arg == "using"]


def guards_alias(function, alias):
    names = derived_names(function, alias)
    for node in ast.walk(function):
        if not isinstance(node, ast.If):
            continue
        text = ast.unparse(node.test)
        mentions = alias in text or any(
            isinstance(n, ast.Name) and n.id in names for n in ast.walk(node.test)
        )
        returns = any(isinstance(n, ast.Return) for b in node.body for n in ast.walk(b))
        if mentions and returns:
            return True
    return False
