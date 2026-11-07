# Rules from code review

Part of the [Python preset guide](../python-preset.md).

These carry over checks the TypeScript preset added from review findings, with the same decisions
where Python allows it. Each message names the allowed form and the `python.exceptions` entry that
lifts the rule for some paths. The per-file rules live in `languages/python/rules/review/`
and the project-wide ones, which resolve imports across files, in `review/project/`. The
TypeScript `nitpicker/no-fixed-sleep-synchronization` check is `sleep-in-test` above.
`singular-and-plural-field`, `exhaustive-enum-predicate` and `forwarding-wrapper` check production
sources only, never test files, as in TypeScript (its production scope) and Java (main sources); a
test helper that forwards, a fixture factory with `tag` and `tags`, or a test that compares a few
members is not reported.

- `doc-comment-content` (TypeScript: the `no-comments` doc-comment checks), the shared rule the
  facts scan feeds; it replaces the earlier `restating-docstring` and `long-docstring` rules, and a
  `python.exceptions` entry that still names either is a config error that says to move it to the
  top-level `exceptions` as `doc-comment-content`. Findings have the tool `facts` and the identity
  `doc-comment:<qualified name>:restating` or `:long`, so a growing docstring keeps its identity.
  The Python preset does not ban comments or docstrings; only these two contents are checked, on
  the docstring of every function, method and class (not modules) of production code; test files
  are left alone, as TypeScript test files are, where a docstring that names what the test checks
  is expected. A docstring restates the name
  when every word of its description, apart from the filler words of the shared rule (`the`,
  `returns`, `function`, `method`, `class`, ...), is a word of the name or a plural, `-ed` or `-ing`
  form of one (`load_users`: "Returns the loaded user."), and nothing else in the docstring says
  more: a section, field or example with text keeps it. Every preset that runs the rule reads tags
  the same way: a JSDoc `@param id the account`, `@returns the login` or `@throws {E} when ...` with
  text keeps a restating summary too, while a tag with only a name or a type (`@param {string} id`)
  does not. PEP 257 and pydocstyle ask every docstring for a summary line, so a docstring whose
  `Args:` or `Returns:` section carries the information cannot drop the summary that restates the
  name, and reporting it would leave no allowed form. The description ends at the first
  `:param`-style field, Google section (`Args:`, `Returns:`, `Raises:`, `Examples:`, ..., also a
  single-line one such as `Returns: the id`, `Raises ValueError: ...` or `Note: ...`) or numpy
  section (a title over a `---` line). A docstring whose description has more than 5 non-empty
  lines is reported with its count. As in TypeScript, bullet items and the body of a directive such
  as `.. note::` count; only code examples do not: a reST literal block after a line ending in `::`,
  the body of a code directive (`.. code-block::`, `.. code::`, `.. sourcecode::`, `.. doctest::`,
  `.. testcode::`, `.. testoutput::`), fenced code, and a doctest block (`>>>` lines up to the next
  blank line). The version directives (`.. versionadded::`, `.. versionchanged::`,
  `.. versionremoved::`, `.. deprecated::`) and their bodies do not count either, like JSDoc's
  `@since` and `@deprecated`, and keep a restating summary when they have text.
- `sibling-copy-edit`, the shared rule over the facts of both checkouts: on the head run of a
  change the facts step also scans the base checkout, and a module-level function or class of at
  least 20 tokens that the change edits so that it drifts from a same-named copy in another module,
  while that copy is left as it was, is reported. A file the change moves is matched to its base
  path through the moves file the head run receives. Copies are compared within one distribution
  (the nearest folder above the module with a `pyproject.toml`, `setup.cfg` or `setup.py`, else the
  whole project), as TypeScript compares within one workspace package, so the packages and flat
  modules of one project are compared with each other. In a Django application (a `manage.py`, a
  module that sets `INSTALLED_APPS`, or `django` among the main dependencies; an optional extra or a
  development dependency does not count) a name Django requires (`Command`, `Migration`, `Meta`,
  `Config`) and every definition of a convention module (`admin.py`, `apps.py`, `urls.py`,
  `signals.py`, `settings`, `wsgi.py`, `asgi.py`, `templatetags/`, `management/commands/`) are
  never compared; an entry point never is.
