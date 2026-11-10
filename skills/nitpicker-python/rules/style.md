# Types, names and style

Part of the [nitpicker-python](../SKILL.md) skill. Write these forms from the start; the gate is a backstop.

- Types: annotate every function, method and parameter; strict mypy, pyright or basedpyright (the project's own
  choice) checks the source roots. Fix the type. `# type: ignore`, `# noqa` and `# pyright: ignore`
  are findings themselves, so never write them, nor `# fmt: off`, `@no_type_check`, `if not TYPE_CHECKING:`
  around code, or a `.pyi` beside its `.py`. No `typing.cast` or explicit `Any`, in tests
  too: write the concrete type, `ParamSpec` for wrappers or `object`, narrow with `isinstance`, and
  parse untrusted input once in an adapter.
- Paths: `pathlib.Path` with `/`, `.read_text()`, `.exists()`. No `os.path`, no `open(path)`.
  A handle you keep open goes in a `with` block, never inline: not `json.load(open(path))` or
  `urlopen(url).read()` (`unclosed-inline-resource`).
- Strings: f-strings only. No `.format()` and no `%`.
- Defaults: `None`, then build the value inside the function. No mutable default arguments.
- Parameters: remove an unused one (`@override` marks an override; `_context` only when a callback
  signature fixes it). A `bool` that picks a behavior is keyword-only
  (`def send(message, *, urgent=False)`), two functions or an enum.
- Flow: no `else` after a `return`, and return an expression directly instead of assigning it to a
  local first. Build a list with a comprehension, not `append` in a loop.
- Boolean logic in its simplest exact form: `return a < b`, not an `if` that returns `True` and
  `False`; one `if a and b:`, not an `if` that only holds another `if`; `a != b`, not `not a == b`;
  `if ready:` first rather than `if not ready:` with an `else` (and `b if ready else a`); `not (a or b)`,
  not `not a and not b` (`simpler-boolean-logic`, ruff `SIM`).
- No method that only passes its parameters on to another method of the same class
  (`def total(self, items): return self._sum(items)`): call that method directly (or, when it is less visible, rename it to the alias's name and delete the alias).
- Imports: name what you use. No `from module import *`.
- Loops and calls: bind a new name rather than reassigning the loop variable; pass a function
  itself (`key=str`), not `lambda x: str(x)`; one `max(a, b, c)`, not nested calls.
- Records: `@dataclass(frozen=True)`, and `dataclasses.replace` for a changed copy. The project's
  validation library (pydantic by default) only in an `adapters/` package, where untrusted input is
  parsed once; pass frozen dataclasses on from there.
- A back reference in a record (a child's `parent`, an item's `order`) is
  `field(compare=False)` (`attrs.field(eq=False)`), or the generated `==` and `hash()` recurse
  until `RecursionError` (`generated-member-cycle`).
- Constants: a fixed set of strings is an `enum.StrEnum` (`class X(str, Enum)` before Python 3.11),
  not `STATUS_ACTIVE = "active"` constants or a class holding them. Settings like `DB_HOST` are fine.
- Names and comments: name files, packages and classes for their job (`price_rounding.py`), never
  `utils`, `helpers`, `common`, `misc`, `miscellaneous` or `*Manager`, also not before `mixin`,
  `module` or `base` (`HelperMixin`, `util_functions`); a role such as `SessionManager` is fine;
  pure logic shared between features goes in `shared/` under such a name. No commented-out code,
  and a `TODO` or `FIXME` carries an issue (`# TODO(#123): ...`, `# TODO PROJ-123: ...` or a link).
- Signatures: a value with three states is an enum, not `bool | None`; test `None` with
  `x if x is not None else default`, never `x or default`; return a new list or dict instead of
  changing an argument (`items.append`). When code moves, change every caller and delete the old
  name: no alias (`Old = New`), module `__getattr__`, `@deprecated` or `DeprecationWarning` shim.
- Regexes: an argument built into a `re` pattern goes through `re.escape(value)`; plain text is
  compared with `in`, `startswith` or `==` (`regex-unescaped-value`).
  Every part of a literal pattern must change what it matches (`a|b|a`, `[_a-z_]` and `x{1}` are
  `regex-part-defect`), and nested quantifiers such as `^( *[a-z]+)*$` are `regex-backtracking`.
- Pick the cheaper collection form: a `set()` for items you test with `in` while you collect them
  (`list-used-as-set`), a `dict` built once before a loop instead of `next(x for x in xs if x.key == key)`
  in it (`linear-lookup-in-loop`), and `min`/`max` instead of `sorted(xs)[0]` (ruff `FURB192`).
