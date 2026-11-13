# Sources and decisions

Why the Python preset's automatic fixes say what they say. The rules themselves are in
`languages/python/ruff/nitpicker-ruff.toml`; this page records what was decided for ruff fixes.

## Ruff fixes marked unsafe

`nitpicker --fix` runs `ruff check --fix`, which applies only the fixes ruff marks safe. This was
reviewed against ruff 0.16.9 for every rule of the gate's ruff config that has a fix and an unsafe
case (`ruff rule <code>` gives the reason ruff states for each). There are three outcomes.

- Promoted: listed in `lint.extend-safe-fixes` in the gate's ruff config, so `--fix` applies it. The
  fix keeps the behaviour of every realistic input and writes the form the preset allows. The only
  difference left is a type that overrides a dunder method in an unusual way. A fix that would drop a
  comment is never promoted.
- Review: the fix changes behaviour on purpose. It is applied only when the rule is named with
  `--fix --rule ruff/<code>`, as a second ruff pass with `--unsafe-fixes --select <codes>`.
- Left out: ruff keeps the fix unsafe and nitpicker does not apply it.

### Promoted

| Rule      | Why it is safe enough                                                                                                        |
| -------- | -------------------------------------------------------------------------------------------------------------- |
| `PT018`   | one assert per condition; the same checks run in the same order                                                              |
| `RUF013` | T \| None replaces an implicit Optional; only the annotation changes                                           |
| `SIM103`  | returns the condition itself, wrapped in bool() when it may not be boolean; differs only for a custom **bool**               |

### Review

| Rule       | Why it needs a review                                                             |
| ---------- | ---------------------------------------------------------------------------------------------------- |
| `ASYNC105` | adds an await, so the call now runs                                               |
| `ASYNC116` | changes how long the sleep lasts                                                  |
| `B006`     | moves the default into the body, which may not be what the author meant           |
| `B011`     | assert False becomes raise AssertionError, which python -O no longer skips        |
| `B028`     | adds a stacklevel the author may want higher                                      |
| `E712`     | x == True becomes x, which differs for values equal to True that are not bool     |
| `E731`     | a lambda becomes a def, so **name** and the repr change                           |
| `E711`     | is None replaces == None, which differs for numpy, pandas and SQLAlchemy values that overload **eq** |
| `FLY002`   | an f-string formats each item instead of requiring str                            |
| `LOG001`   | Logger becomes getLogger, which adds the logger to the logging tree               |
| `N804`     | renaming cls breaks callers that pass it by keyword                               |
| `N805`     | renaming self breaks callers that pass it by keyword                              |
| `PIE810`   | a tuple of prefixes fails when an argument is itself a tuple                      |
| `PLE1519`  | singledispatch becomes singledispatchmethod, which dispatches on another argument |
| `PLE1520`  | singledispatchmethod becomes singledispatch, which dispatches on another argument |
| `PLR1714`  | a set or tuple evaluates every member, while or short-circuits                    |
| `PLW0133`  | adds a raise to an exception that was built and dropped                           |
| `PT014`    | removes duplicate test cases, which tests with shared state may rely on           |
| `PT022`    | drops a yield that may carry implicit cleanup                                     |
| `RUF005`   | [a, *b] replaces [a] + b, which differs for a type with a custom **add** or **iter** (numpy arrays)  |
| `RUF015`   | next(iter()) is lazy and raises StopIteration instead of IndexError               |
| `RUF024`   | each dict value becomes its own object instead of a shared one                    |
| `RUF032`   | the Decimal value changes from the float it was built from                        |
| `SIM109`   | in (...) evaluates every comparand once and can reorder side effects              |
| `SIM112`   | upper-casing an environment variable name is case-sensitive on Unix               |
| `SIM118`   | drops .keys() on an object that may not be a dict                                 |
| `T201`     | removes a print that may be output, not debugging                                 |
| `T203`     | removes a pprint that may be output, not debugging                                |
| `TRY201`   | bare raise replaces raise e, which differs when the name is rebound between except and raise         |
| `TRY400`   | logger.exception adds a traceback to the log record                               |

### Left out

- Promoted once and withdrawn because the fix drops comments inside the rewritten expression: B004,
  PERF102, RUF007, RUF046, SIM201, SIM202, SIM210. Ruff keeps them unsafe.
- Only unsafe when comments would be dropped: C400 to C406, C408 to C411, C414, C418, C420, PIE804,
  PERF101, PTH201, RET501, SIM110, SIM905, SIM910, SIM911, PLE0241, RUF010, RUF019, RUF020, RUF037,
  RUF041, RUF051, RUF058, PT001, PT020, PT023, ASYNC115, F841, B013. Without comments ruff already
  applies them. Promoting them would delete comments, and recipes never touch comments.
- Only unsafe for names or arguments that are unusual: B009, B010 (names that are not NFKC), F401 in
  `__init__.py`, F504, F522, F523 (arguments with side effects), PIE790. Ruff already fixes the usual
  case.
- The behaviour change is real and no single result is right: B905 and B912 (`strict=False` hides a
  length mismatch), C413, C416, C417, C419 (ordering, laziness, error propagation), E402 (import
  order), F601, F602, LOG002, LOG004, LOG014, PIE794, PLW0108, PLW1507, PLW3301 (NaN), PTH210,
  RUF017, RUF022, RUF023 (comments inside the list), RUF026, RUF028, RUF030, RUF033, RUF053, RUF057,
  RUF064, RUF102, UP031, FURB192, PLW1510 (display only).

## Writing the output

`ruff check --fix` runs per file over stdin and the engine writes the result, so a file that
changed meanwhile, is not UTF-8 or is a link is left as it is (see `docs/usage.md`).
