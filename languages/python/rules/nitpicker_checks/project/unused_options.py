import ast

from nitpicker_checks.common import FUNCTION_TYPES, finding, is_test_path

MAIN_GUARD = "__main__"


def positional(fn):
    return list(getattr(fn.args, "posonlyargs", [])) + list(fn.args.args)


def defaulted_parameters(fn):
    parameters = positional(fn)
    first_default = len(parameters) - len(fn.args.defaults)
    found = [(p, index) for index, p in enumerate(parameters) if index >= first_default]
    keyword_only = zip(fn.args.kwonlyargs, fn.args.kw_defaults)
    return found + [(p, None) for p, default in keyword_only if default is not None]


def is_target(path, statement):
    return (
        isinstance(statement, FUNCTION_TYPES)
        and not statement.decorator_list
        and not statement.name.startswith("__")
        and not is_test_path(path)
        and bool(defaulted_parameters(statement))
    )


def is_main_guard(node):
    test = node.test if isinstance(node, ast.If) else None
    return (
        isinstance(test, ast.Compare)
        and isinstance(test.left, ast.Name)
        and test.left.id == "__name__"
        and any(isinstance(c, ast.Constant) and c.value == MAIN_GUARD for c in test.comparators)
    )


def guarded_nodes(tree):
    return {
        id(child)
        for statement in tree.body
        if is_main_guard(statement)
        for child in ast.walk(statement)
    }


def is_loaded_reference(node):
    return isinstance(node, (ast.Name, ast.Attribute)) and isinstance(node.ctx, ast.Load)


def passes_of(call):
    names = {keyword.arg for keyword in call.keywords if keyword.arg is not None}
    starred = [
        index for index, argument in enumerate(call.args) if isinstance(argument, ast.Starred)
    ]
    return {
        "all": any(keyword.arg is None for keyword in call.keywords),
        "positional": starred[0] if starred else len(call.args),
        "spread": bool(starred),
        "names": names,
    }


def passes(call, parameter, position):
    if call["all"] or parameter.arg in call["names"]:
        return True
    if position is None:
        return False
    return call["spread"] or position < call["positional"]


class Usage:
    def __init__(self, index, options):
        self.index = index
        self.published = options.get("published") is True
        self.entries = {tuple(entry.split(":", 1)) for entry in options.get("entryPoints", [])}
        self.calls = {}
        self.blocked = set()

    def counts(self, path):
        return self.published or not is_test_path(path)

    def target_key(self, path, node):
        resolved = self.index.resolve(path, node)
        if resolved is None or not isinstance(resolved[2][0], FUNCTION_TYPES):
            return None
        return resolved[0], resolved[1]

    def record_file(self, path, tree):
        guarded = guarded_nodes(tree)
        callees = {id(node.func) for node in ast.walk(tree) if isinstance(node, ast.Call)}
        for node in ast.walk(tree):
            if isinstance(node, ast.Call):
                self.record_call(path, node, id(node) in guarded)
            elif is_loaded_reference(node) and id(node) not in callees:
                key = self.target_key(path, node)
                if key is not None and self.counts(path):
                    self.blocked.add(key)
        for module in self.index.star_imported(path):
            source = self.index.paths.get(module)
            for name in self.index.definitions.get(source, {}):
                self.blocked.add((source, name))

    def record_call(self, path, call, guarded):
        key = self.target_key(path, call.func)
        if key is None or not self.counts(path):
            return
        if guarded:
            self.blocked.add(key)
        self.calls.setdefault(key, []).append(passes_of(call))

    def judged(self, key):
        module = self.index.modules.get(key[0])
        return (
            key in self.calls and key not in self.blocked and (module, key[1]) not in self.entries
        )


def unused_option_findings(index, options):
    usage = Usage(index, options)
    for path, tree in index.trees.items():
        usage.record_file(path, tree)
    scope = "published" if usage.published else "private"
    found = []
    for path, tree in index.trees.items():
        for statement in tree.body:
            key = (path, getattr(statement, "name", None))
            if not is_target(path, statement) or not usage.judged(key):
                continue
            for parameter, position in defaulted_parameters(statement):
                if not any(passes(call, parameter, position) for call in usage.calls[key]):
                    subject = f"{statement.name}.{parameter.arg}"
                    found.append(
                        finding("unused-option", path, subject, parameter.lineno, {"scope": scope})
                    )
    return found
