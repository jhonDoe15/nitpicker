import ast

from boundary.type_aliases import has_any
from checks.common import dotted_name, finding

PYDANTIC_MODELS = {"BaseModel", "BaseSettings", "RootModel"}
PYDANTIC_ROOTS = {"pydantic", "pydantic_settings"}
PYDANTIC_DATACLASS = "pydantic.dataclasses.dataclass"
PASSES = 4


def top_level_values(context):
    def build(_):
        values = {}
        for node in context.tree.body:
            if isinstance(node, ast.Assign):
                for target in node.targets:
                    if isinstance(target, ast.Name):
                        values[target.id] = node.value
        return values

    return context.project.memo(("top-level-values", context.path), build)


def resolve_value(value, context):
    for _ in range(PASSES):
        if not isinstance(value, ast.Name):
            return value
        own = top_level_values(context).get(value.id)
        if own is not None:
            value = own
            continue
        dotted = context.aliases[0].get(value.id, "")
        located = context.project.locate(dotted) if "." in dotted else None
        owner = context.project.contexts.get(located[0]) if located else None
        if owner is None:
            return value
        value, context = top_level_values(owner).get(located[1], value), owner
    return value


def decorated_with_pydantic_dataclass(node, context):
    for decorator in node.decorator_list:
        target = decorator.func if isinstance(decorator, ast.Call) else decorator
        if dotted_name(target, context.aliases) == PYDANTIC_DATACLASS:
            return True
    return False


def derives_from_pydantic(node, context, known):
    for base in node.bases:
        name = dotted_name(base, context.aliases) or ""
        if (
            name.split(".")[0] in PYDANTIC_ROOTS
            and name.rsplit(".", 1)[-1] in PYDANTIC_MODELS
        ):
            return True
        located = context.project.locate(name) if "." in name else None
        if (located if located else (context.path, name)) in known:
            return True
    return False


def pydantic_classes(project):
    def build(_):
        known = {}
        for _ in range(PASSES):
            for path, context in project.contexts.items():
                for node in ast.walk(context.tree):
                    if not isinstance(node, ast.ClassDef) or (path, node.name) in known:
                        continue
                    if decorated_with_pydantic_dataclass(
                        node, context
                    ) or derives_from_pydantic(node, context, known):
                        known[(path, node.name)] = node
        return known

    return project.memo("pydantic-classes", build)


def allows_extra(value):
    if isinstance(value, ast.Constant):
        return value.value == "allow"
    return isinstance(value, ast.Attribute) and value.attr == "allow"


def keyword_allows(call):
    return any(
        keyword.arg == "extra" and allows_extra(keyword.value)
        for keyword in call.keywords
    )


def dict_allows(node):
    return any(
        isinstance(key, ast.Constant) and key.value == "extra" and allows_extra(value)
        for key, value in zip(node.keys, node.values)
    )


def config_allows_extra(value, context):
    value = resolve_value(value, context)
    if isinstance(value, ast.Call):
        return keyword_allows(value)
    return isinstance(value, ast.Dict) and dict_allows(value)


def decorator_allows_extra(node, context):
    for decorator in node.decorator_list:
        if isinstance(decorator, ast.Call):
            for keyword in decorator.keywords:
                if keyword.arg == "config" and config_allows_extra(
                    keyword.value, context
                ):
                    return True
    return False


def statement_allows_extra(statement, context):
    if isinstance(statement, ast.Assign):
        names = [t.id for t in statement.targets if isinstance(t, ast.Name)]
        if "model_config" in names and config_allows_extra(statement.value, context):
            return True
        return "extra" in names and allows_extra(statement.value)
    if isinstance(statement, ast.AnnAssign) and isinstance(statement.target, ast.Name):
        named = statement.target.id == "model_config" and statement.value is not None
        return named and config_allows_extra(statement.value, context)
    if isinstance(statement, ast.ClassDef) and statement.name == "Config":
        return class_allows_extra(statement, context)
    return False


def class_allows_extra(node, context):
    return (
        keyword_allows(node)
        or decorator_allows_extra(node, context)
        or any(statement_allows_extra(s, context) for s in node.body)
    )


def class_findings(path, node, context):
    found = []
    if class_allows_extra(node, context):
        found.append(finding(path, "pydantic-extra-allow", node.name, node))
    for statement in node.body:
        if isinstance(statement, ast.AnnAssign) and has_any(
            statement.annotation, context
        ):
            target = getattr(statement.target, "id", "field")
            found.append(
                finding(path, "pydantic-any-field", f"{node.name}.{target}", statement)
            )
    return found


def adapter_findings(context):
    found = []
    for node in ast.walk(context.tree):
        if not isinstance(node, ast.Call):
            continue
        name = dotted_name(node.func, context.aliases) or ""
        if (
            name == "pydantic.TypeAdapter"
            and node.args
            and has_any(node.args[0], context)
        ):
            found.append(
                finding(context.path, "pydantic-any-field", "TypeAdapter", node)
            )
        elif name == "pydantic.create_model" and any(
            has_any(keyword.value, context) for keyword in node.keywords
        ):
            found.append(
                finding(context.path, "pydantic-any-field", "create_model", node)
            )
    return found


def model_findings(context):
    known = pydantic_classes(context.project)
    found = []
    for (path, _name), node in known.items():
        if path == context.path:
            found.extend(class_findings(path, node, context))
    return found + adapter_findings(context)
