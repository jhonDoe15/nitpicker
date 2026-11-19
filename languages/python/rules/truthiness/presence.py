import ast

from checks.common import finding
from signatures.annotations import (
    FUNCTION_TYPES,
    NONE_MEMBER,
    members_of,
    parameters_of,
    qualified_name,
    subscript_arguments,
)
from signatures.defaults import optional_parameters
from truthiness.evidence import (
    ASSIGNED,
    GENERIC,
    LITERAL,
    has_falsy_literal,
    is_generic_annotation,
    is_set_to_falsy,
    is_string_literal_annotation,
    type_variables,
)
from truthiness.fields import field_name, field_owners
from truthiness.numbers import scope_nodes

RULE = "presence-truthiness"
GUARDED = True
PRESENCE_TYPES = {"str", "bool", "Literal"}
ELEMENT_WRAPPERS = {"list", "List", "Sequence", "Iterable", "set", "Set", "frozenset"}
MAPPING_WRAPPERS = {"dict", "Dict", "Mapping", "MutableMapping"}
REBINDING = (ast.Assign, ast.AugAssign, ast.For, ast.NamedExpr, ast.comprehension)
EXITS = (ast.Return, ast.Raise, ast.Continue, ast.Break)
NONE_TESTS = (ast.Is, ast.IsNot, ast.Eq, ast.NotEq)


def is_presence_annotation(annotation):
    members = set(members_of(annotation))
    present = members - {NONE_MEMBER}
    is_plain = present <= PRESENCE_TYPES and (
        "Literal" not in present or is_string_literal_annotation(annotation)
    )
    return NONE_MEMBER in members and bool(present) and is_plain


def type_arguments(annotation, wrappers):
    if not isinstance(annotation, ast.Subscript):
        return []
    wrapper = members_of(annotation)[:1]
    return subscript_arguments(annotation) if wrapper and wrapper[0] in wrappers else []


def element_annotation(annotation, variables):
    arguments = type_arguments(annotation, ELEMENT_WRAPPERS)
    return arguments[0] if arguments and is_kind(arguments[0], variables) else None


def value_annotation(annotation, variables):
    arguments = type_arguments(annotation, MAPPING_WRAPPERS)
    return arguments[1] if len(arguments) == 2 and is_kind(arguments[1], variables) else None


def is_kind(annotation, variables):
    return is_presence_annotation(annotation) or is_generic_annotation(
        annotation, variables
    )


def type_evidence(annotation, variables):
    if is_generic_annotation(annotation, variables):
        return GENERIC
    return LITERAL if has_falsy_literal(annotation) else None


def targets_of(node):
    if isinstance(node, ast.Assign):
        return node.targets
    return [node.target] if hasattr(node, "target") else []


def rebound_names(nodes):
    return {
        name.id
        for node in nodes
        if isinstance(node, REBINDING)
        for target in targets_of(node)
        for name in ast.walk(target)
        if isinstance(name, ast.Name)
    }


def none_tested(nodes):
    found = set()
    for node in nodes:
        if isinstance(node, ast.Compare) and isinstance(node.ops[0], NONE_TESTS):
            sides = [node.left, *node.comparators]
            if any(isinstance(s, ast.Constant) and s.value is None for s in sides):
                found.update(ast.unparse(side) for side in sides)
    return found


def declared_names(function, nodes):
    declared = {
        argument.arg: argument.annotation
        for argument in parameters_of(function)
        if argument.annotation is not None
    }
    declared.update(
        {
            node.target.id: node.annotation
            for node in nodes
            if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name)
        }
    )
    return declared


def uses(branch, key):
    return any(
        isinstance(node, (ast.Name, ast.Attribute))
        and isinstance(node.ctx, ast.Load)
        and ast.unparse(node) == key
        for node in ast.walk(branch)
    )


def is_empty_default(node):
    return isinstance(node, ast.Constant) and (node.value is False or node.value == "")


def following(node, context):
    parent = context.parents.get(id(node))
    for _, value in ast.iter_fields(parent) if parent is not None else []:
        if isinstance(value, list) and node in value:
            return value[value.index(node) + 1 :]
    return []


