import ast

from checks.common import parameter_names
from concurrency.locks import (
    is_exclusive_construction,
    is_keyed_exclusive,
    named_like_a_lock,
)
from concurrency.shared import declared_names, receivers_of, stored_names

INIT = "__init__"
CAPACITY = "total_tokens"
FUNCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef)


def attribute_root(node):
    while isinstance(node, ast.Attribute):
        node = node.value
    return node.id if isinstance(node, ast.Name) else None


def paired(target, value):
    if isinstance(target, ast.Starred):
        return paired(target.value, None)
    if not isinstance(target, (ast.Tuple, ast.List)):
        return [(target, value)]
    same = (
        isinstance(value, (ast.Tuple, ast.List))
        and len(value.elts) == len(target.elts)
        and not any(isinstance(item, ast.Starred) for item in value.elts)
    )
    values = value.elts if same else [None] * len(target.elts)
    return [pair for t, v in zip(target.elts, values) for pair in paired(t, v)]


class LockKeys:
    def __init__(self, tree, aliases, parents):
        self.aliases = aliases
        self.parents = parents
        self.classes = {
            node.name: node for node in tree.body if isinstance(node, ast.ClassDef)
        }
        self.entries = {}
        self.declared = set()
        self.locals = {}
        for node in ast.walk(tree):
            self.collect(node)

    def owners(self, node):
        owner = self.parents.get(id(node))
        while owner is not None and not isinstance(owner, (*FUNCTIONS, ast.ClassDef)):
            owner = self.parents.get(id(owner))
        if isinstance(owner, ast.ClassDef):
            return None, owner
        return owner, None

    def local_names(self, function):
        if id(function) not in self.locals:
            declared = declared_names(function, (ast.Global, ast.Nonlocal))
            names = parameter_names(function) | stored_names(function)
            self.locals[id(function)] = names - declared
        return self.locals[id(function)]

    def collect(self, node):
        if isinstance(node, FUNCTIONS):
            for name in parameter_names(node):
                self.add(("local", id(node), name), None, False, node)
        elif isinstance(node, ast.Assign):
            for target in node.targets:
                self.record(node, paired(target, node.value))
        elif isinstance(node, ast.AnnAssign):
            if node.value is None:
                self.record(node, [(node.target, None)], declared=True)
            else:
                self.record(node, [(node.target, node.value)])
        elif isinstance(node, ast.NamedExpr):
            self.record(node, [(node.target, node.value)])
        elif isinstance(node, (ast.For, ast.AsyncFor)):
            self.record(node, paired(node.target, None))
        elif isinstance(node, (ast.With, ast.AsyncWith)):
            for item in node.items:
                if item.optional_vars is not None:
                    self.record(node, paired(item.optional_vars, None))
        elif isinstance(node, ast.AugAssign):
            self.record(node, [(node.target, None)])

    def record(self, statement, pairs, declared=False):
        function, klass = self.owners(statement)
        for target, value in pairs:
            if isinstance(target, ast.Attribute) and target.attr == CAPACITY:
                key = self.stored_key(target.value, function, klass)
                if key is not None:
                    self.add(key[0], None, False, function)
                continue
            key = self.stored_key(target, function, klass)
            if key is None:
                continue
            if declared:
                self.declared.add(key[0])
            else:
                self.add(key[0], value, key[1], function)

    def add(self, key, value, allowed, function):
        self.entries.setdefault(key, []).append((value, allowed, function))

    def stored_key(self, target, function, klass):
        if isinstance(target, ast.Name):
            if function is None:
                owner = ("class", id(klass)) if klass else ("module",)
                return (*owner, target.id), True
            if target.id in declared_names(function, ast.Global):
                return ("module", target.id), False
            return self.name_key(target.id, function), False
        if not isinstance(target, ast.Attribute):
            return None
        key = self.attribute_key(target, function)
        if key is None:
            return None
        owner = self.parents.get(id(function)) if function else None
        in_init = (
            function is not None
            and function.name == INIT
            and key[0] == "class"
            and key[1] == id(owner)
        )
        return key, function is None or in_init

    def name_key(self, name, function):
        scope = function
        while scope is not None:
            if name in declared_names(scope, ast.Global):
                return ("module", name)
            if name in self.local_names(scope):
                return ("local", id(scope), name)
            scope = self.owners(scope)[0]
        return ("module", name)

    def attribute_key(self, node, function):
        root = attribute_root(node)
        if root is None:
            return None
        rest = ast.unparse(node)[len(root) + 1 :]
        receivers = receivers_of(function, self.parents) if function else {}
        if root in receivers:
            return ("class", id(receivers[root]), rest)
        base = self.name_key(root, function) if function else ("module", root)
        if base[0] != "module":
            return None
        if root in self.classes:
            return ("class", id(self.classes[root]), rest)
        return ("module", ast.unparse(node))

    def known(self, key):
        return key in self.entries or key in self.declared

    def inherited(self, key):
        pending = [key]
        for current in pending:
            if self.known(current):
                return current
            klass = next(
                (c for c in self.classes.values() if current[:2] == ("class", id(c))),
                None,
            )
            for base in klass.bases if klass else []:
                if isinstance(base, ast.Name) and base.id in self.classes:
                    pending.append(("class", id(self.classes[base.id]), key[2]))
        return key

    def use_key(self, expression, function):
        if isinstance(expression, ast.Name):
            return self.name_key(expression.id, function)
        if isinstance(expression, ast.Attribute):
            key = self.attribute_key(expression, function)
            return self.inherited(key) if key and key[0] == "class" else key
        return None

    def value_exclusive(self, value, function, seen):
        if is_exclusive_construction(value, self.aliases):
            return True
        if not isinstance(value, ast.Name):
            return False
        key = self.name_key(value.id, function) if function else ("module", value.id)
        if key[0] == "local":
            return self.local_exclusive(key)
        return self.exclusive(key, seen)

    def local_exclusive(self, key):
        entries = self.entries.get(key, [])
        return bool(entries) and all(
            is_exclusive_construction(value, self.aliases) for value, _, _ in entries
        )

    def exclusive(self, key, seen=frozenset()):
        entries = self.entries.get(key, [])
        if key in seen or not entries:
            return False
        return all(
            allowed and self.value_exclusive(value, function, seen | {key})
            for value, allowed, function in entries
        )

    def keyed(self, key):
        entries = self.entries.get(key, [])
        return bool(entries) and all(
            allowed and is_keyed_exclusive(value, self.aliases)
            for value, allowed, _ in entries
        )

    def is_lock(self, expression, function):
        keyed = isinstance(expression, ast.Subscript)
        key = self.use_key(expression.value if keyed else expression, function)
        if key is None or not self.known(key):
            return named_like_a_lock(expression)
        if key[0] == "local":
            return False
        return self.keyed(key) if keyed else self.exclusive(key)
