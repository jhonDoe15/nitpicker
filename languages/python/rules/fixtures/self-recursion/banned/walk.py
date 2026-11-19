def total(node):
    return node.value + sum(total(child) for child in node.children)


def is_even(number):
    return number == 0 or is_odd(number - 1)


def is_odd(number):
    return number != 0 and is_even(number - 1)


def flatten(items):
    return [flat for item in items for flat in (flatten(item) if isinstance(item, list) else [item])]


class Tree:
    def depth(self, node):
        return 1 + max((self.depth(child) for child in node.children), default=0)

    def visit(self, node):
        self.visit_children(node)

    def visit_children(self, node):
        for child in node.children:
            self.visit(child)
