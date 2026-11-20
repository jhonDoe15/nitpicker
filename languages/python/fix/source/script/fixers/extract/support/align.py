import ast

from source_text import refuse

HOLE_TYPES = (str, int, float, bool)
SHAPE = "the copies are shaped differently"
NOT_PLAIN = "the copies differ in code that is not a plain value"
SKIPPED_FIELDS = {"type_comment", "kind"}


class Hole:
    def __init__(self, key, kind):
        self.key = key
        self.kind = kind
        self.occurrences = []


class Alignment:
    def __init__(self, locals_pair, inside=None):
        self.locals = locals_pair
        self.inside = inside
        self.forward = {}
        self.backward = {}
        self.holes = {}

    def bind(self, left, right):
        if self.forward.setdefault(left, right) != right:
            return False
        return self.backward.setdefault(right, left) == left

    def hole(self, pair, flags):
        left, right = pair
        if flags or type(left.value) is not type(right.value):
            refuse(NOT_PLAIN)
        kind = type(left.value).__name__
        key = (repr(left.value), repr(right.value), kind)
        hole = self.holes.setdefault(key, Hole(key, kind))
        hole.occurrences.append(pair)

    def name_step(self, names):
        left, right = names
        bound = (left in self.locals[0], right in self.locals[1])
        if bound[0] != bound[1]:
            refuse("one copy names a local where the other names an outer value")
        if not bound[0]:
            if left != right:
                refuse("the copies read differently named outer values")
            return
        if self.inside is not None and (left in self.inside[0]) != (right in self.inside[1]):
            refuse("a name is defined inside the run in only one copy")
        if not self.bind(left, right):
            refuse("the copies rename a local inconsistently")

    def constant_step(self, pair, flags):
        left, right = pair
        if type(left.value) is not type(right.value):
            refuse(NOT_PLAIN)
        if left.value == right.value and repr(left.value) == repr(right.value):
            return
        if not isinstance(left.value, HOLE_TYPES):
            refuse(NOT_PLAIN)
        self.hole(pair, flags)

    def field_pairs(self, pair, flags):
        left, right = pair
        pending = []
        for name, value in ast.iter_fields(left):
            other = getattr(right, name, None)
            if name in SKIPPED_FIELDS:
                continue
            inner = flags
            if isinstance(left, ast.JoinedStr):
                inner = inner | {"fstring"}
            if name == "annotation":
                inner = inner | {"annotation"}
            if isinstance(value, list):
                if not isinstance(other, list) or len(value) != len(other):
                    refuse(SHAPE)
                pending.extend((a, b, inner) for a, b in zip(value, other))
            elif isinstance(value, ast.AST):
                if not isinstance(other, ast.AST):
                    refuse(SHAPE)
                pending.append((value, other, inner))
                if name == "ctx" and type(value) is not type(other):
                    refuse(SHAPE)
            elif not self.leaf_step(left, name, (value, other)):
                refuse("the copies differ in a name or a token")
        return pending

    def leaf_step(self, node, name, pair):
        value, other = pair
        if isinstance(node, ast.Name) and name == "id":
            self.name_step(pair)
            return True
        if isinstance(node, ast.arg) and name == "arg":
            self.name_step(pair)
            return True
        if isinstance(node, ast.ExceptHandler) and name == "name" and value and other:
            self.name_step(pair)
            return True
        return value == other

    def run(self, pairs):
        pending = [(a, b, frozenset()) for a, b in pairs]
        for left, right, flags in pending:
            if type(left) is not type(right):
                refuse(NOT_PLAIN)
            if isinstance(left, ast.Constant):
                self.constant_step((left, right), flags)
            else:
                pending.extend(self.field_pairs((left, right), flags))
        return list(self.holes.values())