class Scan:
    def __init__(self, function, context):
        nodes = list(scope_nodes(function))
        declared = declared_names(function, nodes)
        skipped = rebound_names(nodes) | none_tested(nodes)
        variables = type_variables(context, function)
        self.function = function
        self.context = context
        self.handled = optional_parameters(function)
        self.names = {
            name for name, annotation in declared.items() if is_kind(annotation, variables)
        } - skipped
        self.declared = {
            name: type_evidence(annotation, variables)
            for name, annotation in declared.items()
        }
        self.elements = {
            name: annotation
            for name, annotation in declared.items()
            if element_annotation(annotation, variables) is not None
        }
        self.mappings = {
            name: annotation
            for name, annotation in declared.items()
            if value_annotation(annotation, variables) is not None
        }
        self.contents = {
            name: type_evidence(
                element_annotation(annotation, variables)
                or value_annotation(annotation, variables),
                variables,
            )
            for name, annotation in {**self.elements, **self.mappings}.items()
        }
        self.elements = self.elements.keys() - skipped
        self.mappings = self.mappings.keys() - skipped
        self.owners = field_owners(
            function, context, parameters_of(function), is_presence_annotation
        )
        self.skipped = skipped
        self.nodes = nodes
        self.reported = set()
        self.found = []

    def subject(self, node):
        if isinstance(node, ast.Name) and node.id in self.names:
            return node.id
        key = field_name(node, self.owners)
        return key if key is not None and key not in self.skipped else None

    def evidence(self, key):
        found = self.declared.get(key)
        if found is None and is_set_to_falsy(self.context.project, self.function, key):
            return ASSIGNED
        return found

    def report(self, key, node, evidence):
        if evidence is not None and key not in self.reported:
            self.reported.add(key)
            label = f"{qualified_name(self.function, self.context)}({key})"
            item = finding(self.context.path, RULE, label, node)
            item["data"] = {"evidence": evidence}
            self.found.append(item)

    def check_test(self, node):
        key = self.subject(node.test)
        if key is None:
            return
        body = node.body if isinstance(node.body, list) else [node.body]
        is_kept = isinstance(node, ast.IfExp) and ast.unparse(node.body) in self.handled
        if not is_kept and any(uses(item, key) for item in body):
            self.report(key, node.test, self.evidence(key))

    def check_guard(self, node):
        test = node.test
        negated = isinstance(test, ast.UnaryOp) and isinstance(test.op, ast.Not)
        key = self.subject(test.operand) if negated else None
        is_exit = bool(node.body) and isinstance(node.body[-1], EXITS)
        is_used = key is not None and any(
            uses(item, key) for item in following(node, self.context)
        )
        if is_used and is_exit:
            self.report(key, test.operand, self.evidence(key))

    def check_bool(self, node):
        first = node.values[0]
        key = self.subject(first)
        if key is None:
            return
        if isinstance(node.op, ast.And):
            if any(uses(value, key) for value in node.values[1:]):
                self.report(key, first, self.evidence(key))
        elif key not in self.handled and not is_empty_default(node.values[-1]):
            self.report(key, node, self.evidence(key))

    def check_filter(self, node):
        is_filter = (
            isinstance(node.func, ast.Name)
            and node.func.id == "filter"
            and len(node.args) == 2
            and isinstance(node.args[0], ast.Constant)
            and node.args[0].value is None
        )
        source = node.args[1] if is_filter else None
        if isinstance(source, ast.Name) and source.id in self.elements:
            self.report(source.id, node, self.contents[source.id])

    def check_comprehension(self, node):
        target, source = node.target, node.iter
        is_element = isinstance(source, ast.Name) and source.id in self.elements
        if is_element and isinstance(target, ast.Name) and self.tests(node, target.id):
            self.report(source.id, source, self.contents[source.id])
        if self.is_items_of_mapping(source) and isinstance(target, ast.Tuple):
            value = target.elts[-1]
            if isinstance(value, ast.Name) and self.tests(node, value.id):
                self.report(
                    source.func.value.id, source, self.contents[source.func.value.id]
                )

    def tests(self, node, name):
        return any(isinstance(test, ast.Name) and test.id == name for test in node.ifs)

    def is_items_of_mapping(self, node):
        return (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and node.func.attr == "items"
            and isinstance(node.func.value, ast.Name)
            and node.func.value.id in self.mappings
        )

    def run(self):
        for node in self.nodes:
            if isinstance(node, (ast.If, ast.IfExp)):
                self.check_test(node)
                if isinstance(node, ast.If):
                    self.check_guard(node)
            elif isinstance(node, ast.BoolOp):
                self.check_bool(node)
            elif isinstance(node, ast.Call):
                self.check_filter(node)
            elif isinstance(node, ast.comprehension):
                self.check_comprehension(node)
        return self.found


def check(context):
    if context.tests:
        return []
    return [
        item
        for node in ast.walk(context.tree)
        if isinstance(node, FUNCTION_TYPES)
        for item in Scan(node, context).run()
    ]