- `test-only-export`, `duplicate-definition` and `exported-name-collision` read the same scan.
  `duplicate-definition` compares the whole project, whatever the distribution. A module Django
  loads by convention (the list above, in a Django application) and its names are production code.
  A string that spells a dotted path counts only for the name it spells: `"shop.models.upload_to"`
  uses `upload_to` of `shop.models`, while `"shop.models"`, a logger name such as `"app.billing"`
  or a permission string only load the module. An `importlib.import_module(...)` or `__import__`
  call loads the module it names, or every module of `app.plugins` for `f"app.plugins.{name}"`, and
  uses there only the names the file fetches by a literal (`getattr(module, "export")`); no other
  f-string counts. A migration uses only the attributes it reads (`shop.models.upload_to`), not the
  whole module it imports; migrations are scanned for those references only, never compared as
  copies. Dotted strings are references, never imports, so a registry of two `"…parse"` paths is
  no name collision. `@overload` stubs are folded into the implementation, as TypeScript folds
  overload signatures, so two stores with the same overloads and different bodies are no copies.
  Only a real alternative is spared by `exported-name-collision`, as a `require` in a branch is in
  TypeScript: imports in a `try` and its `except ImportError` (or `ModuleNotFoundError`) handler,
  and imports of the same name in two branches of one `if`/`elif`/`else` chain (a platform, version
  or feature gate). A second import in the same scope, a function-local import that shadows a
  module-level one and an import under `if __name__ == "__main__":` are reported; every import
  still counts as a use.
- `singular-and-plural-field` (TypeScript: `nitpicker/no-singular-and-plural-prop`): an optional
  `tag: T` beside an optional `tags` whose element type is `T` (`list`, `Sequence`, `set`,
  `frozenset`, `Iterable`, `tuple[T, ...]` and the `typing` names; `Optional`, `| None`,
  `NotRequired` and `Annotated` are looked through; `-es` and `-ies` plurals count, and a name with
  two plural forms, such as `indexes` and `indices`, is reported once). Optional means a default
  value in a `@dataclass` (also pydantic's), an attrs class (`@define`, `@frozen`, `@mutable` from
  `attrs` or `attr`, `@attr.s`), a pydantic `BaseModel` or `BaseSettings` and a `NamedTuple`,
  `total=False` or `NotRequired` in a `TypedDict`, a default in a `msgspec.Struct`, a marshmallow
  `Schema` field without `required=True` or `dump_only=True` (`Str`, `Int` and `Bool` are read as
  `String`, `Integer` and `Boolean`; `fields.List(fields.Str())` and
  `fields.Nested(S, many=True)` are the plurals of `fields.Str()` and `fields.Nested(S)`), and a
  default in a function's parameters (every function, private and nested ones too). Two fields
  whose meanings differ (`owner` beside `owners` for the co-owners) are the case for an exception
  with a reason. A
  class whose base is a project class of one of those kinds counts too (followed through imports,
  up to 10 bases deep). A value that only builds the field is not a default: `Field(...)` or
  `Field(description=...)` without a default, `field(metadata=...)` and `attr.ib()` without
  `default`, `default_factory` or `factory` leave the field required. An unannotated
  `x = attr.ib(default=...)` of an attrs class is a field too, typed by its `type=` argument; two
  untyped ones are compared by name alone. Unannotated parameters are not compared. Common irregular plurals of the last word
  count (`child`/`children`, `index`/`indices`, `person`/`people`, `sub_index`/`sub_indices`), and
  a string annotation (`tags: "list[str]"`) is read as the annotation it spells.
