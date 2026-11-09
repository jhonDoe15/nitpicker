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
        self.columns = []
        self.indexes = []
        self.keys = []

    def add_index(self, columns):
        if columns and all(columns):
            self.indexes.append(columns)


def leads(index, columns):
    lead = index[: len(columns)]
    return all(any(name in lead for name in column) for column in columns)


def is_covered(model, names):
    primaries = [column for column in model.columns if column.primary]
    if primaries and primaries[0].names & names:
        return True
    if any(column.indexed and column.names & names for column in model.columns):
        return True
    return any(leads(index, [names]) for index in model.indexes)


def unindexed(model):
    found = [
        (column.node, column.label, column.names)
        for column in model.columns
        if column.foreign and not is_covered(model, column.names)
    ]
    for node, columns in model.keys:
        sets = [{name} for name in columns]
        if columns and not any(leads(index, sets) for index in model.indexes):
            found.append((node, ", ".join(columns), set(columns)))
    return found
