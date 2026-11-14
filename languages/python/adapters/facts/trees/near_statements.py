from near_tree_parts import NONE, BaseConverter, located, operator


class StatementConverter(BaseConverter):
    def looped(self, loop, value, source):
        if not source.orelse:
            return loop
        return self.grouped("statement", value, source, [loop, self.block(source.orelse, source)])

    def on_Expr(self, source):
        return located("evaluate", source, [self.get(source.value)])

    def on_Assign(self, source):
        node = self.get(source.value)
        for target in reversed(source.targets):
            node = located("assign", source, [self.get(target), node], value="=")
        return located("evaluate", source, [node])

    def on_AugAssign(self, source):
        value = operator(source.op) + "="
        assign = located("assign", source, [self.get(source.target), self.get(source.value)], value=value)
        return located("evaluate", source, [assign])

    def on_AnnAssign(self, source):
        children = [self.type_of(source.annotation), self.get(source.target), self.get(source.value)]
        return located("declare", source, children)

    def on_If(self, source):
        alternative = self.block(source.orelse, source) if source.orelse else NONE
        return located("if", source, [self.get(source.test), self.block(source.body, source), alternative])

    def on_For(self, source):
        children = [NONE, self.get(source.target), self.get(source.iter), self.block(source.body, source)]
        return self.looped(located("foreach", source, children), "for-else", source)

    on_AsyncFor = on_For

    def on_While(self, source):
        loop = located("while", source, [self.get(source.test), self.block(source.body, source)])
        return self.looped(loop, "while-else", source)

    def on_Return(self, source):
        return located("return", source, [self.get(source.value)])

    def on_Raise(self, source):
        error = self.get(source.exc)
        if source.cause is not None:
            error = self.grouped("expression", "cause", source, [error, self.get(source.cause)])
        return located("throw", source, [error])

    def on_Break(self, source):
        return located("break", source)

    def on_Continue(self, source):
        return located("continue", source)

    def on_Pass(self, source):
        return self.grouped("statement", "pass", source, [])

    def handler(self, handler):
        name = self.name(handler.name, handler) if handler.name else NONE
        return self.grouped("statement", "catch", handler, [
            self.get(handler.type), name, self.block(handler.body, handler),
        ])

    def on_Try(self, source):
        parts = [self.block(source.body, source), *[self.handler(handler) for handler in source.handlers]]
        if source.orelse:
            parts.append(self.grouped("statement", "else", source, [self.block(source.orelse, source)]))
        if source.finalbody:
            parts.append(self.grouped("statement", "finally", source, [self.block(source.finalbody, source)]))
        return self.grouped("statement", "try", source, parts)

    on_TryStar = on_Try

    def on_With(self, source):
        items = [
            self.grouped("statement", "item", item.context_expr, [
                self.get(item.context_expr), self.get(item.optional_vars),
            ])
            for item in source.items
        ]
        return self.grouped("statement", "with", source, [*items, self.block(source.body, source)])

    on_AsyncWith = on_With

    def on_Assert(self, source):
        return self.grouped("statement", "assert", source, [self.get(source.test), self.get(source.msg)])

    def on_Delete(self, source):
        return self.grouped("statement", "delete", source, [self.get(target) for target in source.targets])

    def on_Global(self, source):
        return self.grouped("statement", "global " + ",".join(source.names), source, [])

    def on_Nonlocal(self, source):
        return self.grouped("statement", "nonlocal " + ",".join(source.names), source, [])

    def on_FunctionDef(self, source):
        function = located("lambda", source, [self.parameters(source.args, source), self.block(source.body, source)])
        return located("declare", source, [NONE, self.name(source.name, source), function])

    on_AsyncFunctionDef = on_FunctionDef