- `exhaustive-enum-predicate` (TypeScript: `nitpicker/exhaustive-union-predicate`): an `or` chain of
  `==` or `is`, an `and` chain of `!=` or `is not`, an `in` / `not in` tuple, list or set (also inside
  `frozenset(...)`, `set(...)`, `tuple(...)` or `list(...)`), or a `match` whose cases (values or `|`
  of values, without guards) return the same `True` or `False` and whose last case (`case _:` or a
  bare capture such as `case other:`) returns the other, that
  compares one plain reference (`status`, `self.status`) with two or more distinct members of one
  project enum, or with values of a `Literal` the parameter is annotated with. A project enum is a
  class of the project, nested ones included (`Order.Kind.A`), that derives from `Enum`, `IntEnum`,
  `StrEnum` or `ReprEnum`, directly or through project base classes, resolved through imports, with
  at least 3 members. `Flag` and `IntFlag` enums, also through a base, are not checked, since their
  members combine. The `Literal` is written in the annotation or is an alias reached by name,
  through imports and re-exports or as a module attribute (`st.Mode`), also inside `Optional`,
  `Annotated` or a string annotation. Only a value is checked (a `return`, an assignment, an
  augmented assignment, a lambda body, also inside `not`, a conditional expression or another
  `and`/`or`, and a `match` as a whole), never an `if` or `while` condition, and not in a function
  that returns `TypeGuard` or `TypeIs`. A method of the enum itself may list its own members (`def is_early(self): return
self in (Stage.A, Stage.B)`), like the boolean each constant declares in the Java preset. Only a
  list of some of the members fails, as in the TypeScript and Java presets, because a member added
  later falls into the default silently; a list of every member is not reported. An alias
  (`DEFAULT = A`, or a second name with the value of an earlier member) is not a member of its own.
  Enums from libraries are not checked. The allowed form is a `match` with `case _:
assert_never(value)`, or an `if`/`elif` chain ending in `else: assert_never(value)`; a `case _:`
  that returns a boolean keeps the finding. A named constant set declared once (`OPEN = frozenset(...)`,
  then `s in OPEN`) is one classification point and is not flagged.
- `forwarding-wrapper` (TypeScript: `nitpicker/no-forwarding-wrapper`): an undecorated
  module-level function whose body (after a docstring) is `return target(...)`, or `return await
target(...)` in an `async def`, passing its own parameters in order (by position or as
  `name=name`, `*args` and `**kwargs` as spreads, keyword-only ones as `name=name`), where `target`
  is a single undecorated function of the project (same module, imported or reached through a
  module) with the same parameter names, kinds (positional-only, positional or keyword,
  keyword-only), annotations and defaults, the same return annotation, and the same `async`. A
  plain function that returns an `async` target's coroutine is not a wrapper. Unannotated
  functions, methods and library targets are not checked. The message says to call the target
  directly, or to import or bind it under the old name.
- `unused-option` (TypeScript: the same rule of the `structure` check, with the same message and
  the same top-level `exceptions` route): an option nobody sets. TypeScript judges the properties
  of the options object of an exported function; Python has keyword parameters with defaults
  instead, so it judges a parameter with a default of an undecorated public module-level function
  in production code (no leading underscore, and listed in `__all__` when the module assigns it a
  literal list once) that no call passes, by keyword, by position, or through `*args` (positional
  parameters) or `**kwargs` (all). Calls are resolved
  through imports, aliases, module attributes and package re-exports (`from .pricing import total`
  in an `__init__.py`), using the module names the coupling check uses. A function nothing calls is
  not judged, nor one used as a value (passed, stored, decorating), one a star import exposes, one
  called from an `if __name__ == "__main__":` block or a `__main__.py`, or one an entry point
  names: `[project.scripts]`, `[project.gui-scripts]`, any `[project.entry-points.<group>]`,
  `[tool.poetry.scripts]`, `[tool.poetry.plugins.<group>]` and `[tool.flit.scripts]`, the
  `[options.entry_points]` of `setup.cfg`, and the `name = module:function` strings of `setup.py`
  (all read once by `rules/libraries/package-facts.mjs`, which never runs `setup.py`; entry points
  built at run time are not seen). Tests do not count as callers, unless the project is a
  published package (a `[project]` or poetry `name` with a `[build-system]` table, whose missing
  `build-backend` means setuptools as PEP 517 says, and no `package-mode = false`, a `setup.cfg` `[metadata] name`, or a `setup.py` whose `setup()` gets a
  `name`, in each case without a `Private :: Do Not Upload` classifier): then its own tests count,
  as in the TypeScript preset. `setup.cfg` is read leniently, as for the pytest settings, so a
  duplicated key in another tool's section is no error; a project file that exists but cannot be
  read (a folder named `setup.cfg`) fails the run and names the file. The subject is
  `function.parameter`, so the finding is new only when the change adds the parameter or removes
  its last caller.

A file with an expression too deep for Python's recursion limit (a sum of 900 terms) does not stop
the run: the checks that fail on it are skipped for that file and reported as a descriptive
`python-rules/rules-too-deep` note that does not fail the gate. A file too deep for `ast.parse`
itself (a sum of tens of thousands of terms) gets the same note, saying every check skipped it.
