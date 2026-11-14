import ast
from types import SimpleNamespace

from near_tree_parts import BaseConverter, literal_of, located, operator, shortened


class ExpressionConverter(BaseConverter):
    def on_Name(self, source):
        return self.name(source.id, source)

    def on_Constant(self, source):
        return literal_of(source)

    def on_Attribute(self, source):
        return located("member", source, [self.get(source.value)], value=source.attr)

    def keyword(self, keyword):
        value = f"argument:{keyword.arg}" if keyword.arg else "spread-keywords"
        return located("expression", keyword, [self.get(keyword.value)], value=value)

    def on_Call(self, source):
        arguments = [self.get(argument) for argument in source.args]
        keywords = [self.keyword(keyword) for keyword in source.keywords]
        return located("call", source, [self.get(source.func), *arguments, *keywords])

    def on_Subscript(self, source):
        return located("index", source, [self.get(source.value), self.get(source.slice)])

    def on_Slice(self, source):
        parts = [self.get(source.lower), self.get(source.upper), self.get(source.step)]
        return self.grouped("expression", "slice", source, parts)

    def on_BinOp(self, source):
        children = [self.get(source.left), self.get(source.right)]
        return located("binary", source, children, value=operator(source.op))

    def chained(self, nodes, value, source):
        node = nodes[0]
        for part in nodes[1:]:
            node = located("binary", source, [node, part], value=value)
        return node

    def on_BoolOp(self, source):
        return self.chained([self.get(value) for value in source.values], operator(source.op), source)

    def on_Compare(self, source):
        operands = [self.get(source.left), *[self.get(comparator) for comparator in source.comparators]]
        sides = [source.left, *source.comparators]
        parts = [
            located(
                "binary", source, [operands[index], operands[index + 1]],
                value=operator(op), text=self.span(sides[index], sides[index + 1]),
            )
            for index, op in enumerate(source.ops)
        ]
        if len(parts) == 1:
            del parts[0]["text"]
        return self.chained(parts, "&&", source)

    def span(self, first, last):
        segment = ast.get_source_segment(self.text, SimpleNamespace(
            lineno=first.lineno, col_offset=first.col_offset,
            end_lineno=last.end_lineno, end_col_offset=last.end_col_offset,
        ))
        return shortened(segment or "")

    def on_UnaryOp(self, source):
        return located("unary", source, [self.get(source.operand)], value=operator(source.op))

    def on_IfExp(self, source):
        children = [self.get(source.test), self.get(source.body), self.get(source.orelse)]
        return located("conditional", source, children)

    def on_Lambda(self, source):
        return located("lambda", source, [self.parameters(source.args, source), self.get(source.body)])

    def on_NamedExpr(self, source):
        return located("assign", source, [self.get(source.target), self.get(source.value)], value=":=")

    def elements(self, value, source):
        return self.grouped("expression", value, source, [self.get(element) for element in source.elts])

    def on_List(self, source):
        return self.elements("list", source)

    def on_Tuple(self, source):
        return self.elements("tuple", source)

    def on_Set(self, source):
        return self.elements("set", source)

    def on_Dict(self, source):
        pairs = [
            self.grouped("expression", "entry", value, [self.get(key), self.get(value)])
            for key, value in zip(source.keys, source.values)
        ]
        return self.grouped("expression", "dict", source, pairs)

    def generator(self, generator):
        tests = [self.get(test) for test in generator.ifs]
        parts = [self.get(generator.target), self.get(generator.iter), *tests]
        return self.grouped("expression", "generator", generator.iter, parts)

    def comprehension(self, value, source, elements):
        generators = [self.generator(generator) for generator in source.generators]
        return self.grouped("expression", value, source, [*elements, *generators])

    def on_ListComp(self, source):
        return self.comprehension("list-comprehension", source, [self.get(source.elt)])

    def on_SetComp(self, source):
        return self.comprehension("set-comprehension", source, [self.get(source.elt)])

    def on_GeneratorExp(self, source):
        return self.comprehension("generator", source, [self.get(source.elt)])

    def on_DictComp(self, source):
        return self.comprehension("dict-comprehension", source, [self.get(source.key), self.get(source.value)])

    def on_JoinedStr(self, source):
        return self.grouped("expression", "template", source, [self.get(value) for value in source.values])

    def on_FormattedValue(self, source):
        parts = [self.get(source.value), self.get(source.format_spec)]
        return self.grouped("expression", "format", source, parts)

    def wrapped(self, value, source):
        return self.grouped("expression", value, source, [self.get(source.value)])

    def on_Await(self, source):
        return self.wrapped("await", source)

    def on_Yield(self, source):
        return self.wrapped("yield", source)

    def on_YieldFrom(self, source):
        return self.wrapped("yield-from", source)

    def on_Starred(self, source):
        return self.wrapped("spread", source)
