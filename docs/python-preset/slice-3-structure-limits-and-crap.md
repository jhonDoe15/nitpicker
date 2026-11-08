# Slice 3: structure limits and CRAP

Part of the [Python preset guide](../python-preset.md).

- **File limits.** The shared file-limit rule (`shared/rules/file-limits.mjs`) checks every `.py`
  file outside dot, virtualenv (`venv`, `env`), build, `migrations` and `__pycache__` folders: 300 lines per module, 500 per test
  module (a test file as defined under the rules),
  120 characters per line, and 6 modules (and separately 6 test modules) directly in one folder, where an `__init__.py` is checked but not counted. A
  file or folder already over a limit fails only when it grows, and a folder moved to a new path is
  matched to its old path.
- **Rules.** The shared structure rule (`shared/rules/structure.mjs`) and CRAP rule
  (`shared/rules/crap.mjs`) run on Python with the TypeScript and Java ids, limits and messages:
  `function-lines-limit` (50), `function-statements-limit` (15), `function-control-nesting-limit`
  (2), `function-parameters-limit` (3), `crap-score-limit` (9, `thresholds.crapLimit` overrides it)
  and `crap-coverage-unknown`. `shared/policy.mjs` marks them enforced for Python and
  `spec/checks.md` is regenerated. A function that already breaks a limit on the base and is edited
  fails only when the change makes that metric worse, exactly as for the other languages (the
  `ratchet` field of the finding, handled by the core comparison); a new function over a limit, or
  one the change pushes over it, fails as usual. Exceptions are the usual ones: an
  `exceptions` entry for the rule (optionally with `function`, see below), `exclude` in
  `nitpicker.config.json` for a path, or the legacy inventory; there is no inline disable. Each
  message ends with the entry that accepts it, for example
  `{"rule":"function-lines-limit","paths":["src/demo/a.py"],"function":"Service.run","reason":"..."}`;
  the shared rules append it.
- **Structure metrics (decision to review).** `languages/python/metrics/structure_metrics.py` parses
  the source files with the standard library `ast` module (parse only, nothing is imported or run)
  and writes one object per function to `structure.json`. It is run by the project's own Python
  (`python <script> <output> <project> <file list>`), so it needs no dependency and no pin, and it
  parses with the grammar of the interpreter the project uses; a file that does not parse is
  skipped, since ruff's `E9` rules already report a syntax error; a file too deeply nested for the
  parser (`RecursionError`, `MemoryError`) stops the run with a `structure-failed` tool error that
  names the file, as an unparsable TypeScript file does, because no other tool reports it and
  skipping it would leave it outside the structure gate unnoticed. The four limit metrics and the cyclomatic complexity
  (the CRAP input) all come from this one script, like `StructureMetrics.java` for Java; no
  external tool is involved.
