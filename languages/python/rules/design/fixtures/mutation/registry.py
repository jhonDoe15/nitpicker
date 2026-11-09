from typing import ClassVar


class Registry:
    _known: ClassVar[list] = []

    def known(self):
        return self._known
