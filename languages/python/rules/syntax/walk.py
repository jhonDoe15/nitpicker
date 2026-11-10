import ast


class IterativeVisitor:
    def __init__(self):
        self.pending = []

    def visit(self, root):
        outer, self.pending = self.pending, [root]
        stack = self.pending
        while stack:
            item = stack.pop()
            if callable(item):
                item()
                continue
            method = getattr(self, "visit_" + type(item).__name__, None)
            if method is None:
                self.generic_visit(item)
            else:
                method(item)
        self.pending = outer

    def generic_visit(self, node):
        self.pending.extend(reversed(list(ast.iter_child_nodes(node))))

    def on_exit(self, callback):
        self.pending.append(callback)


def same_tree(left, right):
    pending = [(left, right)]
    while pending:
        first, second = pending.pop()
        if isinstance(first, ast.AST):
            if type(first) is not type(second):
                return False
            for field in first._fields:
                pending.append((getattr(first, field, None), getattr(second, field, None)))
        elif isinstance(first, list):
            if not isinstance(second, list) or len(first) != len(second):
                return False
            pending.extend(zip(first, second))
        elif first != second or type(first) is not type(second):
            return False
    return True


def if_chain(node):
    tests, bodies = [], []
    current = node
    while True:
        tests.append(current.test)
        bodies.append(current.body)
        rest = current.orelse
        if len(rest) == 1 and isinstance(rest[0], ast.If):
            current = rest[0]
            continue
        return tests, bodies, rest
