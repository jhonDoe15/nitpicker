import ast

from review.common import (
    FUNCTION_TYPES,
    every_parameter,
    finding,
    last_segment,
    parts_of,
    scoped_definitions,
    unwrapped,
)
from review.project.index import MAX_REEXPORT_DEPTH

ENUM_BASES = {"Enum", "IntEnum", "StrEnum", "ReprEnum"}
FLAG_BASES = {"Flag", "IntFlag"}
TYPE_GUARDS = {"TypeGuard", "TypeIs"}
MINIMUM_MEMBERS = 3
CHAIN_OPERATORS = {ast.Or: (ast.Eq, ast.Is), ast.And: (ast.NotEq, ast.IsNot)}
MEMBERSHIP = (ast.In, ast.NotIn)
VALUE_SLOTS = (ast.Return, ast.Assign, ast.AnnAssign, ast.AugAssign)


def literal_values(node):
    if not (isinstance(node, ast.Subscript) and last_segment(node.value) == "Literal"):
        return None
    parts = parts_of(node)
    values = [part.value for part in parts if isinstance(part, ast.Constant)]
    return values if len(values) == len(parts) else None


def is_alias(value, names, values):
    if isinstance(value, ast.Name):
        return value.id in names
    return isinstance(value, ast.Constant) and value.value in values


def enum_members(node):
    names, values = [], []
    for statement in node.body:
        target, value = alias_value(statement)
        if not isinstance(target, ast.Name) or target.id.startswith("_"):
            continue
        if not is_alias(value, names, values):
            names.append(target.id)
            values.extend([value.value] if isinstance(value, ast.Constant) else [])
    return names


def alias_value(statement):
    if isinstance(statement, ast.Assign) and len(statement.targets) == 1:
        return statement.targets[0], statement.value
    if isinstance(statement, ast.AnnAssign) and statement.value is not None:
        return statement.target, statement.value
    if type(statement).__name__ == "TypeAlias":
        return statement.name, statement.value
    return None, None


def literal_aliases(tree):
    aliases = {}
    for statement in tree.body:
        target, value = alias_value(statement)
        values = literal_values(unwrapped(value)) if value is not None else None
        if isinstance(target, ast.Name) and values is not None:
            aliases[target.id] = values
    return aliases


def is_reference(node):
    while isinstance(node, ast.Attribute):
        node = node.value
    return isinstance(node, ast.Name)


