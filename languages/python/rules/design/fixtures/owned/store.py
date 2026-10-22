CONFIG = {}
TABLE = []
_HIDDEN = []


def get_config():
    return CONFIG


def get_table():
    return TABLE


def copy_table():
    return list(TABLE)


def set_config(value):
    global CONFIG
    CONFIG = value


def local_shadow():
    TABLE = 1
    return TABLE


def hidden_size():
    return len(_HIDDEN)


class Store:
    registry = {}

    def __init__(self):
        self._rows = []
        self.name = "s"

    def rows(self):
        return self._rows

    def rows_copy(self):
        return list(self._rows)

    def rows_slice(self):
        return self._rows[:]

    def rows_when(self, flag):
        return self._rows if flag else []

    def rows_or_none(self):
        return self._rows or None

    def rows_alias(self):
        rows = self._rows
        return rows

    def rows_reassigned(self):
        rows = self._rows
        rows = list(rows)
        return rows

    def label(self):
        return self.name

    @property
    def view(self):
        return self._rows

    @classmethod
    def shared(cls):
        return cls.registry

    def touch(self):
        self._rows.append(1)
        self.name = "x"
        return None

    def count(self):
        return len(self._rows)

    def untouched(self):
        return 1
