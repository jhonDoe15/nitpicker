import sys

__all__ = ["One"]
if sys.version_info >= (3, 11):
    __all__.append("Two")


class Three:
    pass