- **Definitions** (the TypeScript analyzer's, applied to Python syntax). Unit: every `def` and
  `async def` with a body, methods and nested functions alike, and every `lambda`; named
  `Outer.method` and `outer.inner`, the qualified names coverage.py uses. A lambda is named after the
  scope that holds it and the name it is assigned to (`pipeline.score` for `score = lambda v: ...`,
  also with an annotation), else `<lambda>` (`pipeline.<lambda>`; a lambda in a default argument, a
  decorator or a base class belongs to the scope around that `def` or `class`); repeated names are
  numbered by the source, as for the `<init>` blocks of Kotlin. `lines`: last line - first line + 1, from the
  first decorator, without the docstring (it is documentation, like `statements`, so adding one to
  a long legacy function does not make it grow; TypeScript counts comments, Python has no comment
  node to leave out).
  `statements`: every statement in the body, compound statements counting once plus their bodies:
  `if`/`elif` (an `elif` is a nested `if` statement in the syntax tree, as `else if` is in
  TypeScript), `for`, `while`,
  `try`, `with`, `match`, `return`, `pass`, assignments, a nested `def` or `class` (but not its
  body); not counted: the docstring, `else`/`finally` themselves, `except` clauses and `case`
  clauses (only their bodies). `maxControlNesting`: the deepest nesting of `if`/`elif`, `for`,
  `async for`, `while`, `match` and `except`; `try`, `with` and comprehensions do not nest. An
  `if`/`elif`/`else` chain nests one level, like an `else if` chain in TypeScript and Java; an `elif`
  is the same level as the `if` it continues, and a statement nested in a branch is one level
  deeper. An `else:` block that holds an `if` is nested, as an `else { if }` block is in TypeScript and Java. The
  finding says so. A `match` is one level, whatever its number of `case` clauses; a statement in a
  `case` is one level deeper.
  `parameters`: positional-only, positional, keyword-only, `*args` and `**kwargs`, one each; the
  `/` and `*` markers are not parameters. The first positional parameter of a method (`self`,
  `cls`, or whatever it is called) is not counted, because the caller does not pass it: a function
  directly in a class body that is not a `@staticmethod`. A lambda has `statements` 1 (its
  expression), `maxControlNesting` 0 and the parameters of its signature. Comprehensions are part of
  the function that contains them; lambdas, nested functions and methods of nested classes are
  units of their own and do not count towards the function around them (`lines` is the physical
  span, so the lines of a nested unit still count towards the function around it, as in
  TypeScript).
- **Which files.** The `.py` files under the source roots (see `sourceRoots`), skipping hidden
  directories, `__pycache__`, `node_modules` and `site-packages`. When the source root is the whole
  project (`.`: no `src/` and no top-level package), the directories source root detection never
  treats as packages (`tests`, `test`, a top-level `testing`, `docs`, `doc`, `examples`, `scripts`, `build`, `dist`, `env`,
  `venv`; one list in `python-project.mjs`) and `conftest.py` are skipped too, so tests, build
  copies and virtualenvs are not gated. Node lists the files once per snapshot
  (`python-files.txt`) and hands the list to the metrics script. Tests are
  outside the default source roots, so they are not gated.
- **Findings.** Same as Java: `languages/python/adapters/analysis/python-structure.mjs` gives the metrics to
  `evaluateStructure` and keeps the enforceable limit findings (tool `structure`; the descriptive
  per-function metrics are not emitted). Identity: qualified name, occurrence among the functions of that name and the same text
  that are over the same limit (so a property getter and setter, or a function defined in two
  branches, do not renumber each other when another of that name is added above; the CRAP identity
  numbers the same way, and so do the TypeScript structure and CRAP findings), and a hash of the function text with the common indentation removed, so moving or
  re-indenting a whole function keeps it baselined while changing the nesting of a statement inside
  it counts as an edit (Java trims every line, which would hide that in Python).
- **Cyclomatic complexity** (`complexity`, the CRAP input). Computed by the same script from the
  syntax tree, with no external tool: 1 plus one for each decision point in the function's own
  body. Decision points: `if` and `elif`, a conditional expression (`a if b else c`), `for` and
  `async for`, `while`, each `except` handler, each `case` of a `match` (a `case _:` without a
  guard is the `default` of a `switch` and does not count), each extra operand of `and` and `or`
  (`a and b and c` is two), and in a comprehension or generator expression each `for`/`async for`
  clause and each `if` clause. The decision points are the McCabe ones of the other presets
  (ESLint's `complexity` rule for TypeScript, the Java and Kotlin metrics programs all
  count `if`, loops, `case` but not `default`, `catch`, `&&`, `||` and `?:`), with two differences
  in scope: a lambda is a unit of its own, as every lambda, arrow function and anonymous function is
  in the other presets, and does not count towards the function around it; and each `for`
  and `if` clause of a comprehension counts, which has no equivalent in the other languages.
  Not counted: `else`, `finally`, the `else` of a loop or a `try`, `with`, `assert`, `try` itself.
  Comprehensions are part of the function around them; lambdas, nested functions and the
  methods of nested classes have their own entry and do not count towards it. An
  `@overload` stub (however the decorator is spelled: `overload`, `typing.overload`, `t.overload`)
  gets no CRAP score, and neither does a function whose first body statement starts on the `def`
  line (`def f(): return 1`): its only statement shares a line with the definition, which
  runs when the module is imported, so its coverage cannot be told apart. The script writes `complexity`, `definition` (the `def` line, which differs from
  `start` when the function is decorated) and `bodyStart` (the line of the first body statement)
  next to the limit metrics, and a lambda entry also carries `lambda: true` and `statementLine` (the first
  line of the statement that holds it, which is the line coverage.py reports for it). The CRAP step reads
  them from `structure.json`; a failing
  structure step is the only failure, `structure-failed`, and CRAP then has nothing to score.
- **Coverage join.** `languages/python/ingest/crap.mjs` takes the per-function entries of the
  coverage.py JSON report PY1 already produces (`files.<path>.functions`, coverage.py 7.6 or newer)
  and joins each function to the entry with the same qualified name (`A.m`, `A.m.inner`, the
  names coverage.py reports) whose lines (`executed_lines`, `missing_lines`, `excluded_lines`) lie
  inside the range from the `def` line to the last line of the function. `start_line` is not used, because only recent coverage.py
  versions report it. Coverage of a function is the lower of its line and branch percentage, as for
  JaCoCo, and CRAP is `ccn^2 * (1 - coverage)^3 + ccn`, shared with Java
  (`ingestCrapRows` in `shared/ingest/lizard-crap.mjs`). A function with no statements and no
  branches counts as fully covered: a docstring-only stub, and a function whose lines coverage.py
  excludes (`# pragma: no cover`, `if TYPE_CHECKING:`, a multi-line `@overload` stub). Definitions
  that share a name in a scope (a `@property` getter and its `@x.setter`, `@singledispatch`
  registrations all named `_`, conditional definitions) collapse into one coverage.py entry, which
  keeps only the last one, so an entry is used only for the function whose lines lie inside it. Any
  other function is scored from the file's own per-line data (`executed_lines`, `missing_lines`,
  `executed_branches`, `missing_branches`) over its own line range: after its `def` line and
  without the lines of functions nested in it; a docstring-only definition therefore cannot lend
  its empty entry to a branchy one with the same name. A file coverage.py did not report (outside
  the source roots) has unknown coverage and fails with `crap-coverage-unknown`; nothing is
  guessed. `# pragma: no cover` keeps its coverage.py meaning (excluded lines are not statements).
  A lambda has no coverage.py entry and no line of its own: its body runs on the line of the statement
  that creates it, so coverage.py cannot tell a lambda that was never called from one that was. A
  lambda therefore counts as fully covered when that statement ran (`statementLine` of its entry is
  not in `missing_lines`) and as not covered when it did not, whatever its size; a lambda in a
  statement that ran is scored by its complexity alone, so only a lambda with 9 or more decisions
  fails, with the message for a covered function. This is the most coverage.py can tell, and the
  statement that never ran is already a finding of its own function. Lambdas of the same name in one
  file are numbered by their source text, as the `<init>` blocks of Kotlin are.
  Identity: qualified name plus the same function-text hash, ratchet key the name, so an edited
  function over the limit fails only when its score rises.
- **Cache invalidation.** The metrics script, the new adapters, the shared structure and CRAP rule
  files and `shared/policy.mjs` are in the Python analyzer's configuration hash.
- **Tests.** `ingest/crap.test.mjs` (the join, on structure entries and a coverage.py report),
  `python-structure.test.mjs`, `python-crap.test.mjs`, `python-sources.test.mjs` (all with the fake
  toolchain) and `metrics/structure-metrics.test.mjs` (the script itself, on the real `python3`:
  the limit metrics, the nesting of `elif` chains and `match`, and each kind of decision point); `core/command/python/python-cli-*.test.mjs` drives the CLI
  in two runs: new structure, CRAP-score and unknown-coverage findings next to a touched legacy
  function that is held, then the legacy function grown under a raised `thresholds.crapLimit`; the
  gated e2e adds real branches for each (nested loops with four parameters, a legacy function
  edited and then grown, an untested branchy function).
