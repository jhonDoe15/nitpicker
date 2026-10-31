import ast

from checkpoints.effects import awaited_name, call_label, is_checkpoint, walk_executed

CLEAN = "clean"
DONE = "done"
DIRTY = "dirty:"
KINDS = ("normal", "return", "break", "continue")
ROUNDS = 4


def dirty(label):
    return DIRTY + label


def is_dirty(state):
    return state.startswith(DIRTY)


def empty():
    return {kind: set() for kind in KINDS}


def merge(target, source, skip=()):
    for kind in KINDS:
        if kind not in skip:
            target[kind] |= source[kind]


class Analysis:
    def __init__(self, aliases, quiet, cheapness):
        self.aliases = aliases
        self.quiet = quiet
        self.cheapness = cheapness

    def effect(self, nodes, states):
        checkpoint, labels = False, []
        for root in nodes:
            for node in walk_executed(root):
                if is_checkpoint(node) and not self.is_quiet_await(node):
                    checkpoint = True
                elif isinstance(node, ast.Call) and self.is_work(node):
                    labels.append(call_label(node, self.aliases))
        if checkpoint:
            return {DONE}
        if not labels:
            return set(states)
        return {
            state if state == DONE else self.worked(state, min(labels))
            for state in states
        }

    def worked(self, state, witness):
        return state if is_dirty(state) else dirty(witness)

    def contains_checkpoint(self, statements):
        return any(
            is_checkpoint(node) and not self.is_quiet_await(node)
            for statement in statements
            for node in walk_executed(statement)
        )

    def is_quiet_await(self, node):
        return isinstance(node, ast.Await) and awaited_name(node) in self.quiet

    def is_work(self, call):
        quiet_call = isinstance(call.func, ast.Name) and call.func.id in self.quiet
        return quiet_call or not self.cheapness.is_cheap(call)

    def block(self, statements, states):
        exits = empty()
        current = set(states)
        for statement in statements:
            if not current:
                break
            result = self.statement(statement, current)
            merge(exits, result, skip=("normal",))
            current = result["normal"]
        exits["normal"] = current
        return exits

    def statement(self, node, states):
        handler = getattr(self, f"on_{type(node).__name__}", None)
        if handler is not None:
            return handler(node, states)
        exits = empty()
        exits["normal"] = self.effect(self.expressions(node), states)
        return exits

    def expressions(self, node):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            return []
        return [
            child
            for child in ast.iter_child_nodes(node)
            if not isinstance(child, ast.stmt)
        ]

    def on_Return(self, node, states):
        exits = empty()
        exits["return"] = self.effect(self.expressions(node), states)
        return exits

    def on_Raise(self, node, states):
        return empty()

    def on_Break(self, node, states):
        exits = empty()
        exits["break"] = set(states)
        return exits

    def on_Continue(self, node, states):
        exits = empty()
        exits["continue"] = set(states)
        return exits

    def on_If(self, node, states):
        tested = self.effect([node.test], states)
        exits = self.block(node.body, tested)
        merge(exits, self.block(node.orelse, tested))
        return exits

    def on_With(self, node, states):
        entered = self.effect([item.context_expr for item in node.items], states)
        return self.block(node.body, entered)

    def on_AsyncWith(self, node, states):
        return self.block(node.body, {DONE})

    def on_While(self, node, states):
        forever = isinstance(node.test, ast.Constant) and bool(node.test.value)
        return self.loop(node, states, [node.test], forever=forever)

    def on_For(self, node, states):
        return self.loop(node, self.effect([node.iter], states), [])

    def on_AsyncFor(self, node, states):
        return self.loop(node, {DONE}, [], suspends=True)

    def loop(self, node, entry, tests, forever=False, suspends=False):
        heads = set(entry)
        for _ in range(ROUNDS):
            tested = {DONE} if suspends else self.effect(tests, heads)
            body = self.block(node.body, tested)
            grown = heads | body["normal"] | body["continue"]
            if grown == heads:
                break
            heads = grown
        tested = {DONE} if suspends else self.effect(tests, heads)
        body = self.block(node.body, tested)
        exits = empty()
        merge(exits, body, skip=("normal", "break", "continue"))
        exits["normal"] = set(body["break"])
        if not forever:
            ended = self.block(node.orelse, tested)
            merge(exits, ended, skip=("normal",))
            exits["normal"] |= ended["normal"]
        return exits

    def on_Try(self, node, states):
        body = self.block(node.body, states)
        recovery = {DONE} if self.contains_checkpoint(node.body) else states
        exits = empty()
        merge(exits, body, skip=("normal",))
        done = self.block(node.orelse, body["normal"])
        merge(exits, done, skip=("normal",))
        exits["normal"] |= done["normal"]
        for handler in node.handlers:
            caught = self.block(handler.body, recovery)
            merge(exits, caught)
        return self.finish(node.finalbody, exits)

    on_TryStar = on_Try

    def finish(self, statements, exits):
        if not statements:
            return exits
        result = empty()
        for kind in KINDS:
            if exits[kind]:
                result[kind] = self.block(statements, exits[kind])["normal"]
        return result

    def on_Match(self, node, states):
        subject = self.effect([node.subject], states)
        exits = empty()
        for case in node.cases:
            guarded = self.effect([case.guard], subject) if case.guard else subject
            merge(exits, self.block(case.body, guarded))
        if not any(self.irrefutable(case) for case in node.cases):
            exits["normal"] |= subject
        return exits

    def irrefutable(self, case):
        pattern = case.pattern
        return (
            case.guard is None
            and isinstance(pattern, ast.MatchAs)
            and pattern.pattern is None
        )
