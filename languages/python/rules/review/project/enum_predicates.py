import ast

from review.common import (
    FUNCTION_TYPES,
    every_parameter,
    finding,
    last_segment,
    parts_of,
    scoped_definitions,
    without_none,
)

ENUM_BASES = {"Enum", "IntEnum", "StrEnum"}
TYPE_GUARDS = {"TypeGuard", "TypeIs"}
MINIMUM_MEMBERS = 3
CHAIN_OPERATORS = {ast.Or: (ast.Eq, ast.Is), ast.And: (ast.NotEq, ast.IsNot)}
MEMBERSHIP = (ast.In, ast.NotIn)


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
        values = literal_values(value) if value is not None else None
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
        self.literals = {path: literal_aliases(tree) for path, tree in index.trees.items()}

    def enum_of(self, path, node):
        resolved = self.index.resolve(path, node)
        if resolved is None:
            return None
        _, name, nodes = resolved
        enum = nodes[0] if len(nodes) == 1 else None
        bases = {last_segment(base) for base in getattr(enum, "bases", [])}
        is_enum = isinstance(enum, ast.ClassDef) and bool(bases & ENUM_BASES)
        return (name, enum_members(enum)) if is_enum else None

    def literal_type(self, path, annotation):
        annotation = without_none(annotation)
        values = literal_values(annotation)
        if values is not None:
            return "the Literal", values
        if isinstance(annotation, ast.Name) and annotation.id in self.literals[path]:
            return annotation.id, self.literals[path][annotation.id]
        binding = self.index.bindings[path].get(getattr(annotation, "id", None))
        if binding is None or binding[0] != "name":
            return None
        source = self.index.paths.get(binding[1])
        values = self.literals.get(source, {}).get(binding[2])
        return (binding[2], values) if values is not None else None

    def member(self, context, subject, value):
        if isinstance(value, ast.Attribute):
            enum = self.enum_of(context["path"], value.value)
            return None if enum is None else (enum, value.attr)
        if not isinstance(value, ast.Constant) or not isinstance(subject, ast.Name):
            return None
        annotation = context["annotations"].get(subject.id)
        union = None if annotation is None else self.literal_type(context["path"], annotation)
        return None if union is None else (union, value.value)

    def comparison(self, context, left, right):
        for subject, value in ((left, right), (right, left)):
            found = self.member(context, subject, value) if is_reference(subject) else None
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
                return [self.comparison(context, node.left, value) for value in values.elts]
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
        unions = {(union[0], tuple(union[1])) for _, (union, _) in found}
        if len(subjects) != 1 or len(unions) != 1:
            return None
        ((name, members),) = unions
        compared = {member for _, (_, member) in found}
        if len(compared) < 2 or len(members) < MINIMUM_MEMBERS or not compared < set(members):
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
        if isinstance(node, (ast.Return, ast.Assign, ast.AnnAssign)) and node.value is not None:
            values.append(node.value)
        elif isinstance(node, ast.Lambda):
            values.append(node.body)
        pending.extend(ast.iter_child_nodes(node))
    return values


def parameter_annotations(fn):
    return {p.arg: p.annotation for p in every_parameter(fn) if p.annotation is not None}


def returns_type_guard(fn):
    returns = fn.returns
    return isinstance(returns, ast.Subscript) and last_segment(returns.value) in TYPE_GUARDS


def enum_predicate_findings(index):
    checker = EnumPredicates(index)
    found = []
    for path, tree in index.production_trees():
        found.extend(checker.findings_in({"path": path, "annotations": {}}, slot_values(tree), ""))
        for node, scope in scoped_definitions(tree):
            if isinstance(node, FUNCTION_TYPES) and not returns_type_guard(node):
                context = {"path": path, "annotations": parameter_annotations(node)}
                found.extend(checker.findings_in(context, slot_values(node), ".".join(scope)))
    return found
