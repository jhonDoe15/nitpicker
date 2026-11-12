class Column:
    def __init__(self, label, names, node, flags):
        self.label = label
        self.names = names
        self.node = node
        self.foreign = "foreign" in flags
        self.indexed = "indexed" in flags
        self.primary = "primary" in flags


class Model:
    def __init__(self, name, aliases=()):
        self.name = name
        self.aliases = {name, *aliases}
        self.bases = []
        self.columns = []
        self.indexes = []
        self.keys = []

    def add_index(self, columns):
        named = []
        for column in columns:
            if not column:
                break
            named.append({column})
        if named:
            self.indexes.append(named)


def leads(index, columns):
    lead = index[: len(columns)]
    return all(any(column & entry for entry in lead) for column in columns)


def column_indexes(model):
    primaries = [column.names for column in model.columns if column.primary]
    indexed = [[column.names] for column in model.columns if column.indexed]
    return ([primaries] if primaries else []) + indexed + model.indexes


def unindexed(model):
    indexes = column_indexes(model)
    found = [
        (column.node, column.label)
        for column in model.columns
        if column.foreign and column.label and not any(leads(index, [column.names]) for index in indexes)
    ]
    for node, columns in model.keys:
        sets = [{name} for name in columns]
        if columns and all(columns) and not any(leads(index, sets) for index in indexes):
            found.append((node, ", ".join(columns)))
    return found


def with_bases(models):
    by_name = {model.name: model for model in models}
    used = {base for model in models for base in model.bases if base in by_name}
    merged = []
    for model in models:
        if model.name in used:
            continue
        pending, seen = list(model.bases), set()
        for base in pending:
            if base in by_name and base not in seen:
                seen.add(base)
                inherited = by_name[base]
                model.columns = inherited.columns + model.columns
                model.indexes = inherited.indexes + model.indexes
                model.keys = inherited.keys + model.keys
                pending.extend(inherited.bases)
        merged.append(model)
    return merged
