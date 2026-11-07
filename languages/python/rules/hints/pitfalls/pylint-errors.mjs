export const PYLINT_ERROR_HINTS = [
  {
    tool: 'ruff',
    rules: ['PLE0100', 'PLE0101'],
    allowed:
      'Keep `__init__` a plain initializer that returns `None`; build another value or a generator in a `@classmethod` factory or a separate method.',
  },
  {
    tool: 'ruff',
    rules: ['PLE0115', 'PLE0118'],
    allowed:
      'Remove the `global` declaration: pass the value in as an argument and return the new value.',
  },
  {
    tool: 'ruff',
    rules: ['PLE0117'],
    allowed:
      'Remove the `nonlocal` declaration and pass the value in, or bind the name in the enclosing function first.',
  },
  {
    tool: 'ruff',
    rules: ['PLE0237'],
    allowed: 'Add the attribute to `__slots__`, or assign only the attributes listed there.',
  },
  {
    tool: 'ruff',
    rules: ['PLE0241'],
    allowed: 'List each base class once: `class Report(Base):`.',
  },
  {
    tool: 'ruff',
    rules: ['PLE0302'],
    allowed:
      'Give the special method the parameters the data model defines: `def __eq__(self, other):`.',
  },
  {
    tool: 'ruff',
    rules: ['PLE0303', 'PLE0304', 'PLE0305', 'PLE0307', 'PLE0308', 'PLE0309'],
    allowed:
      'Return the type the data model requires: a non-negative `int` from `__len__`, `bool` from `__bool__`, `int` from `__index__` and `__hash__`, `str` from `__str__`, `bytes` from `__bytes__`.',
  },
  {
    tool: 'ruff',
    rules: ['PLE0604', 'PLE0605'],
    allowed: 'List the public names as strings in a list or tuple: `__all__ = ["load", "save"]`.',
  },
  {
    tool: 'ruff',
    rules: ['PLE0643'],
    allowed: 'Index inside the sequence, or name the value directly instead of indexing a literal.',
  },
  {
    tool: 'ruff',
    rules: ['PLE0704'],
    allowed:
      'Raise an explicit exception: `raise ValueError(...)`; a bare `raise` only re-raises inside `except`.',
  },
  {
    tool: 'ruff',
    rules: ['PLE1142', 'PLE1700'],
    allowed:
      'Use `await` only inside `async def`; an async generator re-yields with `async for item in source: yield item`, not `yield from`.',
  },
  {
    tool: 'ruff',
    rules: ['PLE1205', 'PLE1206'],
    allowed:
      'Match each logging placeholder with one value: `logger.info("Loaded %s items", count)`.',
  },
  {
    tool: 'ruff',
    rules: ['PLE1507'],
    allowed:
      'Pass the variable name as a `str`, in the composition root (`settings.py`): `os.getenv("HOME")`.',
  },
  {
    tool: 'ruff',
    rules: ['PLE1519', 'PLE1520'],
    allowed:
      'Use `@functools.singledispatchmethod` on methods and `@functools.singledispatch` on plain functions.',
  },
  {
    tool: 'ruff',
    rules: ['PLE2502', 'PLE2510', 'PLE2512', 'PLE2513', 'PLE2514', 'PLE2515'],
    allowed:
      'Write the character as its escape sequence (`"\\b"`, `"\\x1a"`, `"\\x1b"`, `"\\0"`, `"\\u200b"`), and remove bidirectional control characters.',
  },
];
