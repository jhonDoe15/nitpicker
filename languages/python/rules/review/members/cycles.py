import ast

from review.common import finding
from review.members.classes import (
    compared_fields,
    generated_eq,
    references,
    resolve_class,
)

RULE = "generated-member-cycle"
MAX_CYCLE_CLASSES = 6


class Edge:
    def __init__(self, source, target, field, many):
        self.source = source
        self.target = target
        self.field = field
        self.many = many

    def position(self):
        return self.source["path"], self.field[1]


def generated_classes(index):
    classes = {}
    for path, tree in index.production_trees():
        aliases = index.project.contexts[path].aliases
        pending = [(node, ()) for node in tree.body]
        while pending:
            node, scope = pending.pop()
            if not isinstance(node, ast.ClassDef):
                continue
            qualified = scope + (node.name,)
            kind = generated_eq(node, aliases)
            if kind is not None:
                classes[id(node)] = {
                    "path": path,
                    "name": ".".join(qualified),
                    "node": node,
                    "kind": kind,
                    "aliases": aliases,
                }
            pending.extend((child, qualified) for child in node.body)
    return classes


def class_edges(index, classes, source):
    edges = []
    for name, annotation, line in compared_fields(
        source["node"], source["kind"], source["aliases"]
    ):
        for reference, many in references(annotation):
            _, target = resolve_class(index, source["path"], reference)
            if target is not None and id(target) in classes:
                edges.append(Edge(source, classes[id(target)], (name, line), many))
    return edges


def self_cycles(edges):
    by_class = {}
    for edge in edges:
        if edge.source is edge.target:
            by_class.setdefault(id(edge.source["node"]), []).append(edge)
    cycles = []
    for own in by_class.values():
        single = sorted((e for e in own if not e.many), key=Edge.position)
        many = sorted((e for e in own if e.many), key=Edge.position)
        if single and many:
            cycles.append([many[0], single[0]])
    return cycles


def longer_cycles(edges):
    outgoing = {}
    for edge in edges:
        if edge.source is not edge.target:
            outgoing.setdefault(id(edge.source["node"]), []).append(edge)
    order = sorted(outgoing, key=lambda key: outgoing[key][0].position())
    rank = {key: index for index, key in enumerate(order)}
    cycles = []

    def walk(start, path, seen):
        head = start if not path else id(path[-1].target["node"])
        for edge in outgoing.get(head, []):
            target = id(edge.target["node"])
            if target == start and path:
                cycles.append(path + [edge])
            elif (
                target not in seen
                and rank.get(target, -1) > rank[start]
                and len(path) + 1 < MAX_CYCLE_CLASSES
            ):
                walk(start, path + [edge], seen | {target})

    for start in order:
        walk(start, [], {start})
    return cycles


def closing_edge(cycle):
    single = [edge for edge in cycle if not edge.many]
    return max(single or cycle, key=Edge.position)


def cycle_text(cycle, edge):
    start = cycle.index(edge) + 1
    ordered = cycle[start:] + cycle[:start]
    steps = [f"{step.source['name']}.{step.field[0]}" for step in ordered]
    return " -> ".join(steps + [ordered[-1].target["name"]])


def member_cycle_findings(index):
    classes = generated_classes(index)
    edges = [
        edge
        for source in classes.values()
        for edge in class_edges(index, classes, source)
    ]
    found = {}
    for cycle in self_cycles(edges) + longer_cycles(edges):
        edge = closing_edge(cycle)
        key = (edge.source["path"], edge.field)
        if key not in found:
            subject = f"{edge.source['name']}.{edge.field[0]}"
            found[key] = finding(
                RULE,
                edge.source["path"],
                subject,
                edge.field[1],
                {"cycle": cycle_text(cycle, edge)},
            )
    return sorted(found.values(), key=lambda item: (item["path"], item["line"]))