class EnumPredicates:
    def __init__(self, index):
        self.index = index
        self.literals = {
            path: literal_aliases(tree) for path, tree in index.trees.items()
        }

    def class_of(self, path, node, depth=0):
        resolved = self.index.resolve(path, node)
        if resolved is not None:
            target_path, _, nodes = resolved
            single = nodes[0] if len(nodes) == 1 else None
            return (target_path, single) if isinstance(single, ast.ClassDef) else None
        if not isinstance(node, ast.Attribute) or depth > MAX_REEXPORT_DEPTH:
            return None
        owner = self.class_of(path, node.value, depth + 1)
        if owner is None:
            return None
        nested = [
            statement
            for statement in owner[1].body
            if isinstance(statement, ast.ClassDef) and statement.name == node.attr
        ]
        return (owner[0], nested[0]) if len(nested) == 1 else None

    def enum_kind(self, path, node, depth=0):
        kinds = set()
        for base in node.bases:
            name = last_segment(base)
            if name in FLAG_BASES:
                kinds.add("flag")
            elif name in ENUM_BASES:
                kinds.add("enum")
            elif depth < MAX_REEXPORT_DEPTH:
                found = self.class_of(path, base)
                kinds.add(None if found is None else self.enum_kind(*found, depth + 1))
        return "flag" if "flag" in kinds else "enum" if "enum" in kinds else None

    def enum_of(self, path, node):
        found = self.class_of(path, node)
        if found is None or self.enum_kind(*found) != "enum":
            return None
        return found[1].name, tuple(enum_members(found[1])), found[1]

    def literal_type(self, path, annotation):
        annotation = unwrapped(annotation)
        values = literal_values(annotation)
        if values is not None:
            return "the Literal", tuple(values), None
        origin = self.index.origin(path, annotation)
        values = None if origin is None else self.literals[origin[0]].get(origin[1])
        return None if values is None else (origin[1], tuple(values), None)

    def member(self, context, subject, value):
        if isinstance(value, ast.Attribute):
            enum = self.enum_of(context["path"], value.value)
            return None if enum is None else (enum, value.attr)
        if not isinstance(value, ast.Constant) or not isinstance(subject, ast.Name):
            return None
        annotation = context["annotations"].get(subject.id)
        union = (
            None
            if annotation is None
            else self.literal_type(context["path"], annotation)
        )
        return None if union is None else (union, value.value)

    def comparison(self, context, left, right):
        for subject, value in ((left, right), (right, left)):
            found = (
                self.member(context, subject, value) if is_reference(subject) else None
            )
            if found is not None:
                return ast.dump(subject), found
        return None

    def comparisons(self, context, node):
        if (
            isinstance(node, ast.Compare)
            and len(node.ops) == 1
            and isinstance(node.ops[0], MEMBERSHIP)
        ):
            values = node.comparators[0]
            if isinstance(values, (ast.Tuple, ast.List, ast.Set)) and values.elts:
                return [
                    self.comparison(context, node.left, value) for value in values.elts
                ]
            return None
        if not isinstance(node, ast.BoolOp) or type(node.op) not in CHAIN_OPERATORS:
            return None
        operators = CHAIN_OPERATORS[type(node.op)]
        found = []
        for value in node.values:
            single = isinstance(value, ast.Compare) and len(value.ops) == 1
            if not single or not isinstance(value.ops[0], operators):
                return None
            found.append(self.comparison(context, value.left, value.comparators[0]))
        return found

    def predicate(self, context, node):
        found = self.comparisons(context, node)
        if not found or len(found) < 2 or any(entry is None for entry in found):
            return None
        subjects = {subject for subject, _ in found}
        unions = {union for _, (union, _) in found}
        if len(subjects) != 1 or len(unions) != 1:
            return None
        ((name, members, node),) = unions
        if node is not None and node is context.get("owner"):
            return None
        compared = {member for _, (_, member) in found}
        if (
            len(compared) < 2
            or len(members) < MINIMUM_MEMBERS
            or not compared < set(members)
        ):
            return None
        return {"union": name}

    def candidates(self, node):
        pending = [node]
        while pending:
            current = pending.pop()
            yield current
            if isinstance(current, ast.UnaryOp) and isinstance(current.op, ast.Not):
                pending.append(current.operand)
            elif isinstance(current, ast.IfExp):
                pending.extend([current.body, current.orelse])
            elif isinstance(current, ast.BoolOp):
                pending.extend(current.values)

    def findings_in(self, context, values, scope):
        found = []
        for value in values:
            for candidate in self.candidates(value):
                result = self.predicate(context, candidate)
                if result is not None:
                    subject = f"{scope} {result['union']}".strip()
                    found.append(
                        finding(
                            "exhaustive-enum-predicate",
                            context["path"],
                            subject,
                            candidate.lineno,
                            result,
                        )
                    )
                    break
        return found


def slot_values(owner):
    values = []
    pending = list(ast.iter_child_nodes(owner))
    while pending:
        node = pending.pop()
        if isinstance(node, (ast.ClassDef,) + FUNCTION_TYPES):
            continue
        if isinstance(node, VALUE_SLOTS) and node.value is not None:
            values.append(node.value)
        elif isinstance(node, ast.Lambda):
            values.append(node.body)
        pending.extend(ast.iter_child_nodes(node))
    return values


def parameter_annotations(fn):
    return {
        p.arg: p.annotation for p in every_parameter(fn) if p.annotation is not None
    }


def returns_type_guard(fn):
    returns = fn.returns
    return (
        isinstance(returns, ast.Subscript)
        and last_segment(returns.value) in TYPE_GUARDS
    )


def enum_predicate_findings(index):
    checker = EnumPredicates(index)
    found = []
    for path, tree in index.production_trees():
        found.extend(
            checker.findings_in(
                {"path": path, "annotations": {}}, slot_values(tree), ""
            )
        )
        parents = index.parents[path]
        for node, scope in scoped_definitions(tree):
            if isinstance(node, FUNCTION_TYPES) and not returns_type_guard(node):
                owner = parents.get(id(node))
                context = {
                    "path": path,
                    "annotations": parameter_annotations(node),
                    "owner": owner if isinstance(owner, ast.ClassDef) else None,
                }
                found.extend(
                    checker.findings_in(context, slot_values(node), ".".join(scope))
                )
    return found
