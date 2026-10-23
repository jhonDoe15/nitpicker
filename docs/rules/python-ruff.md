# Python: ruff rules

The ruff rules in nitpicker's own ruff config, by rule code. This page lists 364 rules. [All pages](README.md).

The guide for these rules: [docs/python-preset.md](../python-preset.md).

Unless an entry says otherwise:

- **Presets:** Python
- **Analyzers:** `python`

<a id="ruff-arg001"></a>

### `ruff/ARG001`

Unused function argument: `{name}`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-unused-arguments rules (`unused-function-argument`).
- **Allowed form:** Remove the unused argument. A method that overrides a base class takes `@typing.override` (`typing_extensions.override` before Python 3.12) instead; a parameter that a framework passes by keyword keeps its name, and that path gets an exception.
- **Exception:** If this is intended, add `{"rule":"ARG001","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unused-function-argument/)

<a id="ruff-arg002"></a>

### `ruff/ARG002`

Unused method argument: `{name}`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-unused-arguments rules (`unused-method-argument`).
- **Allowed form:** Remove the unused argument. A method that overrides a base class takes `@typing.override` (`typing_extensions.override` before Python 3.12) instead; a parameter that a framework passes by keyword keeps its name, and that path gets an exception.
- **Exception:** If this is intended, add `{"rule":"ARG002","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unused-method-argument/)

<a id="ruff-arg003"></a>

### `ruff/ARG003`

Unused class method argument: `{name}`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-unused-arguments rules (`unused-class-method-argument`).
- **Allowed form:** Remove the unused argument. A method that overrides a base class takes `@typing.override` (`typing_extensions.override` before Python 3.12) instead; a parameter that a framework passes by keyword keeps its name, and that path gets an exception.
- **Exception:** If this is intended, add `{"rule":"ARG003","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unused-class-method-argument/)

<a id="ruff-arg004"></a>

### `ruff/ARG004`

Unused static method argument: `{name}`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-unused-arguments rules (`unused-static-method-argument`).
- **Allowed form:** Remove the unused argument. A method that overrides a base class takes `@typing.override` (`typing_extensions.override` before Python 3.12) instead; a parameter that a framework passes by keyword keeps its name, and that path gets an exception.
- **Exception:** If this is intended, add `{"rule":"ARG004","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unused-static-method-argument/)

<a id="ruff-arg005"></a>

### `ruff/ARG005`

Unused lambda argument: `{name}`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-unused-arguments rules (`unused-lambda-argument`).
- **Allowed form:** Remove the unused argument. A method that overrides a base class takes `@typing.override` (`typing_extensions.override` before Python 3.12) instead; a parameter that a framework passes by keyword keeps its name, and that path gets an exception.
- **Exception:** If this is intended, add `{"rule":"ARG005","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unused-lambda-argument/)

<a id="ruff-b002"></a>

### `ruff/B002`

Python does not support the unary prefix increment operator (`++`).

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`unary-prefix-increment-decrement`).
- **Exception:** If this is intended, add `{"rule":"B002","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unary-prefix-increment-decrement/)

<a id="ruff-b003"></a>

### `ruff/B003`

Assigning to `os.environ` doesn't clear the environment.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`assignment-to-os-environ`).
- **Exception:** If this is intended, add `{"rule":"B003","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/assignment-to-os-environ/)

<a id="ruff-b004"></a>

### `ruff/B004`

Using `hasattr(x, "__call__")` to test if x is callable is unreliable. Use `callable(x)` for consistent results.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`unreliable-callable-check`).
- **Exception:** If this is intended, add `{"rule":"B004","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unreliable-callable-check/)

<a id="ruff-b005"></a>

### `ruff/B005`

Using `.{strip}()` with multi-character strings is misleading.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`strip-with-multi-characters`).
- **Exception:** If this is intended, add `{"rule":"B005","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/strip-with-multi-characters/)

<a id="ruff-b006"></a>

### `ruff/B006`

Do not use mutable data structures for argument defaults.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`mutable-argument-default`).
- **Allowed form:** Default to `None` and create the value inside the function, or use an immutable default such as a tuple.
- **Exception:** If this is intended, add `{"rule":"B006","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/mutable-argument-default/)

<a id="ruff-b007"></a>

### `ruff/B007`

Loop control variable `{name}` not used within loop body.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`unused-loop-control-variable`).
- **Exception:** If this is intended, add `{"rule":"B007","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unused-loop-control-variable/)

<a id="ruff-b009"></a>

### `ruff/B009`

Do not call `getattr` with a constant attribute value. It is not any safer than normal property access.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`get-attr-with-constant`).
- **Exception:** If this is intended, add `{"rule":"B009","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/get-attr-with-constant/)

<a id="ruff-b010"></a>

### `ruff/B010`

Do not call `setattr` with a constant attribute value. It is not any safer than normal property access.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`set-attr-with-constant`).
- **Exception:** If this is intended, add `{"rule":"B010","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/set-attr-with-constant/)

<a id="ruff-b011"></a>

### `ruff/B011`

Do not `assert False` (`python -O` removes these calls), raise `AssertionError()`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`assert-false`).
- **Exception:** If this is intended, add `{"rule":"B011","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/assert-false/)

<a id="ruff-b012"></a>

### `ruff/B012`

`{name}` inside `finally` blocks cause exceptions to be silenced.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`jump-statement-in-finally`).
- **Exception:** If this is intended, add `{"rule":"B012","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/jump-statement-in-finally/)

<a id="ruff-b013"></a>

### `ruff/B013`

A length-one tuple literal is redundant in exception handlers.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`redundant-tuple-in-exception-handler`).
- **Exception:** If this is intended, add `{"rule":"B013","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/redundant-tuple-in-exception-handler/)

<a id="ruff-b014"></a>

### `ruff/B014`

Exception handler with duplicate exception: `{name}`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`duplicate-handler-exception`).
- **Exception:** If this is intended, add `{"rule":"B014","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/duplicate-handler-exception/)

<a id="ruff-b015"></a>

### `ruff/B015`

Pointless comparison. Did you mean to assign a value? Otherwise, prepend `assert` or remove it.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`useless-comparison`).
- **Exception:** If this is intended, add `{"rule":"B015","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/useless-comparison/)

<a id="ruff-b016"></a>

### `ruff/B016`

Cannot raise a literal. Did you intend to return it or raise an Exception?

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`raise-literal`).
- **Exception:** If this is intended, add `{"rule":"B016","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/raise-literal/)

<a id="ruff-b017"></a>

### `ruff/B017`

Do not assert blind exception: `{exception}`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`assert-raises-exception`).
- **Exception:** If this is intended, add `{"rule":"B017","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/assert-raises-exception/)

<a id="ruff-b018"></a>

### `ruff/B018`

Found useless expression. Either assign it to a variable or remove it.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`useless-expression`).
- **Exception:** If this is intended, add `{"rule":"B018","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/useless-expression/)

<a id="ruff-b019"></a>

### `ruff/B019`

Use of `functools.lru_cache` or `functools.cache` on methods can lead to memory leaks.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`cached-instance-method`).
- **Exception:** If this is intended, add `{"rule":"B019","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/cached-instance-method/)

<a id="ruff-b020"></a>

### `ruff/B020`

Loop control variable `{name}` overrides iterable it iterates.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`loop-variable-overrides-iterator`).
- **Exception:** If this is intended, add `{"rule":"B020","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/loop-variable-overrides-iterator/)

<a id="ruff-b021"></a>

### `ruff/B021`

F-string used as docstring. Python will interpret this as a joined string, rather than a docstring.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`f-string-docstring`).
- **Exception:** If this is intended, add `{"rule":"B021","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/f-string-docstring/)

<a id="ruff-b022"></a>

### `ruff/B022`

No arguments passed to `contextlib.suppress`. No exceptions will be suppressed and therefore this context manager is redundant.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`useless-contextlib-suppress`).
- **Exception:** If this is intended, add `{"rule":"B022","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/useless-contextlib-suppress/)

<a id="ruff-b023"></a>

### `ruff/B023`

Function definition does not bind loop variable `{name}`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`function-uses-loop-variable`).
- **Exception:** If this is intended, add `{"rule":"B023","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/function-uses-loop-variable/)

<a id="ruff-b024"></a>

### `ruff/B024`

`{name}` is an abstract base class, but it has no abstract methods or properties.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`abstract-base-class-without-abstract-method`).
- **Exception:** If this is intended, add `{"rule":"B024","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/abstract-base-class-without-abstract-method/)

<a id="ruff-b025"></a>

### `ruff/B025`

Try-except\* block with duplicate exception `{name}`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`duplicate-try-block-exception`).
- **Exception:** If this is intended, add `{"rule":"B025","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/duplicate-try-block-exception/)

<a id="ruff-b026"></a>

### `ruff/B026`

Star-arg unpacking after a keyword argument is strongly discouraged.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`star-arg-unpacking-after-keyword-arg`).
- **Exception:** If this is intended, add `{"rule":"B026","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/star-arg-unpacking-after-keyword-arg/)

<a id="ruff-b027"></a>

### `ruff/B027`

`{name}` is an empty method in an abstract base class, but has no abstract decorator.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`empty-method-without-abstract-decorator`).
- **Exception:** If this is intended, add `{"rule":"B027","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/empty-method-without-abstract-decorator/)

<a id="ruff-b028"></a>

### `ruff/B028`

No explicit `stacklevel` keyword argument found.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`no-explicit-stacklevel`).
- **Exception:** If this is intended, add `{"rule":"B028","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/no-explicit-stacklevel/)

<a id="ruff-b029"></a>

### `ruff/B029`

Using `except* ():` with an empty tuple does not catch anything; add exceptions to handle.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`except-with-empty-tuple`).
- **Exception:** If this is intended, add `{"rule":"B029","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/except-with-empty-tuple/)

<a id="ruff-b030"></a>

### `ruff/B030`

`except*` handlers should only be exception classes or tuples of exception classes.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`except-with-non-exception-classes`).
- **Exception:** If this is intended, add `{"rule":"B030","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/except-with-non-exception-classes/)

<a id="ruff-b031"></a>

### `ruff/B031`

Using the generator returned from `itertools.groupby()` more than once will do nothing on the second usage.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`reuse-of-groupby-generator`).
- **Exception:** If this is intended, add `{"rule":"B031","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/reuse-of-groupby-generator/)

<a id="ruff-b032"></a>

### `ruff/B032`

Possible unintentional type annotation (using `:`). Did you mean to assign (using `=`)?

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`unintentional-type-annotation`).
- **Exception:** If this is intended, add `{"rule":"B032","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unintentional-type-annotation/)

<a id="ruff-b033"></a>

### `ruff/B033`

Sets should not contain duplicate item `{value}`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`duplicate-value`).
- **Exception:** If this is intended, add `{"rule":"B033","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/duplicate-value/)

<a id="ruff-b034"></a>

### `ruff/B034`

`{method}` should pass `{param_name}` and `flags` as keyword arguments to avoid confusion due to unintuitive argument positions.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`re-sub-positional-args`).
- **Exception:** If this is intended, add `{"rule":"B034","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/re-sub-positional-args/)

<a id="ruff-b035"></a>

### `ruff/B035`

Dictionary comprehension uses static key: `{key}`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`static-key-dict-comprehension`).
- **Exception:** If this is intended, add `{"rule":"B035","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/static-key-dict-comprehension/)

<a id="ruff-b039"></a>

### `ruff/B039`

Do not use mutable data structures for `ContextVar` defaults.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`mutable-contextvar-default`).
- **Exception:** If this is intended, add `{"rule":"B039","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/mutable-contextvar-default/)

<a id="ruff-b904"></a>

### `ruff/B904`

Within an `except*` clause, raise exceptions with `raise ... from err` or `raise ... from None` to distinguish them from errors in exception handling.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`raise-without-from-inside-except`).
- **Exception:** If this is intended, add `{"rule":"B904","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/raise-without-from-inside-except/)

<a id="ruff-b905"></a>

### `ruff/B905`

`zip()` without an explicit `strict=` parameter.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`zip-without-explicit-strict`).
- **Exception:** If this is intended, add `{"rule":"B905","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/zip-without-explicit-strict/)

<a id="ruff-b911"></a>

### `ruff/B911`

`itertools.batched()` without an explicit `strict` parameter.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`batched-without-explicit-strict`).
- **Exception:** If this is intended, add `{"rule":"B911","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/batched-without-explicit-strict/)

<a id="ruff-b912"></a>

### `ruff/B912`

`map()` without an explicit `strict=` parameter.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`map-without-explicit-strict`).
- **Exception:** If this is intended, add `{"rule":"B912","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/map-without-explicit-strict/)

<a id="ruff-ble001"></a>

### `ruff/BLE001`

Do not catch blind exception: `{name}`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-blind-except rules (`blind-except`).
- **Allowed form:** Catch the specific exception and handle it, or re-raise it with its cause (`raise DomainError(...) from error`); `contextlib.suppress(SpecificError)` ignores one expected error. In a test, use `pytest.raises(SpecificError)` (`self.assertRaises` in unittest).
- **Exception:** If this is intended, add `{"rule":"BLE001","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/blind-except/)

<a id="ruff-c400"></a>

### `ruff/C400`

Unnecessary generator (rewrite using `list()`).

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-comprehensions rules (`unnecessary-generator-list`).
- **Exception:** If this is intended, add `{"rule":"C400","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-generator-list/)

<a id="ruff-c401"></a>

### `ruff/C401`

Unnecessary generator (rewrite using `set()`).

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-comprehensions rules (`unnecessary-generator-set`).
- **Exception:** If this is intended, add `{"rule":"C401","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-generator-set/)

<a id="ruff-c402"></a>

### `ruff/C402`

Unnecessary generator (rewrite as a dict comprehension).

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-comprehensions rules (`unnecessary-generator-dict`).
- **Exception:** If this is intended, add `{"rule":"C402","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-generator-dict/)

<a id="ruff-c403"></a>

### `ruff/C403`

Unnecessary list comprehension (rewrite as a set comprehension).

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-comprehensions rules (`unnecessary-list-comprehension-set`).
- **Exception:** If this is intended, add `{"rule":"C403","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-list-comprehension-set/)

<a id="ruff-c404"></a>

### `ruff/C404`

Unnecessary list comprehension (rewrite as a dict comprehension).

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-comprehensions rules (`unnecessary-list-comprehension-dict`).
- **Exception:** If this is intended, add `{"rule":"C404","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-list-comprehension-dict/)

<a id="ruff-c405"></a>

### `ruff/C405`

Unnecessary {kind} literal (rewrite as a set literal).

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-comprehensions rules (`unnecessary-literal-set`).
- **Exception:** If this is intended, add `{"rule":"C405","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-literal-set/)

<a id="ruff-c406"></a>

### `ruff/C406`

Unnecessary {obj_type} literal (rewrite as a dict literal).

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-comprehensions rules (`unnecessary-literal-dict`).
- **Exception:** If this is intended, add `{"rule":"C406","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-literal-dict/)

<a id="ruff-c408"></a>

### `ruff/C408`

Unnecessary `{kind}()` call (rewrite as a literal).

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-comprehensions rules (`unnecessary-collection-call`).
- **Exception:** If this is intended, add `{"rule":"C408","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-collection-call/)

<a id="ruff-c409"></a>

### `ruff/C409`

Unnecessary list literal passed to `tuple()` (rewrite as a tuple literal).

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-comprehensions rules (`unnecessary-literal-within-tuple-call`).
- **Exception:** If this is intended, add `{"rule":"C409","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-literal-within-tuple-call/)

<a id="ruff-c410"></a>

### `ruff/C410`

Unnecessary list literal passed to `list()` (remove the outer call to `list()`).

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-comprehensions rules (`unnecessary-literal-within-list-call`).
- **Exception:** If this is intended, add `{"rule":"C410","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-literal-within-list-call/)

<a id="ruff-c411"></a>

### `ruff/C411`

Unnecessary `list()` call (remove the outer call to `list()`).

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-comprehensions rules (`unnecessary-list-call`).
- **Exception:** If this is intended, add `{"rule":"C411","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-list-call/)

<a id="ruff-c413"></a>

### `ruff/C413`

Unnecessary `{func}()` call around `sorted()`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-comprehensions rules (`unnecessary-call-around-sorted`).
- **Exception:** If this is intended, add `{"rule":"C413","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-call-around-sorted/)

<a id="ruff-c414"></a>

### `ruff/C414`

Unnecessary `{inner}()` call within `{outer}()`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-comprehensions rules (`unnecessary-double-cast-or-process`).
- **Exception:** If this is intended, add `{"rule":"C414","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-double-cast-or-process/)

<a id="ruff-c415"></a>

### `ruff/C415`

Unnecessary subscript reversal of iterable within `{func}()`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-comprehensions rules (`unnecessary-subscript-reversal`).
- **Exception:** If this is intended, add `{"rule":"C415","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-subscript-reversal/)

<a id="ruff-c416"></a>

### `ruff/C416`

Unnecessary {kind} comprehension (rewrite using `{kind}()`).

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-comprehensions rules (`unnecessary-comprehension`).
- **Exception:** If this is intended, add `{"rule":"C416","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-comprehension/)

<a id="ruff-c417"></a>

### `ruff/C417`

Unnecessary `map()` usage (rewrite using a {object_type}).

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-comprehensions rules (`unnecessary-map`).
- **Exception:** If this is intended, add `{"rule":"C417","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-map/)

<a id="ruff-c418"></a>

### `ruff/C418`

Unnecessary dict {kind} passed to `dict()` (remove the outer call to `dict()`).

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-comprehensions rules (`unnecessary-literal-within-dict-call`).
- **Exception:** If this is intended, add `{"rule":"C418","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-literal-within-dict-call/)

<a id="ruff-c419"></a>

### `ruff/C419`

Unnecessary list comprehension.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-comprehensions rules (`unnecessary-comprehension-in-call`).
- **Exception:** If this is intended, add `{"rule":"C419","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-comprehension-in-call/)

<a id="ruff-c420"></a>

### `ruff/C420`

Unnecessary dict comprehension for iterable; use `dict.fromkeys` instead.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-comprehensions rules (`unnecessary-dict-comprehension-for-iterable`).
- **Exception:** If this is intended, add `{"rule":"C420","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-dict-comprehension-for-iterable/)

<a id="ruff-e401"></a>

### `ruff/E401`

Multiple imports on one line.

- **Why it is on:** Selected in the ruff config of the Python preset, with the pycodestyle rules (`multiple-imports-on-one-line`).
- **Exception:** If this is intended, add `{"rule":"E401","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/multiple-imports-on-one-line/)

<a id="ruff-e402"></a>

### `ruff/E402`

Module level import not at top of cell.

- **Why it is on:** Selected in the ruff config of the Python preset, with the pycodestyle rules (`module-import-not-at-top-of-file`).
- **Exception:** If this is intended, add `{"rule":"E402","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/module-import-not-at-top-of-file/)

<a id="ruff-e701"></a>

### `ruff/E701`

Multiple statements on one line (colon).

- **Why it is on:** Selected in the ruff config of the Python preset, with the pycodestyle rules (`multiple-statements-on-one-line-colon`).
- **Exception:** If this is intended, add `{"rule":"E701","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/multiple-statements-on-one-line-colon/)

<a id="ruff-e702"></a>

### `ruff/E702`

Multiple statements on one line (semicolon).

- **Why it is on:** Selected in the ruff config of the Python preset, with the pycodestyle rules (`multiple-statements-on-one-line-semicolon`).
- **Exception:** If this is intended, add `{"rule":"E702","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/multiple-statements-on-one-line-semicolon/)

<a id="ruff-e703"></a>

### `ruff/E703`

Statement ends with an unnecessary semicolon.

- **Why it is on:** Selected in the ruff config of the Python preset, with the pycodestyle rules (`useless-semicolon`).
- **Exception:** If this is intended, add `{"rule":"E703","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/useless-semicolon/)

<a id="ruff-e711"></a>

### `ruff/E711`

Comparison to `None` should be `cond is None`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the pycodestyle rules (`none-comparison`).
- **Exception:** If this is intended, add `{"rule":"E711","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/none-comparison/)

<a id="ruff-e712"></a>

### `ruff/E712`

Avoid equality comparisons to `True`; use `{cond}:` for truth checks.

- **Why it is on:** Selected in the ruff config of the Python preset, with the pycodestyle rules (`true-false-comparison`).
- **Exception:** If this is intended, add `{"rule":"E712","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/true-false-comparison/)

<a id="ruff-e713"></a>

### `ruff/E713`

Test for membership should be `not in`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the pycodestyle rules (`not-in-test`).
- **Exception:** If this is intended, add `{"rule":"E713","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/not-in-test/)

<a id="ruff-e714"></a>

### `ruff/E714`

Test for object identity should be `is not`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the pycodestyle rules (`not-is-test`).
- **Exception:** If this is intended, add `{"rule":"E714","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/not-is-test/)

<a id="ruff-e721"></a>

### `ruff/E721`

Use `is` and `is not` for type comparisons, or `isinstance()` for isinstance checks.

- **Why it is on:** Selected in the ruff config of the Python preset, with the pycodestyle rules (`type-comparison`).
- **Exception:** If this is intended, add `{"rule":"E721","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/type-comparison/)

<a id="ruff-e722"></a>

### `ruff/E722`

Do not use bare `except`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the pycodestyle rules (`bare-except`).
- **Allowed form:** Catch the specific exception and handle it, or re-raise it with its cause (`raise DomainError(...) from error`); `contextlib.suppress(SpecificError)` ignores one expected error. In a test, use `pytest.raises(SpecificError)` (`self.assertRaises` in unittest).
- **Exception:** If this is intended, add `{"rule":"E722","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/bare-except/)

<a id="ruff-e731"></a>

### `ruff/E731`

Do not assign a `lambda` expression, use a `def`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the pycodestyle rules (`lambda-assignment`).
- **Exception:** If this is intended, add `{"rule":"E731","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/lambda-assignment/)

<a id="ruff-e741"></a>

### `ruff/E741`

Ambiguous variable name: `{name}`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the pycodestyle rules (`ambiguous-variable-name`).
- **Exception:** If this is intended, add `{"rule":"E741","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/ambiguous-variable-name/)

<a id="ruff-e742"></a>

### `ruff/E742`

Ambiguous class name: `{name}`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the pycodestyle rules (`ambiguous-class-name`).
- **Exception:** If this is intended, add `{"rule":"E742","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/ambiguous-class-name/)

<a id="ruff-e743"></a>

### `ruff/E743`

Ambiguous function name: `{name}`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the pycodestyle rules (`ambiguous-function-name`).
- **Exception:** If this is intended, add `{"rule":"E743","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/ambiguous-function-name/)

<a id="ruff-e902"></a>

### `ruff/E902`

{message}.

- **Why it is on:** Selected in the ruff config of the Python preset, with the pycodestyle rules (`io-error`).
- **Exception:** If this is intended, add `{"rule":"E902","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/io-error/)

<a id="ruff-era001"></a>

### `ruff/ERA001`

Found commented-out code.

- **Why it is on:** Selected in the ruff config of the Python preset, with the eradicate rules (`commented-out-code`).
- **Allowed form:** Delete the commented-out code; version control keeps the history. A comment that explains something is written as prose (`Raises: ValueError` and `e.g.` lines are allowed).
- **Exception:** If this is intended, add `{"rule":"ERA001","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/commented-out-code/)

<a id="ruff-f401"></a>

### `ruff/F401`

`{name}` imported but unused; consider using `importlib.util.find_spec` to test for availability.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Pyflakes rules (`unused-import`).
- **Exception:** If this is intended, add `{"rule":"F401","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unused-import/)

<a id="ruff-f402"></a>

### `ruff/F402`

Import `{name}` from {row} shadowed by loop variable.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Pyflakes rules (`import-shadowed-by-loop-var`).
- **Exception:** If this is intended, add `{"rule":"F402","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/import-shadowed-by-loop-var/)

<a id="ruff-f403"></a>

### `ruff/F403`

`from {name} import *` used; unable to detect undefined names.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Pyflakes rules (`undefined-local-with-import-star`).
- **Allowed form:** Import the names you use: `from module import name`.
- **Exception:** If this is intended, add `{"rule":"F403","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/undefined-local-with-import-star/)

<a id="ruff-f404"></a>

### `ruff/F404`

`from __future__` imports must occur at the beginning of the file.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Pyflakes rules (`late-future-import`).
- **Exception:** If this is intended, add `{"rule":"F404","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/late-future-import/)

<a id="ruff-f406"></a>

### `ruff/F406`

`from {name} import *` only allowed at module level.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Pyflakes rules (`undefined-local-with-nested-import-star-usage`).
- **Exception:** If this is intended, add `{"rule":"F406","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/undefined-local-with-nested-import-star-usage/)

<a id="ruff-f407"></a>

### `ruff/F407`

Future feature `{name}` is not defined.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Pyflakes rules (`future-feature-not-defined`).
- **Exception:** If this is intended, add `{"rule":"F407","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/future-feature-not-defined/)

<a id="ruff-f501"></a>

### `ruff/F501`

`%`-format string has invalid format string: {message}.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Pyflakes rules (`percent-format-invalid-format`).
- **Exception:** If this is intended, add `{"rule":"F501","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/percent-format-invalid-format/)

<a id="ruff-f502"></a>

### `ruff/F502`

`%`-format string expected mapping but got sequence.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Pyflakes rules (`percent-format-expected-mapping`).
- **Exception:** If this is intended, add `{"rule":"F502","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/percent-format-expected-mapping/)

<a id="ruff-f503"></a>

### `ruff/F503`

`%`-format string expected sequence but got mapping.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Pyflakes rules (`percent-format-expected-sequence`).
- **Exception:** If this is intended, add `{"rule":"F503","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/percent-format-expected-sequence/)

<a id="ruff-f504"></a>

### `ruff/F504`

`%`-format string has unused named argument(s): {message}.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Pyflakes rules (`percent-format-extra-named-arguments`).
- **Exception:** If this is intended, add `{"rule":"F504","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/percent-format-extra-named-arguments/)

<a id="ruff-f505"></a>

### `ruff/F505`

`%`-format string is missing argument(s) for placeholder(s): {message}.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Pyflakes rules (`percent-format-missing-argument`).
- **Exception:** If this is intended, add `{"rule":"F505","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/percent-format-missing-argument/)

<a id="ruff-f506"></a>

### `ruff/F506`

`%`-format string has mixed positional and named placeholders.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Pyflakes rules (`percent-format-mixed-positional-and-named`).
- **Exception:** If this is intended, add `{"rule":"F506","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/percent-format-mixed-positional-and-named/)

<a id="ruff-f507"></a>

### `ruff/F507`

`%`-format string has {wanted} placeholder(s) but {got} substitution(s).

- **Why it is on:** Selected in the ruff config of the Python preset, with the Pyflakes rules (`percent-format-positional-count-mismatch`).
- **Exception:** If this is intended, add `{"rule":"F507","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/percent-format-positional-count-mismatch/)

<a id="ruff-f508"></a>

### `ruff/F508`

`%`-format string `*` specifier requires sequence.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Pyflakes rules (`percent-format-star-requires-sequence`).
- **Exception:** If this is intended, add `{"rule":"F508","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/percent-format-star-requires-sequence/)

<a id="ruff-f509"></a>

### `ruff/F509`

`%`-format string has unsupported format character `{char}`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Pyflakes rules (`percent-format-unsupported-format-character`).
- **Exception:** If this is intended, add `{"rule":"F509","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/percent-format-unsupported-format-character/)

<a id="ruff-f521"></a>

### `ruff/F521`

`.format` call has invalid format string: {message}.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Pyflakes rules (`string-dot-format-invalid-format`).
- **Exception:** If this is intended, add `{"rule":"F521","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/string-dot-format-invalid-format/)

<a id="ruff-f522"></a>

### `ruff/F522`

`.format` call has unused named argument(s): {message}.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Pyflakes rules (`string-dot-format-extra-named-arguments`).
- **Exception:** If this is intended, add `{"rule":"F522","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/string-dot-format-extra-named-arguments/)

<a id="ruff-f523"></a>

### `ruff/F523`

`.format` call has unused arguments at position(s): {message}.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Pyflakes rules (`string-dot-format-extra-positional-arguments`).
- **Exception:** If this is intended, add `{"rule":"F523","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/string-dot-format-extra-positional-arguments/)

<a id="ruff-f524"></a>

### `ruff/F524`

`.format` call is missing argument(s) for placeholder(s): {message}.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Pyflakes rules (`string-dot-format-missing-arguments`).
- **Exception:** If this is intended, add `{"rule":"F524","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/string-dot-format-missing-arguments/)

<a id="ruff-f525"></a>

### `ruff/F525`

`.format` string mixes automatic and manual numbering.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Pyflakes rules (`string-dot-format-mixing-automatic`).
- **Exception:** If this is intended, add `{"rule":"F525","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/string-dot-format-mixing-automatic/)

<a id="ruff-f541"></a>

### `ruff/F541`

F-string without any placeholders.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Pyflakes rules (`f-string-missing-placeholders`).
- **Exception:** If this is intended, add `{"rule":"F541","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/f-string-missing-placeholders/)

<a id="ruff-f601"></a>

### `ruff/F601`

Dictionary key literal `{name}` repeated.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Pyflakes rules (`multi-value-repeated-key-literal`).
- **Exception:** If this is intended, add `{"rule":"F601","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/multi-value-repeated-key-literal/)

<a id="ruff-f602"></a>

### `ruff/F602`

Dictionary key `{name}` repeated.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Pyflakes rules (`multi-value-repeated-key-variable`).
- **Exception:** If this is intended, add `{"rule":"F602","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/multi-value-repeated-key-variable/)

<a id="ruff-f621"></a>

### `ruff/F621`

Too many expressions in star-unpacking assignment.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Pyflakes rules (`expressions-in-star-assignment`).
- **Exception:** If this is intended, add `{"rule":"F621","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/expressions-in-star-assignment/)

<a id="ruff-f622"></a>

### `ruff/F622`

Two starred expressions in assignment.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Pyflakes rules (`multiple-starred-expressions`).
- **Exception:** If this is intended, add `{"rule":"F622","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/multiple-starred-expressions/)

<a id="ruff-f631"></a>

### `ruff/F631`

Assert test is a non-empty tuple, which is always `True`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Pyflakes rules (`assert-tuple`).
- **Exception:** If this is intended, add `{"rule":"F631","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/assert-tuple/)

<a id="ruff-f632"></a>

### `ruff/F632`

Use `==` to compare constant literals.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Pyflakes rules (`is-literal`).
- **Exception:** If this is intended, add `{"rule":"F632","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/is-literal/)

<a id="ruff-f633"></a>

### `ruff/F633`

Use of `>>` is invalid with `print` function.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Pyflakes rules (`invalid-print-syntax`).
- **Exception:** If this is intended, add `{"rule":"F633","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/invalid-print-syntax/)

<a id="ruff-f634"></a>

### `ruff/F634`

If test is a tuple, which is always `True`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Pyflakes rules (`if-tuple`).
- **Exception:** If this is intended, add `{"rule":"F634","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/if-tuple/)

<a id="ruff-f701"></a>

### `ruff/F701`

`break` outside loop.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Pyflakes rules (`break-outside-loop`).
- **Exception:** If this is intended, add `{"rule":"F701","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/break-outside-loop/)

<a id="ruff-f702"></a>

### `ruff/F702`

`continue` not properly in loop.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Pyflakes rules (`continue-outside-loop`).
- **Exception:** If this is intended, add `{"rule":"F702","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/continue-outside-loop/)

<a id="ruff-f704"></a>

### `ruff/F704`

`{keyword}` statement outside of a function.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Pyflakes rules (`yield-outside-function`).
- **Exception:** If this is intended, add `{"rule":"F704","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/yield-outside-function/)

<a id="ruff-f706"></a>

### `ruff/F706`

`return` statement outside of a function/method.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Pyflakes rules (`return-outside-function`).
- **Exception:** If this is intended, add `{"rule":"F706","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/return-outside-function/)

<a id="ruff-f707"></a>

### `ruff/F707`

An `except` block as not the last exception handler.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Pyflakes rules (`default-except-not-last`).
- **Exception:** If this is intended, add `{"rule":"F707","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/default-except-not-last/)

<a id="ruff-f722"></a>

### `ruff/F722`

Syntax error in forward annotation: {parse_error}.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Pyflakes rules (`forward-annotation-syntax-error`).
- **Exception:** If this is intended, add `{"rule":"F722","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/forward-annotation-syntax-error/)

<a id="ruff-f811"></a>

### `ruff/F811`

Redefinition of unused `{name}` from {row}.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Pyflakes rules (`redefined-while-unused`).
- **Exception:** If this is intended, add `{"rule":"F811","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/redefined-while-unused/)

<a id="ruff-f821"></a>

### `ruff/F821`

Undefined name `{name}`. {tip}.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Pyflakes rules (`undefined-name`).
- **Exception:** If this is intended, add `{"rule":"F821","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/undefined-name/)

<a id="ruff-f822"></a>

### `ruff/F822`

Undefined name `{name}` in `__all__`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Pyflakes rules (`undefined-export`).
- **Exception:** If this is intended, add `{"rule":"F822","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/undefined-export/)

<a id="ruff-f823"></a>

### `ruff/F823`

Local variable `{name}` referenced before assignment.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Pyflakes rules (`undefined-local`).
- **Exception:** If this is intended, add `{"rule":"F823","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/undefined-local/)

<a id="ruff-f841"></a>

### `ruff/F841`

Local variable `{name}` is assigned to but never used.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Pyflakes rules (`unused-variable`).
- **Exception:** If this is intended, add `{"rule":"F841","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unused-variable/)

<a id="ruff-f842"></a>

### `ruff/F842`

Local variable `{name}` is annotated but never used.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Pyflakes rules (`unused-annotation`).
- **Exception:** If this is intended, add `{"rule":"F842","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unused-annotation/)

<a id="ruff-f901"></a>

### `ruff/F901`

`raise NotImplemented` should be `raise NotImplementedError`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Pyflakes rules (`raise-not-implemented`).
- **Exception:** If this is intended, add `{"rule":"F901","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/raise-not-implemented/)

<a id="ruff-fbt001"></a>

### `ruff/FBT001`

Boolean-typed positional argument in function definition.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-boolean-trap rules (`boolean-type-hint-positional-argument`).
- **Allowed form:** Make the flag keyword-only, `def send(message, *, urgent=False)`, or split the function into two named for each behavior. click, typer and FastAPI pass options by keyword, so `def command(*, verbose: bool)` works there.
- **Exception:** If this is intended, add `{"rule":"FBT001","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/boolean-type-hint-positional-argument/)

<a id="ruff-fbt002"></a>

### `ruff/FBT002`

Boolean default positional argument in function definition.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-boolean-trap rules (`boolean-default-value-positional-argument`).
- **Allowed form:** Make the flag keyword-only, `def send(message, *, urgent=False)`, or split the function into two named for each behavior. click, typer and FastAPI pass options by keyword, so `def command(*, verbose: bool)` works there.
- **Exception:** If this is intended, add `{"rule":"FBT002","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/boolean-default-value-positional-argument/)

<a id="ruff-fly002"></a>

### `ruff/FLY002`

Consider `{expression}` instead of string join.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flynt rules (`static-join-to-f-string`).
- **Allowed form:** Use an f-string: `f"Hello, {name}"`.
- **Exception:** If this is intended, add `{"rule":"FLY002","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/static-join-to-f-string/)

<a id="ruff-g001"></a>

### `ruff/G001`

Logging statement uses `str.format`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-logging-format rules (`logging-string-format`).
- **Allowed form:** Pass the values as arguments, not a formatted string: `logger.info("Loaded %s items", count)`.
- **Exception:** If this is intended, add `{"rule":"G001","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/logging-string-format/)

<a id="ruff-g002"></a>

### `ruff/G002`

Logging statement uses `%`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-logging-format rules (`logging-percent-format`).
- **Allowed form:** Pass the values as arguments, not a formatted string: `logger.info("Loaded %s items", count)`.
- **Exception:** If this is intended, add `{"rule":"G002","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/logging-percent-format/)

<a id="ruff-g003"></a>

### `ruff/G003`

Logging statement uses `+`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-logging-format rules (`logging-string-concat`).
- **Allowed form:** Pass the values as arguments, not a formatted string: `logger.info("Loaded %s items", count)`.
- **Exception:** If this is intended, add `{"rule":"G003","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/logging-string-concat/)

<a id="ruff-g004"></a>

### `ruff/G004`

Logging statement uses f-string.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-logging-format rules (`logging-f-string`).
- **Allowed form:** Pass the values as arguments, not a formatted string: `logger.info("Loaded %s items", count)`.
- **Exception:** If this is intended, add `{"rule":"G004","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/logging-f-string/)

<a id="ruff-g010"></a>

### `ruff/G010`

Logging statement uses `warn` instead of `warning`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-logging-format rules (`logging-warn`).
- **Allowed form:** Call `logger.warning(...)`; `logger.warn` is deprecated.
- **Exception:** If this is intended, add `{"rule":"G010","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/logging-warn/)

<a id="ruff-g101"></a>

### `ruff/G101`

Logging statement uses an `extra` field that clashes with a `LogRecord` field: `{key}`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-logging-format rules (`logging-extra-attr-clash`).
- **Allowed form:** Rename the key in `extra` so it does not clash with a log record attribute: `extra={"user_name": name}`.
- **Exception:** If this is intended, add `{"rule":"G101","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/logging-extra-attr-clash/)

<a id="ruff-g201"></a>

### `ruff/G201`

Logging `.exception(...)` should be used instead of `.error(..., exc_info=True)`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-logging-format rules (`logging-exc-info`).
- **Allowed form:** Inside an `except` block call `logger.exception(...)`, which logs the traceback.
- **Exception:** If this is intended, add `{"rule":"G201","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/logging-exc-info/)

<a id="ruff-g202"></a>

### `ruff/G202`

Logging statement has redundant `exc_info`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-logging-format rules (`logging-redundant-exc-info`).
- **Allowed form:** Drop `exc_info=True`; `logger.exception(...)` already logs the traceback.
- **Exception:** If this is intended, add `{"rule":"G202","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/logging-redundant-exc-info/)

<a id="ruff-n801"></a>

### `ruff/N801`

Class name `{name}` should use CapWords convention.

- **Why it is on:** Selected in the ruff config of the Python preset, with the pep8-naming rules (`invalid-class-name`).
- **Allowed form:** Name the class in `CapWords` (`OrderLine`), not `snake_case`.
- **Exception:** If this is intended, add `{"rule":"N801","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/invalid-class-name/)

<a id="ruff-n802"></a>

### `ruff/N802`

Function name `{name}` should be lowercase.

- **Why it is on:** Selected in the ruff config of the Python preset, with the pep8-naming rules (`invalid-function-name`).
- **Allowed form:** Rename the function, argument or variable in snake_case (`order_id`); `X`, `X_*` and names starting with `assert` are already allowed.
- **Exception:** If this is intended, add `{"rule":"N802","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/invalid-function-name/)

<a id="ruff-n803"></a>

### `ruff/N803`

Argument name `{name}` should be lowercase.

- **Why it is on:** Selected in the ruff config of the Python preset, with the pep8-naming rules (`invalid-argument-name`).
- **Allowed form:** Rename the function, argument or variable in snake_case (`order_id`); `X`, `X_*` and names starting with `assert` are already allowed.
- **Exception:** If this is intended, add `{"rule":"N803","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/invalid-argument-name/)

<a id="ruff-n804"></a>

### `ruff/N804`

First argument of a class method should be named `cls`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the pep8-naming rules (`invalid-first-argument-name-for-class-method`).
- **Allowed form:** Name the first parameter `self` (`cls` in a classmethod, with `@classmethod`); SQLAlchemy `@declared_attr` and pydantic validators are already treated as class methods. Keep snake_case for the rest.
- **Exception:** If this is intended, add `{"rule":"N804","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/invalid-first-argument-name-for-class-method/)

<a id="ruff-n805"></a>

### `ruff/N805`

First argument of a method should be named `self`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the pep8-naming rules (`invalid-first-argument-name-for-method`).
- **Allowed form:** Name the first parameter `self` (`cls` in a classmethod, with `@classmethod`); SQLAlchemy `@declared_attr` and pydantic validators are already treated as class methods. Keep snake_case for the rest.
- **Exception:** If this is intended, add `{"rule":"N805","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/invalid-first-argument-name-for-method/)

<a id="ruff-n806"></a>

### `ruff/N806`

Variable `{name}` in function should be lowercase.

- **Why it is on:** Selected in the ruff config of the Python preset, with the pep8-naming rules (`non-lowercase-variable-in-function`).
- **Allowed form:** Rename the function, argument or variable in snake_case (`order_id`); `X`, `X_*` and names starting with `assert` are already allowed.
- **Exception:** If this is intended, add `{"rule":"N806","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/non-lowercase-variable-in-function/)

<a id="ruff-n807"></a>

### `ruff/N807`

Function name should not start and end with `__`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the pep8-naming rules (`dunder-function-name`).
- **Allowed form:** Rename the function, argument or variable in snake_case (`order_id`); `X`, `X_*` and names starting with `assert` are already allowed.
- **Exception:** If this is intended, add `{"rule":"N807","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/dunder-function-name/)

<a id="ruff-n811"></a>

### `ruff/N811`

Constant `{name}` imported as non-constant `{asname}`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the pep8-naming rules (`constant-imported-as-non-constant`).
- **Allowed form:** Keep the alias in the case of the name it stands for (`import numpy as np`, `from lib import Widget as Wrapped`); the alias `F` is allowed. Use snake_case for a function or module alias.
- **Exception:** If this is intended, add `{"rule":"N811","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/constant-imported-as-non-constant/)

<a id="ruff-n812"></a>

### `ruff/N812`

Lowercase `{name}` imported as non-lowercase `{asname}`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the pep8-naming rules (`lowercase-imported-as-non-lowercase`).
- **Allowed form:** Keep the alias in the case of the name it stands for (`import numpy as np`, `from lib import Widget as Wrapped`); the alias `F` is allowed. Use snake_case for a function or module alias.
- **Exception:** If this is intended, add `{"rule":"N812","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/lowercase-imported-as-non-lowercase/)

<a id="ruff-n813"></a>

### `ruff/N813`

Camelcase `{name}` imported as lowercase `{asname}`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the pep8-naming rules (`camelcase-imported-as-lowercase`).
- **Allowed form:** Keep the alias in the case of the name it stands for (`import numpy as np`, `from lib import Widget as Wrapped`); the alias `F` is allowed. Use snake_case for a function or module alias.
- **Exception:** If this is intended, add `{"rule":"N813","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/camelcase-imported-as-lowercase/)

<a id="ruff-n814"></a>

### `ruff/N814`

Camelcase `{name}` imported as constant `{asname}`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the pep8-naming rules (`camelcase-imported-as-constant`).
- **Allowed form:** Keep the alias in the case of the name it stands for (`import numpy as np`, `from lib import Widget as Wrapped`); the alias `F` is allowed. Use snake_case for a function or module alias.
- **Exception:** If this is intended, add `{"rule":"N814","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/camelcase-imported-as-constant/)

<a id="ruff-n815"></a>

### `ruff/N815`

Variable `{name}` in class scope should not be mixedCase.

- **Why it is on:** Selected in the ruff config of the Python preset, with the pep8-naming rules (`mixed-case-variable-in-class-scope`).
- **Allowed form:** Use snake_case for the name; in a pydantic model keep the Python name in snake_case and set the external name with `Field(alias="orderId")`.
- **Exception:** If this is intended, add `{"rule":"N815","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/mixed-case-variable-in-class-scope/)

<a id="ruff-n816"></a>

### `ruff/N816`

Variable `{name}` in global scope should not be mixedCase.

- **Why it is on:** Selected in the ruff config of the Python preset, with the pep8-naming rules (`mixed-case-variable-in-global-scope`).
- **Allowed form:** Use snake_case for the name; in a pydantic model keep the Python name in snake_case and set the external name with `Field(alias="orderId")`.
- **Exception:** If this is intended, add `{"rule":"N816","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/mixed-case-variable-in-global-scope/)

<a id="ruff-n817"></a>

### `ruff/N817`

CamelCase `{name}` imported as acronym `{asname}`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the pep8-naming rules (`camelcase-imported-as-acronym`).
- **Allowed form:** Keep the alias in the case of the name it stands for (`import numpy as np`, `from lib import Widget as Wrapped`); the alias `F` is allowed. Use snake_case for a function or module alias.
- **Exception:** If this is intended, add `{"rule":"N817","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/camelcase-imported-as-acronym/)

<a id="ruff-n818"></a>

### `ruff/N818`

Exception name `{name}` should be named with an Error suffix.

- **Why it is on:** Selected in the ruff config of the Python preset, with the pep8-naming rules (`error-suffix-on-exception-name`).
- **Allowed form:** Give an exception class the suffix `Error`: `OrderFailedError`; the rest of the name is `CapWords`, not snake_case.
- **Exception:** If this is intended, add `{"rule":"N818","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/error-suffix-on-exception-name/)

<a id="ruff-n999"></a>

### `ruff/N999`

Invalid module name: '{name}'.

- **Why it is on:** Selected in the ruff config of the Python preset, with the pep8-naming rules (`invalid-module-name`).
- **Allowed form:** Name the module in lowercase snake_case, with no dashes or capitals.
- **Exception:** If this is intended, add `{"rule":"N999","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/invalid-module-name/)

<a id="ruff-perf101"></a>

### `ruff/PERF101`

Do not cast an iterable to `list` before iterating over it.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Perflint rules (`unnecessary-list-cast`).
- **Exception:** If this is intended, add `{"rule":"PERF101","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-list-cast/)

<a id="ruff-perf102"></a>

### `ruff/PERF102`

When using only the {subset} of a dict use the `{subset}()` method.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Perflint rules (`incorrect-dict-iterator`).
- **Exception:** If this is intended, add `{"rule":"PERF102","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/incorrect-dict-iterator/)

<a id="ruff-perf203"></a>

### `ruff/PERF203`

`try`-`except` within a loop incurs performance overhead.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Perflint rules (`try-except-in-loop`).
- **Allowed form:** Move the `try` out of the loop, or handle each item in a helper function.
- **Exception:** If this is intended, add `{"rule":"PERF203","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/try-except-in-loop/)

<a id="ruff-perf401"></a>

### `ruff/PERF401`

Use {message_str} to create a transformed list.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Perflint rules (`manual-list-comprehension`).
- **Exception:** If this is intended, add `{"rule":"PERF401","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/manual-list-comprehension/)

<a id="ruff-perf402"></a>

### `ruff/PERF402`

Use `list` or `list.copy` to create a copy of a list.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Perflint rules (`manual-list-copy`).
- **Exception:** If this is intended, add `{"rule":"PERF402","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/manual-list-copy/)

<a id="ruff-perf403"></a>

### `ruff/PERF403`

Use a dictionary comprehension instead of {modifier} for-loop.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Perflint rules (`manual-dict-comprehension`).
- **Exception:** If this is intended, add `{"rule":"PERF403","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/manual-dict-comprehension/)

<a id="ruff-pie790"></a>

### `ruff/PIE790`

Unnecessary `pass` statement.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-pie rules (`unnecessary-placeholder`).
- **Exception:** If this is intended, add `{"rule":"PIE790","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-placeholder/)

<a id="ruff-pie794"></a>

### `ruff/PIE794`

Class field `{name}` is defined multiple times.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-pie rules (`duplicate-class-field-definition`).
- **Exception:** If this is intended, add `{"rule":"PIE794","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/duplicate-class-field-definition/)

<a id="ruff-pie796"></a>

### `ruff/PIE796`

Enum contains duplicate value: `{value}`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-pie rules (`non-unique-enums`).
- **Exception:** If this is intended, add `{"rule":"PIE796","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/non-unique-enums/)

<a id="ruff-pie800"></a>

### `ruff/PIE800`

Unnecessary spread `**`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-pie rules (`unnecessary-spread`).
- **Exception:** If this is intended, add `{"rule":"PIE800","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-spread/)

<a id="ruff-pie804"></a>

### `ruff/PIE804`

Unnecessary `dict` kwargs.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-pie rules (`unnecessary-dict-kwargs`).
- **Exception:** If this is intended, add `{"rule":"PIE804","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-dict-kwargs/)

<a id="ruff-pie807"></a>

### `ruff/PIE807`

Prefer `{container}` over useless lambda.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-pie rules (`reimplemented-container-builtin`).
- **Exception:** If this is intended, add `{"rule":"PIE807","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/reimplemented-container-builtin/)

<a id="ruff-pie808"></a>

### `ruff/PIE808`

Unnecessary `start` argument in `range`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-pie rules (`unnecessary-range-start`).
- **Exception:** If this is intended, add `{"rule":"PIE808","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-range-start/)

<a id="ruff-pie810"></a>

### `ruff/PIE810`

Call `{attr}` once with a `tuple`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-pie rules (`multiple-starts-ends-with`).
- **Exception:** If this is intended, add `{"rule":"PIE810","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/multiple-starts-ends-with/)

<a id="ruff-plr2004"></a>

### `ruff/PLR2004`

Magic value used in comparison, consider replacing `{value}` with a constant variable.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Pylint rules (`magic-value-comparison`).
- **Allowed form:** Name the value as a constant: `MAX_RETRIES = 3`, then compare with `MAX_RETRIES`; compare an HTTP status with a member of `http.HTTPStatus` (`HTTPStatus.NOT_FOUND`). -1, 0, 1, 2, 10, 100 and 1000 are allowed.
- **Exception:** If this is intended, add `{"rule":"PLR2004","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/magic-value-comparison/)

<a id="ruff-plw0602"></a>

### `ruff/PLW0602`

Using global for `{name}` but no assignment is done.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Pylint rules (`global-variable-not-assigned`).
- **Allowed form:** Remove the `global` statement; a function reads a module name without declaring it.
- **Exception:** If this is intended, add `{"rule":"PLW0602","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/global-variable-not-assigned/)

<a id="ruff-plw0603"></a>

### `ruff/PLW0603`

Using the global statement to update `{name}` is discouraged.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Pylint rules (`global-statement`).
- **Allowed form:** Do not rebind a module name: pass the state in and return the new value, hold it in an object created in the composition root, or use `functools.cache` for a value created on first use.
- **Exception:** If this is intended, add `{"rule":"PLW0603","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/global-statement/)

<a id="ruff-pt001"></a>

### `ruff/PT001`

Use `@pytest.fixture{expected}` over `@pytest.fixture{actual}`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-pytest-style rules (`pytest-fixture-incorrect-parentheses-style`).
- **Allowed form:** Write the decorator without parentheses: `@pytest.fixture`, `@pytest.mark.slow`.
- **Exception:** If this is intended, add `{"rule":"PT001","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/pytest-fixture-incorrect-parentheses-style/)

<a id="ruff-pt002"></a>

### `ruff/PT002`

Configuration for fixture `{function}` specified via positional args, use kwargs.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-pytest-style rules (`pytest-fixture-positional-args`).
- **Allowed form:** Pass the fixture options by keyword: `@pytest.fixture(scope="session")`.
- **Exception:** If this is intended, add `{"rule":"PT002","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/pytest-fixture-positional-args/)

<a id="ruff-pt003"></a>

### `ruff/PT003`

`scope='function'` is implied in `@pytest.fixture()`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-pytest-style rules (`pytest-extraneous-scope-function`).
- **Allowed form:** Drop `scope="function"`; it is the default scope of a fixture.
- **Exception:** If this is intended, add `{"rule":"PT003","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/pytest-extraneous-scope-function/)

<a id="ruff-pt006"></a>

### `ruff/PT006`

Wrong type passed to first argument of `pytest.mark.parametrize`; expected {expected_string}.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-pytest-style rules (`pytest-parametrize-names-wrong-type`).
- **Allowed form:** Pass the names as a tuple: `@pytest.mark.parametrize(("a", "b"), [(1, 2)])`.
- **Exception:** If this is intended, add `{"rule":"PT006","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/pytest-parametrize-names-wrong-type/)

<a id="ruff-pt007"></a>

### `ruff/PT007`

Wrong values type in `pytest.mark.parametrize` expected `{values}`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-pytest-style rules (`pytest-parametrize-values-wrong-type`).
- **Allowed form:** Pass the values as a list of tuples: `[(1, 2), (3, 4)]`, or a list for one name.
- **Exception:** If this is intended, add `{"rule":"PT007","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/pytest-parametrize-values-wrong-type/)

<a id="ruff-pt008"></a>

### `ruff/PT008`

Use `return_value=` instead of patching with `lambda`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-pytest-style rules (`pytest-patch-with-lambda`).
- **Allowed form:** Patch with `return_value=...`, or `mocker.patch(target, new=...)`, not a lambda.
- **Exception:** If this is intended, add `{"rule":"PT008","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/pytest-patch-with-lambda/)

<a id="ruff-pt010"></a>

### `ruff/PT010`

Set the expected exception in `pytest.raises()`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-pytest-style rules (`pytest-raises-without-exception`).
- **Allowed form:** Name the expected exception: `with pytest.raises(ValueError, match="invalid"):`.
- **Exception:** If this is intended, add `{"rule":"PT010","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/pytest-raises-without-exception/)

<a id="ruff-pt011"></a>

### `ruff/PT011`

`pytest.raises({exception})` is too broad, set the `match` parameter or use a more specific exception.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-pytest-style rules (`pytest-raises-too-broad`).
- **Allowed form:** Match the message: `with pytest.raises(ValueError, match="invalid"):`, or raise a more specific exception.
- **Exception:** If this is intended, add `{"rule":"PT011","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/pytest-raises-too-broad/)

<a id="ruff-pt012"></a>

### `ruff/PT012`

`pytest.raises()` block should contain a single simple statement.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-pytest-style rules (`pytest-raises-with-multiple-statements`).
- **Allowed form:** Keep one statement in the `pytest.raises` block, the call that raises; build the arguments before it.
- **Exception:** If this is intended, add `{"rule":"PT012","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/pytest-raises-with-multiple-statements/)

<a id="ruff-pt013"></a>

### `ruff/PT013`

Incorrect import of `pytest`; use `import pytest` instead.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-pytest-style rules (`pytest-incorrect-pytest-import`).
- **Allowed form:** Import pytest as a module: `import pytest`, then `pytest.raises(...)`.
- **Exception:** If this is intended, add `{"rule":"PT013","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/pytest-incorrect-pytest-import/)

<a id="ruff-pt014"></a>

### `ruff/PT014`

Duplicate of test case at index {index} in `pytest.mark.parametrize`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-pytest-style rules (`pytest-duplicate-parametrize-test-cases`).
- **Allowed form:** List each parametrize case once.
- **Exception:** If this is intended, add `{"rule":"PT014","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/pytest-duplicate-parametrize-test-cases/)

<a id="ruff-pt015"></a>

### `ruff/PT015`

Assertion always fails, replace with `pytest.fail()`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-pytest-style rules (`pytest-assert-always-false`).
- **Allowed form:** Fail with a message: `pytest.fail("the reason")`.
- **Exception:** If this is intended, add `{"rule":"PT015","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/pytest-assert-always-false/)

<a id="ruff-pt016"></a>

### `ruff/PT016`

No message passed to `pytest.fail()`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-pytest-style rules (`pytest-fail-without-message`).
- **Allowed form:** Fail with a message: `pytest.fail("the reason")`.
- **Exception:** If this is intended, add `{"rule":"PT016","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/pytest-fail-without-message/)

<a id="ruff-pt017"></a>

### `ruff/PT017`

Found assertion on exception `{name}` in `except` block, use `pytest.raises()` instead.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-pytest-style rules (`pytest-assert-in-except`).
- **Allowed form:** Assert on the exception with `with pytest.raises(ValueError) as caught:`, then `assert "x" in str(caught.value)`.
- **Exception:** If this is intended, add `{"rule":"PT017","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/pytest-assert-in-except/)

<a id="ruff-pt018"></a>

### `ruff/PT018`

Assertion should be broken down into multiple parts.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-pytest-style rules (`pytest-composite-assertion`).
- **Allowed form:** Split the assertion in two: `assert a` and `assert b`, one condition each.
- **Exception:** If this is intended, add `{"rule":"PT018","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/pytest-composite-assertion/)

<a id="ruff-pt019"></a>

### `ruff/PT019`

Fixture `{name}` without value is injected as parameter, use `@pytest.mark.usefixtures` instead.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-pytest-style rules (`pytest-fixture-param-without-value`).
- **Allowed form:** Use `@pytest.mark.usefixtures("name")` for a fixture whose value the test does not use.
- **Exception:** If this is intended, add `{"rule":"PT019","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/pytest-fixture-param-without-value/)

<a id="ruff-pt020"></a>

### `ruff/PT020`

`@pytest.yield_fixture` is deprecated, use `@pytest.fixture`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-pytest-style rules (`pytest-deprecated-yield-fixture`).
- **Allowed form:** Declare the fixture with `@pytest.fixture`; `yield_fixture` is deprecated.
- **Exception:** If this is intended, add `{"rule":"PT020","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/pytest-deprecated-yield-fixture/)

<a id="ruff-pt021"></a>

### `ruff/PT021`

Use `yield` instead of `request.addfinalizer`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-pytest-style rules (`pytest-fixture-finalizer-callback`).
- **Allowed form:** Clean up after a `yield` in the fixture instead of `request.addfinalizer`.
- **Exception:** If this is intended, add `{"rule":"PT021","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/pytest-fixture-finalizer-callback/)

<a id="ruff-pt022"></a>

### `ruff/PT022`

No teardown in fixture `{name}`, use `return` instead of `yield`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-pytest-style rules (`pytest-useless-yield-fixture`).
- **Allowed form:** Use `return` in a fixture that has no teardown.
- **Exception:** If this is intended, add `{"rule":"PT022","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/pytest-useless-yield-fixture/)

<a id="ruff-pt023"></a>

### `ruff/PT023`

Use `@pytest.mark.{mark_name}{expected_parens}` over `@pytest.mark.{mark_name}{actual_parens}`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-pytest-style rules (`pytest-incorrect-mark-parentheses-style`).
- **Allowed form:** Write the decorator without parentheses: `@pytest.fixture`, `@pytest.mark.slow`.
- **Exception:** If this is intended, add `{"rule":"PT023","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/pytest-incorrect-mark-parentheses-style/)

<a id="ruff-pt024"></a>

### `ruff/PT024`

`pytest.mark.asyncio` is unnecessary for fixtures.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-pytest-style rules (`pytest-unnecessary-asyncio-mark-on-fixture`).
- **Allowed form:** Remove `@pytest.mark.asyncio` from the fixture; the fixture decorator is enough.
- **Exception:** If this is intended, add `{"rule":"PT024","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/pytest-unnecessary-asyncio-mark-on-fixture/)

<a id="ruff-pt025"></a>

### `ruff/PT025`

`pytest.mark.usefixtures` has no effect on fixtures.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-pytest-style rules (`pytest-erroneous-use-fixtures-on-fixture`).
- **Allowed form:** Request the fixtures as parameters of the fixture; `usefixtures` has no effect on a fixture.
- **Exception:** If this is intended, add `{"rule":"PT025","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/pytest-erroneous-use-fixtures-on-fixture/)

<a id="ruff-pt026"></a>

### `ruff/PT026`

Useless `pytest.mark.usefixtures` without parameters.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-pytest-style rules (`pytest-use-fixtures-without-parameters`).
- **Allowed form:** Name the fixtures: `@pytest.mark.usefixtures("database")`, or remove the mark.
- **Exception:** If this is intended, add `{"rule":"PT026","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/pytest-use-fixtures-without-parameters/)

<a id="ruff-pt028"></a>

### `ruff/PT028`

Test function parameter `{}` has default argument.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-pytest-style rules (`pytest-parameter-with-default-argument`).
- **Allowed form:** Remove the default value from the test parameter; parametrize or a fixture supplies it.
- **Exception:** If this is intended, add `{"rule":"PT028","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/pytest-parameter-with-default-argument/)

<a id="ruff-pt030"></a>

### `ruff/PT030`

`pytest.warns({warning})` is too broad, set the `match` parameter or use a more specific warning.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-pytest-style rules (`pytest-warns-too-broad`).
- **Allowed form:** Match the message: `with pytest.warns(UserWarning, match="deprecated"):`, or name a more specific warning class.
- **Exception:** If this is intended, add `{"rule":"PT030","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/pytest-warns-too-broad/)

<a id="ruff-pt031"></a>

### `ruff/PT031`

`pytest.warns()` block should contain a single simple statement.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-pytest-style rules (`pytest-warns-with-multiple-statements`).
- **Allowed form:** Keep one statement in the `pytest.warns` block, the call that warns; build the arguments before it.
- **Exception:** If this is intended, add `{"rule":"PT031","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/pytest-warns-with-multiple-statements/)

<a id="ruff-pth100"></a>

### `ruff/PTH100`

`os.path.abspath()` should be replaced by `Path.resolve()`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-use-pathlib rules (`os-path-abspath`).
- **Allowed form:** Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.
- **Exception:** If this is intended, add `{"rule":"PTH100","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/os-path-abspath/)

<a id="ruff-pth101"></a>

### `ruff/PTH101`

`os.chmod()` should be replaced by `Path.chmod()`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-use-pathlib rules (`os-chmod`).
- **Allowed form:** Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.
- **Exception:** If this is intended, add `{"rule":"PTH101","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/os-chmod/)

<a id="ruff-pth102"></a>

### `ruff/PTH102`

`os.mkdir()` should be replaced by `Path.mkdir()`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-use-pathlib rules (`os-mkdir`).
- **Allowed form:** Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.
- **Exception:** If this is intended, add `{"rule":"PTH102","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/os-mkdir/)

<a id="ruff-pth103"></a>

### `ruff/PTH103`

`os.makedirs()` should be replaced by `Path.mkdir(parents=True)`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-use-pathlib rules (`os-makedirs`).
- **Allowed form:** Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.
- **Exception:** If this is intended, add `{"rule":"PTH103","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/os-makedirs/)

<a id="ruff-pth104"></a>

### `ruff/PTH104`

`os.rename()` should be replaced by `Path.rename()`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-use-pathlib rules (`os-rename`).
- **Allowed form:** Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.
- **Exception:** If this is intended, add `{"rule":"PTH104","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/os-rename/)

<a id="ruff-pth105"></a>

### `ruff/PTH105`

`os.replace()` should be replaced by `Path.replace()`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-use-pathlib rules (`os-replace`).
- **Allowed form:** Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.
- **Exception:** If this is intended, add `{"rule":"PTH105","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/os-replace/)

<a id="ruff-pth106"></a>

### `ruff/PTH106`

`os.rmdir()` should be replaced by `Path.rmdir()`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-use-pathlib rules (`os-rmdir`).
- **Allowed form:** Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.
- **Exception:** If this is intended, add `{"rule":"PTH106","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/os-rmdir/)

<a id="ruff-pth107"></a>

### `ruff/PTH107`

`os.remove()` should be replaced by `Path.unlink()`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-use-pathlib rules (`os-remove`).
- **Allowed form:** Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.
- **Exception:** If this is intended, add `{"rule":"PTH107","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/os-remove/)

<a id="ruff-pth108"></a>

### `ruff/PTH108`

`os.unlink()` should be replaced by `Path.unlink()`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-use-pathlib rules (`os-unlink`).
- **Allowed form:** Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.
- **Exception:** If this is intended, add `{"rule":"PTH108","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/os-unlink/)

<a id="ruff-pth109"></a>

### `ruff/PTH109`

`os.getcwd()` should be replaced by `Path.cwd()`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-use-pathlib rules (`os-getcwd`).
- **Allowed form:** Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.
- **Exception:** If this is intended, add `{"rule":"PTH109","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/os-getcwd/)

<a id="ruff-pth110"></a>

### `ruff/PTH110`

`os.path.exists()` should be replaced by `Path.exists()`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-use-pathlib rules (`os-path-exists`).
- **Allowed form:** Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.
- **Exception:** If this is intended, add `{"rule":"PTH110","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/os-path-exists/)

<a id="ruff-pth111"></a>

### `ruff/PTH111`

`os.path.expanduser()` should be replaced by `Path.expanduser()`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-use-pathlib rules (`os-path-expanduser`).
- **Allowed form:** Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.
- **Exception:** If this is intended, add `{"rule":"PTH111","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/os-path-expanduser/)

<a id="ruff-pth112"></a>

### `ruff/PTH112`

`os.path.isdir()` should be replaced by `Path.is_dir()`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-use-pathlib rules (`os-path-isdir`).
- **Allowed form:** Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.
- **Exception:** If this is intended, add `{"rule":"PTH112","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/os-path-isdir/)

<a id="ruff-pth113"></a>

### `ruff/PTH113`

`os.path.isfile()` should be replaced by `Path.is_file()`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-use-pathlib rules (`os-path-isfile`).
- **Allowed form:** Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.
- **Exception:** If this is intended, add `{"rule":"PTH113","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/os-path-isfile/)

<a id="ruff-pth114"></a>

### `ruff/PTH114`

`os.path.islink()` should be replaced by `Path.is_symlink()`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-use-pathlib rules (`os-path-islink`).
- **Allowed form:** Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.
- **Exception:** If this is intended, add `{"rule":"PTH114","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/os-path-islink/)

<a id="ruff-pth115"></a>

### `ruff/PTH115`

`os.readlink()` should be replaced by `Path.readlink()`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-use-pathlib rules (`os-readlink`).
- **Allowed form:** Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.
- **Exception:** If this is intended, add `{"rule":"PTH115","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/os-readlink/)

<a id="ruff-pth116"></a>

### `ruff/PTH116`

`os.stat()` should be replaced by `Path.stat()`, `Path.owner()`, or `Path.group()`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-use-pathlib rules (`os-stat`).
- **Allowed form:** Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.
- **Exception:** If this is intended, add `{"rule":"PTH116","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/os-stat/)

<a id="ruff-pth117"></a>

### `ruff/PTH117`

`os.path.isabs()` should be replaced by `Path.is_absolute()`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-use-pathlib rules (`os-path-isabs`).
- **Allowed form:** Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.
- **Exception:** If this is intended, add `{"rule":"PTH117","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/os-path-isabs/)

<a id="ruff-pth118"></a>

### `ruff/PTH118`

`os.{module}.join()` should be replaced by `Path` with `/` operator.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-use-pathlib rules (`os-path-join`).
- **Allowed form:** Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.
- **Exception:** If this is intended, add `{"rule":"PTH118","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/os-path-join/)

<a id="ruff-pth119"></a>

### `ruff/PTH119`

`os.path.basename()` should be replaced by `Path.name`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-use-pathlib rules (`os-path-basename`).
- **Allowed form:** Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.
- **Exception:** If this is intended, add `{"rule":"PTH119","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/os-path-basename/)

<a id="ruff-pth120"></a>

### `ruff/PTH120`

`os.path.dirname()` should be replaced by `Path.parent`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-use-pathlib rules (`os-path-dirname`).
- **Allowed form:** Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.
- **Exception:** If this is intended, add `{"rule":"PTH120","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/os-path-dirname/)

<a id="ruff-pth121"></a>

### `ruff/PTH121`

`os.path.samefile()` should be replaced by `Path.samefile()`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-use-pathlib rules (`os-path-samefile`).
- **Allowed form:** Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.
- **Exception:** If this is intended, add `{"rule":"PTH121","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/os-path-samefile/)

<a id="ruff-pth122"></a>

### `ruff/PTH122`

`os.path.splitext()` should be replaced by `Path.suffix`, `Path.stem`, and `Path.parent`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-use-pathlib rules (`os-path-splitext`).
- **Allowed form:** Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.
- **Exception:** If this is intended, add `{"rule":"PTH122","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/os-path-splitext/)

<a id="ruff-pth123"></a>

### `ruff/PTH123`

`open()` should be replaced by `Path.open()`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-use-pathlib rules (`builtin-open`).
- **Allowed form:** Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.
- **Exception:** If this is intended, add `{"rule":"PTH123","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/builtin-open/)

<a id="ruff-pth124"></a>

### `ruff/PTH124`

`py.path` is in maintenance mode, use `pathlib` instead.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-use-pathlib rules (`py-path`).
- **Allowed form:** Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.
- **Exception:** If this is intended, add `{"rule":"PTH124","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/py-path/)

<a id="ruff-pth201"></a>

### `ruff/PTH201`

Do not pass the current directory explicitly to `Path`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-use-pathlib rules (`path-constructor-current-directory`).
- **Allowed form:** Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.
- **Exception:** If this is intended, add `{"rule":"PTH201","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/path-constructor-current-directory/)

<a id="ruff-pth202"></a>

### `ruff/PTH202`

`os.path.getsize` should be replaced by `Path.stat().st_size`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-use-pathlib rules (`os-path-getsize`).
- **Allowed form:** Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.
- **Exception:** If this is intended, add `{"rule":"PTH202","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/os-path-getsize/)

<a id="ruff-pth203"></a>

### `ruff/PTH203`

`os.path.getatime` should be replaced by `Path.stat().st_atime`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-use-pathlib rules (`os-path-getatime`).
- **Allowed form:** Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.
- **Exception:** If this is intended, add `{"rule":"PTH203","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/os-path-getatime/)

<a id="ruff-pth204"></a>

### `ruff/PTH204`

`os.path.getmtime` should be replaced by `Path.stat().st_mtime`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-use-pathlib rules (`os-path-getmtime`).
- **Allowed form:** Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.
- **Exception:** If this is intended, add `{"rule":"PTH204","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/os-path-getmtime/)

<a id="ruff-pth205"></a>

### `ruff/PTH205`

`os.path.getctime` should be replaced by `Path.stat().st_ctime`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-use-pathlib rules (`os-path-getctime`).
- **Allowed form:** Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.
- **Exception:** If this is intended, add `{"rule":"PTH205","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/os-path-getctime/)

<a id="ruff-pth206"></a>

### `ruff/PTH206`

Replace `.split(os.sep)` with `Path.parts`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-use-pathlib rules (`os-sep-split`).
- **Allowed form:** Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.
- **Exception:** If this is intended, add `{"rule":"PTH206","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/os-sep-split/)

<a id="ruff-pth207"></a>

### `ruff/PTH207`

Replace `{function}` with `Path.glob` or `Path.rglob`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-use-pathlib rules (`glob`).
- **Allowed form:** Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.
- **Exception:** If this is intended, add `{"rule":"PTH207","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/glob/)

<a id="ruff-pth208"></a>

### `ruff/PTH208`

Use `pathlib.Path.iterdir()` instead.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-use-pathlib rules (`os-listdir`).
- **Allowed form:** Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.
- **Exception:** If this is intended, add `{"rule":"PTH208","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/os-listdir/)

<a id="ruff-pth210"></a>

### `ruff/PTH210`

Invalid suffix passed to `.with_suffix()`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-use-pathlib rules (`invalid-pathlib-with-suffix`).
- **Allowed form:** Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.
- **Exception:** If this is intended, add `{"rule":"PTH210","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/invalid-pathlib-with-suffix/)

<a id="ruff-pth211"></a>

### `ruff/PTH211`

`os.symlink` should be replaced by `Path.symlink_to`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-use-pathlib rules (`os-symlink`).
- **Allowed form:** Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.
- **Exception:** If this is intended, add `{"rule":"PTH211","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/os-symlink/)

<a id="ruff-ret501"></a>

### `ruff/RET501`

Do not explicitly `return None` in function if it is the only possible return value.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-return rules (`unnecessary-return-none`).
- **Exception:** If this is intended, add `{"rule":"RET501","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-return-none/)

<a id="ruff-ret502"></a>

### `ruff/RET502`

Do not implicitly `return None` in function able to return non-`None` value.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-return rules (`implicit-return-value`).
- **Exception:** If this is intended, add `{"rule":"RET502","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/implicit-return-value/)

<a id="ruff-ret503"></a>

### `ruff/RET503`

Missing explicit `return` at the end of function able to return non-`None` value.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-return rules (`implicit-return`).
- **Exception:** If this is intended, add `{"rule":"RET503","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/implicit-return/)

<a id="ruff-ret504"></a>

### `ruff/RET504`

Unnecessary assignment to `{name}` before `return` statement.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-return rules (`unnecessary-assign`).
- **Exception:** If this is intended, add `{"rule":"RET504","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-assign/)

<a id="ruff-ret505"></a>

### `ruff/RET505`

Unnecessary `{branch}` after `return` statement.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-return rules (`superfluous-else-return`).
- **Exception:** If this is intended, add `{"rule":"RET505","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/superfluous-else-return/)

<a id="ruff-ret506"></a>

### `ruff/RET506`

Unnecessary `{branch}` after `raise` statement.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-return rules (`superfluous-else-raise`).
- **Exception:** If this is intended, add `{"rule":"RET506","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/superfluous-else-raise/)

<a id="ruff-ret507"></a>

### `ruff/RET507`

Unnecessary `{branch}` after `continue` statement.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-return rules (`superfluous-else-continue`).
- **Exception:** If this is intended, add `{"rule":"RET507","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/superfluous-else-continue/)

<a id="ruff-ret508"></a>

### `ruff/RET508`

Unnecessary `{branch}` after `break` statement.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-return rules (`superfluous-else-break`).
- **Exception:** If this is intended, add `{"rule":"RET508","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/superfluous-else-break/)

<a id="ruff-ruf005"></a>

### `ruff/RUF005`

Consider `{expression}` instead of concatenation.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`collection-literal-concatenation`).
- **Exception:** If this is intended, add `{"rule":"RUF005","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/collection-literal-concatenation/)

<a id="ruff-ruf006"></a>

### `ruff/RUF006`

Store a reference to the return value of `{expr}.{method}`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`asyncio-dangling-task`).
- **Exception:** If this is intended, add `{"rule":"RUF006","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/asyncio-dangling-task/)

<a id="ruff-ruf007"></a>

### `ruff/RUF007`

Prefer `itertools.pairwise()` over `zip()` when iterating over successive pairs.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`zip-instead-of-pairwise`).
- **Exception:** If this is intended, add `{"rule":"RUF007","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/zip-instead-of-pairwise/)

<a id="ruff-ruf008"></a>

### `ruff/RUF008`

Do not use mutable default values for dataclass attributes.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`mutable-dataclass-default`).
- **Exception:** If this is intended, add `{"rule":"RUF008","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/mutable-dataclass-default/)

<a id="ruff-ruf009"></a>

### `ruff/RUF009`

Do not perform function call `{name}` in dataclass defaults.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`function-call-in-dataclass-default-argument`).
- **Exception:** If this is intended, add `{"rule":"RUF009","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/function-call-in-dataclass-default-argument/)

<a id="ruff-ruf010"></a>

### `ruff/RUF010`

Use explicit conversion flag.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`explicit-f-string-type-conversion`).
- **Exception:** If this is intended, add `{"rule":"RUF010","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/explicit-f-string-type-conversion/)

<a id="ruff-ruf013"></a>

### `ruff/RUF013`

PEP 484 prohibits implicit `Optional`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`implicit-optional`).
- **Exception:** If this is intended, add `{"rule":"RUF013","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/implicit-optional/)

<a id="ruff-ruf015"></a>

### `ruff/RUF015`

Prefer `next({iterable})` over single element slice.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`unnecessary-iterable-allocation-for-first-element`).
- **Exception:** If this is intended, add `{"rule":"RUF015","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-iterable-allocation-for-first-element/)

<a id="ruff-ruf016"></a>

### `ruff/RUF016`

Slice in indexed access to type `{value_type}` uses type `{index_type}` instead of an integer.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`invalid-index-type`).
- **Exception:** If this is intended, add `{"rule":"RUF016","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/invalid-index-type/)

<a id="ruff-ruf017"></a>

### `ruff/RUF017`

Avoid quadratic list summation.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`quadratic-list-summation`).
- **Exception:** If this is intended, add `{"rule":"RUF017","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/quadratic-list-summation/)

<a id="ruff-ruf018"></a>

### `ruff/RUF018`

Avoid assignment expressions in `assert` statements.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`assignment-in-assert`).
- **Exception:** If this is intended, add `{"rule":"RUF018","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/assignment-in-assert/)

<a id="ruff-ruf019"></a>

### `ruff/RUF019`

Unnecessary key check before dictionary access.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`unnecessary-key-check`).
- **Exception:** If this is intended, add `{"rule":"RUF019","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-key-check/)

<a id="ruff-ruf020"></a>

### `ruff/RUF020`

`{never_like} | T` is equivalent to `T`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`never-union`).
- **Exception:** If this is intended, add `{"rule":"RUF020","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/never-union/)

<a id="ruff-ruf021"></a>

### `ruff/RUF021`

Parenthesize `a and b` expressions when chaining `and` and `or` together, to make the precedence clear.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`parenthesize-chained-operators`).
- **Exception:** If this is intended, add `{"rule":"RUF021","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/parenthesize-chained-operators/)

<a id="ruff-ruf022"></a>

### `ruff/RUF022`

`__all__` is not sorted.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`unsorted-dunder-all`).
- **Exception:** If this is intended, add `{"rule":"RUF022","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unsorted-dunder-all/)

<a id="ruff-ruf023"></a>

### `ruff/RUF023`

`{}.__slots__` is not sorted.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`unsorted-dunder-slots`).
- **Exception:** If this is intended, add `{"rule":"RUF023","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unsorted-dunder-slots/)

<a id="ruff-ruf024"></a>

### `ruff/RUF024`

Do not pass mutable objects as values to `dict.fromkeys`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`mutable-fromkeys-value`).
- **Exception:** If this is intended, add `{"rule":"RUF024","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/mutable-fromkeys-value/)

<a id="ruff-ruf026"></a>

### `ruff/RUF026`

`default_factory` is a positional-only argument to `defaultdict`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`default-factory-kwarg`).
- **Exception:** If this is intended, add `{"rule":"RUF026","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/default-factory-kwarg/)

<a id="ruff-ruf028"></a>

### `ruff/RUF028`

This suppression comment is invalid because {}.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`invalid-formatter-suppression-comment`).
- **Exception:** If this is intended, add `{"rule":"RUF028","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/invalid-formatter-suppression-comment/)

<a id="ruff-ruf030"></a>

### `ruff/RUF030`

`print()` call in `assert` statement is likely unintentional.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`assert-with-print-message`).
- **Exception:** If this is intended, add `{"rule":"RUF030","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/assert-with-print-message/)

<a id="ruff-ruf032"></a>

### `ruff/RUF032`

`Decimal()` called with float literal argument.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`decimal-from-float-literal`).
- **Exception:** If this is intended, add `{"rule":"RUF032","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/decimal-from-float-literal/)

<a id="ruff-ruf033"></a>

### `ruff/RUF033`

`__post_init__` method with argument defaults.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`post-init-default`).
- **Exception:** If this is intended, add `{"rule":"RUF033","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/post-init-default/)

<a id="ruff-ruf034"></a>

### `ruff/RUF034`

Useless `if`-`else` condition.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`useless-if-else`).
- **Exception:** If this is intended, add `{"rule":"RUF034","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/useless-if-else/)

<a id="ruff-ruf036"></a>

### `ruff/RUF036`

`None` not at the end of the type union.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`none-not-at-end-of-union`).
- **Exception:** If this is intended, add `{"rule":"RUF036","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/none-not-at-end-of-union/)

<a id="ruff-ruf037"></a>

### `ruff/RUF037`

Unnecessary empty iterable within a deque call.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`unnecessary-empty-iterable-within-deque-call`).
- **Exception:** If this is intended, add `{"rule":"RUF037","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-empty-iterable-within-deque-call/)

<a id="ruff-ruf040"></a>

### `ruff/RUF040`

Non-string literal used as assert message.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`invalid-assert-message-literal-argument`).
- **Exception:** If this is intended, add `{"rule":"RUF040","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/invalid-assert-message-literal-argument/)

<a id="ruff-ruf041"></a>

### `ruff/RUF041`

Unnecessary nested `Literal`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`unnecessary-nested-literal`).
- **Exception:** If this is intended, add `{"rule":"RUF041","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-nested-literal/)

<a id="ruff-ruf043"></a>

### `ruff/RUF043`

Pattern passed to `match=` contains metacharacters but is neither escaped nor raw.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`pytest-raises-ambiguous-pattern`).
- **Exception:** If this is intended, add `{"rule":"RUF043","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/pytest-raises-ambiguous-pattern/)

<a id="ruff-ruf046"></a>

### `ruff/RUF046`

Value being cast to `int` is already an integer.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`unnecessary-cast-to-int`).
- **Exception:** If this is intended, add `{"rule":"RUF046","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-cast-to-int/)

<a id="ruff-ruf048"></a>

### `ruff/RUF048`

`__version__` may contain non-integral-like elements.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`map-int-version-parsing`).
- **Exception:** If this is intended, add `{"rule":"RUF048","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/map-int-version-parsing/)

<a id="ruff-ruf049"></a>

### `ruff/RUF049`

An enum class should not be decorated with `@dataclass`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`dataclass-enum`).
- **Exception:** If this is intended, add `{"rule":"RUF049","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/dataclass-enum/)

<a id="ruff-ruf051"></a>

### `ruff/RUF051`

Use `pop` instead of `key in dict` followed by `del dict[key]`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`if-key-in-dict-del`).
- **Exception:** If this is intended, add `{"rule":"RUF051","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/if-key-in-dict-del/)

<a id="ruff-ruf053"></a>

### `ruff/RUF053`

Class with type parameter list inherits from `Generic`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`class-with-mixed-type-vars`).
- **Exception:** If this is intended, add `{"rule":"RUF053","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/class-with-mixed-type-vars/)

<a id="ruff-ruf057"></a>

### `ruff/RUF057`

Value being rounded is already an integer.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`unnecessary-round`).
- **Exception:** If this is intended, add `{"rule":"RUF057","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-round/)

<a id="ruff-ruf058"></a>

### `ruff/RUF058`

`itertools.starmap` called on `zip` iterable.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`starmap-zip`).
- **Exception:** If this is intended, add `{"rule":"RUF058","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/starmap-zip/)

<a id="ruff-ruf059"></a>

### `ruff/RUF059`

Unpacked variable `{name}` is never used.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`unused-unpacked-variable`).
- **Exception:** If this is intended, add `{"rule":"RUF059","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unused-unpacked-variable/)

<a id="ruff-ruf060"></a>

### `ruff/RUF060`

Unnecessary membership test on empty collection.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`in-empty-collection`).
- **Exception:** If this is intended, add `{"rule":"RUF060","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/in-empty-collection/)

<a id="ruff-ruf061"></a>

### `ruff/RUF061`

Use context-manager form of `pytest.{}()`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`legacy-form-pytest-raises`).
- **Exception:** If this is intended, add `{"rule":"RUF061","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/legacy-form-pytest-raises/)

<a id="ruff-ruf063"></a>

### `ruff/RUF063`

Use `{suggestion}` instead of `__dict__` access.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`access-annotations-from-class-dict`).
- **Exception:** If this is intended, add `{"rule":"RUF063","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/access-annotations-from-class-dict/)

<a id="ruff-ruf064"></a>

### `ruff/RUF064`

Non-octal mode.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`non-octal-permissions`).
- **Exception:** If this is intended, add `{"rule":"RUF064","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/non-octal-permissions/)

<a id="ruff-ruf068"></a>

### `ruff/RUF068`

`__all__` contains duplicate entries.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`duplicate-entry-in-dunder-all`).
- **Exception:** If this is intended, add `{"rule":"RUF068","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/duplicate-entry-in-dunder-all/)

<a id="ruff-ruf071"></a>

### `ruff/RUF071`

`os.path.commonprefix()` compares strings character-by-character.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`os-path-commonprefix`).
- **Exception:** If this is intended, add `{"rule":"RUF071","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/os-path-commonprefix/)

<a id="ruff-ruf101"></a>

### `ruff/RUF101`

`{original}` is a redirect to `{target}`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`redirected-noqa`).
- **Exception:** If this is intended, add `{"rule":"RUF101","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/redirected-noqa/)

<a id="ruff-ruf102"></a>

### `ruff/RUF102`

Invalid rule code in {}: {}.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`invalid-rule-code`).
- **Exception:** If this is intended, add `{"rule":"RUF102","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/invalid-rule-code/)

<a id="ruff-ruf103"></a>

### `ruff/RUF103`

Invalid suppression comment: {msg}.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`invalid-suppression-comment`).
- **Exception:** If this is intended, add `{"rule":"RUF103","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/invalid-suppression-comment/)

<a id="ruff-ruf104"></a>

### `ruff/RUF104`

Suppression comment without matching `#ruff:enable` comment.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`unmatched-suppression-comment`).
- **Exception:** If this is intended, add `{"rule":"RUF104","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unmatched-suppression-comment/)

<a id="ruff-ruf200"></a>

### `ruff/RUF200`

Failed to parse pyproject.toml: {message}.

- **Why it is on:** Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`invalid-pyproject-toml`).
- **Exception:** If this is intended, add `{"rule":"RUF200","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/invalid-pyproject-toml/)

<a id="ruff-s102"></a>

### `ruff/S102`

Use of `exec` detected.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bandit rules (`exec-builtin`).
- **Allowed form:** Parse literals with `ast.literal_eval(text)` and call code by name, `getattr(module, name)()`; do not run strings as code.
- **Exception:** If this is intended, add `{"rule":"S102","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/exec-builtin/)

<a id="ruff-s108"></a>

### `ruff/S108`

Probable insecure usage of temporary file or directory: "{}".

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bandit rules (`hardcoded-temp-file`).
- **Allowed form:** Create temporary files with `tempfile.NamedTemporaryFile`, `tempfile.mkstemp` or `tempfile.TemporaryDirectory`, not a fixed path.
- **Exception:** If this is intended, add `{"rule":"S108","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/hardcoded-temp-file/)

<a id="ruff-s113"></a>

### `ruff/S113`

Probable use of `{module}` call without timeout.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bandit rules (`request-without-timeout`).
- **Allowed form:** Pass a timeout in seconds: `requests.get(url, timeout=10)`; an `httpx` call or client keeps its 5 second default unless you pass another number, never `timeout=None`.
- **Exception:** If this is intended, add `{"rule":"S113","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/request-without-timeout/)

<a id="ruff-s201"></a>

### `ruff/S201`

Use of `debug=True` in Flask app detected.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bandit rules (`flask-debug-true`).
- **Allowed form:** Leave `debug` off in code and start the debugger through configuration: `flask --debug run`.
- **Exception:** If this is intended, add `{"rule":"S201","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/flask-debug-true/)

<a id="ruff-s202"></a>

### `ruff/S202`

Uses of `tarfile.extractall()`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bandit rules (`tarfile-unsafe-members`).
- **Allowed form:** Extract with a filter: `tar.extractall(path, filter="data")`.
- **Exception:** If this is intended, add `{"rule":"S202","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/tarfile-unsafe-members/)

<a id="ruff-s301"></a>

### `ruff/S301`

`pickle` and modules that wrap it can be unsafe when used to deserialize untrusted data, possible security issue.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bandit rules (`suspicious-pickle-usage`).
- **Allowed form:** Exchange data in a format that cannot run code, such as JSON: `json.loads(text)`, and validate it at the boundary; copy an object with `copy.deepcopy(value)`, not a pickle round trip.
- **Exception:** If this is intended, add `{"rule":"S301","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/suspicious-pickle-usage/)

<a id="ruff-s302"></a>

### `ruff/S302`

Deserialization with the `marshal` module is possibly dangerous.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bandit rules (`suspicious-marshal-usage`).
- **Allowed form:** Exchange data in a format that cannot run code, such as JSON: `json.loads(text)`, and validate it at the boundary; copy an object with `copy.deepcopy(value)`, not a pickle round trip.
- **Exception:** If this is intended, add `{"rule":"S302","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/suspicious-marshal-usage/)

<a id="ruff-s303"></a>

### `ruff/S303`

Use of insecure MD2, MD4, MD5, or SHA1 hash function.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bandit rules (`suspicious-insecure-hash-usage`).
- **Allowed form:** Hash with `hashlib.sha256(...)` or stronger; a digest that is no security measure (a cache key, a checksum) passes `usedforsecurity=False`; sign with `hmac.new(key, message, hashlib.sha256)`.
- **Exception:** If this is intended, add `{"rule":"S303","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/suspicious-insecure-hash-usage/)

<a id="ruff-s304"></a>

### `ruff/S304`

Use of insecure cipher, replace with a known secure cipher such as AES.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bandit rules (`suspicious-insecure-cipher-usage`).
- **Allowed form:** Encrypt with an authenticated mode from `cryptography`: `AESGCM(key)` or `ChaCha20Poly1305(key)`.
- **Exception:** If this is intended, add `{"rule":"S304","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/suspicious-insecure-cipher-usage/)

<a id="ruff-s305"></a>

### `ruff/S305`

Use of insecure block cipher mode, replace with a known secure mode such as CBC or CTR.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bandit rules (`suspicious-insecure-cipher-mode-usage`).
- **Allowed form:** Encrypt with an authenticated mode from `cryptography`: `AESGCM(key)` or `ChaCha20Poly1305(key)`.
- **Exception:** If this is intended, add `{"rule":"S305","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/suspicious-insecure-cipher-mode-usage/)

<a id="ruff-s306"></a>

### `ruff/S306`

Use of insecure and deprecated function (`mktemp`).

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bandit rules (`suspicious-mktemp-usage`).
- **Allowed form:** Create temporary files with `tempfile.NamedTemporaryFile`, `tempfile.mkstemp` or `tempfile.TemporaryDirectory`, not a fixed path.
- **Exception:** If this is intended, add `{"rule":"S306","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/suspicious-mktemp-usage/)

<a id="ruff-s307"></a>

### `ruff/S307`

Use of possibly insecure function; consider using `ast.literal_eval`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bandit rules (`suspicious-eval-usage`).
- **Allowed form:** Parse literals with `ast.literal_eval(text)` and call code by name, `getattr(module, name)()`; do not run strings as code.
- **Exception:** If this is intended, add `{"rule":"S307","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/suspicious-eval-usage/)

<a id="ruff-s308"></a>

### `ruff/S308`

Use of `mark_safe` may expose cross-site scripting vulnerabilities.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bandit rules (`suspicious-mark-safe-usage`).
- **Allowed form:** Escape the value: `django.utils.html.format_html("<b>{}</b>", value)` or `markupsafe.escape(value)`; mark only literals as safe.
- **Exception:** If this is intended, add `{"rule":"S308","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/suspicious-mark-safe-usage/)

<a id="ruff-s312"></a>

### `ruff/S312`

Telnet is considered insecure. Use SSH or some other encrypted protocol.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bandit rules (`suspicious-telnet-usage`).
- **Allowed form:** Use SSH or SFTP (`paramiko`), or HTTPS, which encrypt the connection.
- **Exception:** If this is intended, add `{"rule":"S312","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/suspicious-telnet-usage/)

<a id="ruff-s313"></a>

### `ruff/S313`

Using `xml` to parse untrusted data is known to be vulnerable to XML attacks; use `defusedxml` equivalents.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bandit rules (`suspicious-xmlc-element-tree-usage`).
- **Allowed form:** Parse untrusted XML with `defusedxml` (`from defusedxml import ElementTree`); add `defusedxml` and `types-defusedxml` to the dependencies.
- **Exception:** If this is intended, add `{"rule":"S313","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/suspicious-xmlc-element-tree-usage/)

<a id="ruff-s314"></a>

### `ruff/S314`

Using `xml` to parse untrusted data is known to be vulnerable to XML attacks; use `defusedxml` equivalents.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bandit rules (`suspicious-xml-element-tree-usage`).
- **Allowed form:** Parse untrusted XML with `defusedxml` (`from defusedxml import ElementTree`); add `defusedxml` and `types-defusedxml` to the dependencies.
- **Exception:** If this is intended, add `{"rule":"S314","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/suspicious-xml-element-tree-usage/)

<a id="ruff-s315"></a>

### `ruff/S315`

Using `xml` to parse untrusted data is known to be vulnerable to XML attacks; use `defusedxml` equivalents.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bandit rules (`suspicious-xml-expat-reader-usage`).
- **Allowed form:** Parse untrusted XML with `defusedxml` (`from defusedxml import ElementTree`); add `defusedxml` and `types-defusedxml` to the dependencies.
- **Exception:** If this is intended, add `{"rule":"S315","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/suspicious-xml-expat-reader-usage/)

<a id="ruff-s316"></a>

### `ruff/S316`

Using `xml` to parse untrusted data is known to be vulnerable to XML attacks; use `defusedxml` equivalents.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bandit rules (`suspicious-xml-expat-builder-usage`).
- **Allowed form:** Parse untrusted XML with `defusedxml` (`from defusedxml import ElementTree`); add `defusedxml` and `types-defusedxml` to the dependencies.
- **Exception:** If this is intended, add `{"rule":"S316","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/suspicious-xml-expat-builder-usage/)

<a id="ruff-s317"></a>

### `ruff/S317`

Using `xml` to parse untrusted data is known to be vulnerable to XML attacks; use `defusedxml` equivalents.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bandit rules (`suspicious-xml-sax-usage`).
- **Allowed form:** Parse untrusted XML with `defusedxml` (`from defusedxml import ElementTree`); add `defusedxml` and `types-defusedxml` to the dependencies.
- **Exception:** If this is intended, add `{"rule":"S317","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/suspicious-xml-sax-usage/)

<a id="ruff-s318"></a>

### `ruff/S318`

Using `xml` to parse untrusted data is known to be vulnerable to XML attacks; use `defusedxml` equivalents.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bandit rules (`suspicious-xml-mini-dom-usage`).
- **Allowed form:** Parse untrusted XML with `defusedxml` (`from defusedxml import ElementTree`); add `defusedxml` and `types-defusedxml` to the dependencies.
- **Exception:** If this is intended, add `{"rule":"S318","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/suspicious-xml-mini-dom-usage/)

<a id="ruff-s319"></a>

### `ruff/S319`

Using `xml` to parse untrusted data is known to be vulnerable to XML attacks; use `defusedxml` equivalents.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bandit rules (`suspicious-xml-pull-dom-usage`).
- **Allowed form:** Parse untrusted XML with `defusedxml` (`from defusedxml import ElementTree`); add `defusedxml` and `types-defusedxml` to the dependencies.
- **Exception:** If this is intended, add `{"rule":"S319","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/suspicious-xml-pull-dom-usage/)

<a id="ruff-s321"></a>

### `ruff/S321`

FTP-related functions are being called. FTP is considered insecure. Use SSH/SFTP/SCP or some other encrypted protocol.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bandit rules (`suspicious-ftp-lib-usage`).
- **Allowed form:** Use SSH or SFTP (`paramiko`), or HTTPS, which encrypt the connection.
- **Exception:** If this is intended, add `{"rule":"S321","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/suspicious-ftp-lib-usage/)

<a id="ruff-s323"></a>

### `ruff/S323`

Python allows using an insecure context via the `_create_unverified_context` that reverts to the previous behavior that does not validate certificates or perform hostname checks.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bandit rules (`suspicious-unverified-context-usage`).
- **Allowed form:** Use `ssl.create_default_context()` and keep its certificate and hostname checks and its TLS version defaults.
- **Exception:** If this is intended, add `{"rule":"S323","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/suspicious-unverified-context-usage/)

<a id="ruff-s324"></a>

### `ruff/S324`

Probable use of insecure hash functions in `{library}`: `{string}`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bandit rules (`hashlib-insecure-hash-function`).
- **Allowed form:** Hash with `hashlib.sha256(...)` or stronger; a digest that is no security measure (a cache key, a checksum) passes `usedforsecurity=False`; sign with `hmac.new(key, message, hashlib.sha256)`.
- **Exception:** If this is intended, add `{"rule":"S324","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/hashlib-insecure-hash-function/)

<a id="ruff-s501"></a>

### `ruff/S501`

Probable use of `{string}` call with `verify=False` disabling SSL certificate checks.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bandit rules (`request-with-no-cert-validation`).
- **Allowed form:** Keep certificate verification on, the default; for a private CA pass its bundle: `requests.get(url, verify="/path/ca.pem", timeout=10)`.
- **Exception:** If this is intended, add `{"rule":"S501","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/request-with-no-cert-validation/)

<a id="ruff-s502"></a>

### `ruff/S502`

Call made with insecure SSL protocol: `{protocol}`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bandit rules (`ssl-insecure-version`).
- **Allowed form:** Use `ssl.create_default_context()` and keep its certificate and hostname checks and its TLS version defaults.
- **Exception:** If this is intended, add `{"rule":"S502","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/ssl-insecure-version/)

<a id="ruff-s503"></a>

### `ruff/S503`

Argument default set to insecure SSL protocol: `{protocol}`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bandit rules (`ssl-with-bad-defaults`).
- **Allowed form:** Use `ssl.create_default_context()` and keep its certificate and hostname checks and its TLS version defaults.
- **Exception:** If this is intended, add `{"rule":"S503","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/ssl-with-bad-defaults/)

<a id="ruff-s504"></a>

### `ruff/S504`

`ssl.wrap_socket` called without an `ssl_version``.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bandit rules (`ssl-with-no-version`).
- **Allowed form:** Use `ssl.create_default_context()` and keep its certificate and hostname checks and its TLS version defaults.
- **Exception:** If this is intended, add `{"rule":"S504","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/ssl-with-no-version/)

<a id="ruff-s505"></a>

### `ruff/S505`

{cryptographic_key} key sizes below {minimum_key_size} bits are considered breakable.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bandit rules (`weak-cryptographic-key`).
- **Allowed form:** Use keys of at least 2048 bits for RSA and DSA: `rsa.generate_private_key(65537, 3072)`.
- **Exception:** If this is intended, add `{"rule":"S505","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/weak-cryptographic-key/)

<a id="ruff-s506"></a>

### `ruff/S506`

Probable use of unsafe loader `{name}` with `yaml.load`. Allows instantiation of arbitrary objects. Consider `yaml.safe_load`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bandit rules (`unsafe-yaml-load`).
- **Allowed form:** Load YAML with `yaml.safe_load(text)`, or `yaml.load(text, Loader=yaml.SafeLoader)` with `SafeLoader` or a subclass of it.
- **Exception:** If this is intended, add `{"rule":"S506","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unsafe-yaml-load/)

<a id="ruff-s507"></a>

### `ruff/S507`

Paramiko call with policy set to automatically trust the unknown host key.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bandit rules (`ssh-no-host-key-verification`).
- **Allowed form:** Verify the host key: `client.load_system_host_keys()` and `client.set_missing_host_key_policy(paramiko.RejectPolicy())`.
- **Exception:** If this is intended, add `{"rule":"S507","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/ssh-no-host-key-verification/)

<a id="ruff-s508"></a>

### `ruff/S508`

The use of SNMPv1 and SNMPv2 is insecure. Use SNMPv3 if able.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bandit rules (`snmp-insecure-version`).
- **Allowed form:** Use SNMPv3 with authentication and privacy: `UsmUserData(user, authKey, privKey)`.
- **Exception:** If this is intended, add `{"rule":"S508","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/snmp-insecure-version/)

<a id="ruff-s509"></a>

### `ruff/S509`

You should not use SNMPv3 without encryption. `noAuthNoPriv` & `authNoPriv` is insecure.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bandit rules (`snmp-weak-cryptography`).
- **Allowed form:** Use SNMPv3 with authentication and privacy: `UsmUserData(user, authKey, privKey)`.
- **Exception:** If this is intended, add `{"rule":"S509","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/snmp-weak-cryptography/)

<a id="ruff-s602"></a>

### `ruff/S602`

`subprocess` call with `shell=True` seems safe, but may be changed in the future; consider rewriting without `shell`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bandit rules (`subprocess-popen-with-shell-equals-true`).
- **Allowed form:** Pass the command as a list and leave `shell=True` out: `subprocess.run(["git", "status"], check=True)`.
- **Exception:** If this is intended, add `{"rule":"S602","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/subprocess-popen-with-shell-equals-true/)

<a id="ruff-s604"></a>

### `ruff/S604`

Function call with `shell=True` parameter identified, security issue.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bandit rules (`call-with-shell-equals-true`).
- **Allowed form:** Pass the command as a list and leave `shell=True` out: `subprocess.run(["git", "status"], check=True)`.
- **Exception:** If this is intended, add `{"rule":"S604","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/call-with-shell-equals-true/)

<a id="ruff-s605"></a>

### `ruff/S605`

Starting a process with a shell: seems safe, but may be changed in the future; consider rewriting without `shell`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bandit rules (`start-process-with-a-shell`).
- **Allowed form:** Pass the command as a list and leave `shell=True` out: `subprocess.run(["git", "status"], check=True)`.
- **Exception:** If this is intended, add `{"rule":"S605","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/start-process-with-a-shell/)

<a id="ruff-s609"></a>

### `ruff/S609`

Possible wildcard injection in call due to `*` usage.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bandit rules (`unix-command-wildcard-injection`).
- **Allowed form:** Expand the files in Python, `sorted(Path(directory).glob("*.log"))`, and pass them as separate list items.
- **Exception:** If this is intended, add `{"rule":"S609","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unix-command-wildcard-injection/)

<a id="ruff-s610"></a>

### `ruff/S610`

Use of Django `extra` can lead to SQL injection vulnerabilities.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bandit rules (`django-extra`).
- **Allowed form:** Use the ORM query API, or pass the values as parameters: `Model.objects.raw("SELECT ... WHERE id = %s", [value])`.
- **Exception:** If this is intended, add `{"rule":"S610","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/django-extra/)

<a id="ruff-s611"></a>

### `ruff/S611`

Use of `RawSQL` can lead to SQL injection vulnerabilities.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bandit rules (`django-raw-sql`).
- **Allowed form:** Use the ORM query API, or pass the values as parameters: `Model.objects.raw("SELECT ... WHERE id = %s", [value])`.
- **Exception:** If this is intended, add `{"rule":"S611","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/django-raw-sql/)

<a id="ruff-s612"></a>

### `ruff/S612`

Use of insecure `logging.config.listen` detected.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bandit rules (`logging-config-insecure-listen`).
- **Allowed form:** Configure logging with `logging.config.dictConfig(...)` and do not open the `listen` socket.
- **Exception:** If this is intended, add `{"rule":"S612","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/logging-config-insecure-listen/)

<a id="ruff-s701"></a>

### `ruff/S701`

Using jinja2 templates with `autoescape=False` is dangerous and can lead to XSS. Ensure `autoescape=True` or use the `select_autoescape` function.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bandit rules (`jinja2-autoescape-false`).
- **Allowed form:** Render with Jinja2 and escape by default: `jinja2.Environment(autoescape=jinja2.select_autoescape())`.
- **Exception:** If this is intended, add `{"rule":"S701","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/jinja2-autoescape-false/)

<a id="ruff-s702"></a>

### `ruff/S702`

Mako templates allow HTML and JavaScript rendering by default and are inherently open to XSS attacks.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bandit rules (`mako-templates`).
- **Allowed form:** Render with Jinja2 and escape by default: `jinja2.Environment(autoescape=jinja2.select_autoescape())`.
- **Exception:** If this is intended, add `{"rule":"S702","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/mako-templates/)

<a id="ruff-s704"></a>

### `ruff/S704`

Unsafe use of `{name}` detected.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-bandit rules (`unsafe-markup-use`).
- **Allowed form:** Escape the value: `django.utils.html.format_html("<b>{}</b>", value)` or `markupsafe.escape(value)`; mark only literals as safe.
- **Exception:** If this is intended, add `{"rule":"S704","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unsafe-markup-use/)

<a id="ruff-sim101"></a>

### `ruff/SIM101`

Multiple `isinstance` calls for `{name}`, merge into a single call.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-simplify rules (`duplicate-isinstance-call`).
- **Exception:** If this is intended, add `{"rule":"SIM101","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/duplicate-isinstance-call/)

<a id="ruff-sim102"></a>

### `ruff/SIM102`

Use a single `if` statement instead of nested `if` statements.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-simplify rules (`collapsible-if`).
- **Exception:** If this is intended, add `{"rule":"SIM102","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/collapsible-if/)

<a id="ruff-sim103"></a>

### `ruff/SIM103`

Return the condition `{condition}` directly.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-simplify rules (`needless-bool`).
- **Exception:** If this is intended, add `{"rule":"SIM103","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/needless-bool/)

<a id="ruff-sim107"></a>

### `ruff/SIM107`

Don't use `return` in `try`-`except` and `finally`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-simplify rules (`return-in-try-except-finally`).
- **Exception:** If this is intended, add `{"rule":"SIM107","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/return-in-try-except-finally/)

<a id="ruff-sim108"></a>

### `ruff/SIM108`

Use ternary operator `{contents}` instead of `if`-`else`-block.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-simplify rules (`if-else-block-instead-of-if-exp`).
- **Exception:** If this is intended, add `{"rule":"SIM108","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/if-else-block-instead-of-if-exp/)

<a id="ruff-sim109"></a>

### `ruff/SIM109`

Use `{replacement}` instead of multiple equality comparisons.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-simplify rules (`compare-with-tuple`).
- **Exception:** If this is intended, add `{"rule":"SIM109","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/compare-with-tuple/)

<a id="ruff-sim110"></a>

### `ruff/SIM110`

Use `{replacement}` instead of `for` loop.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-simplify rules (`reimplemented-builtin`).
- **Exception:** If this is intended, add `{"rule":"SIM110","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/reimplemented-builtin/)

<a id="ruff-sim112"></a>

### `ruff/SIM112`

Use capitalized environment variable `{expected}` instead of `{actual}`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-simplify rules (`uncapitalized-environment-variables`).
- **Exception:** If this is intended, add `{"rule":"SIM112","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/uncapitalized-environment-variables/)

<a id="ruff-sim113"></a>

### `ruff/SIM113`

Use `enumerate()` for index variable `{index}` in `for` loop.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-simplify rules (`enumerate-for-loop`).
- **Exception:** If this is intended, add `{"rule":"SIM113","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/enumerate-for-loop/)

<a id="ruff-sim114"></a>

### `ruff/SIM114`

Combine `if` branches using logical `or` operator.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-simplify rules (`if-with-same-arms`).
- **Exception:** If this is intended, add `{"rule":"SIM114","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/if-with-same-arms/)

<a id="ruff-sim115"></a>

### `ruff/SIM115`

Use a context manager for opening files.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-simplify rules (`open-file-with-context-handler`).
- **Exception:** If this is intended, add `{"rule":"SIM115","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/open-file-with-context-handler/)

<a id="ruff-sim116"></a>

### `ruff/SIM116`

Use a dictionary instead of consecutive `if` statements.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-simplify rules (`if-else-block-instead-of-dict-lookup`).
- **Exception:** If this is intended, add `{"rule":"SIM116","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/if-else-block-instead-of-dict-lookup/)

<a id="ruff-sim117"></a>

### `ruff/SIM117`

Use a single `with` statement with multiple contexts instead of nested `with` statements.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-simplify rules (`multiple-with-statements`).
- **Exception:** If this is intended, add `{"rule":"SIM117","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/multiple-with-statements/)

<a id="ruff-sim118"></a>

### `ruff/SIM118`

Use `key {operator} dict` instead of `key {operator} dict.keys()`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-simplify rules (`in-dict-keys`).
- **Exception:** If this is intended, add `{"rule":"SIM118","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/in-dict-keys/)

<a id="ruff-sim201"></a>

### `ruff/SIM201`

Use `{left} != {right}` instead of `not {left} == {right}`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-simplify rules (`negate-equal-op`).
- **Exception:** If this is intended, add `{"rule":"SIM201","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/negate-equal-op/)

<a id="ruff-sim202"></a>

### `ruff/SIM202`

Use `{left} == {right}` instead of `not {left} != {right}`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-simplify rules (`negate-not-equal-op`).
- **Exception:** If this is intended, add `{"rule":"SIM202","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/negate-not-equal-op/)

<a id="ruff-sim208"></a>

### `ruff/SIM208`

Use `{expr}` instead of `not (not {expr})`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-simplify rules (`double-negation`).
- **Exception:** If this is intended, add `{"rule":"SIM208","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/double-negation/)

<a id="ruff-sim210"></a>

### `ruff/SIM210`

Remove unnecessary `True if ... else False`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-simplify rules (`if-expr-with-true-false`).
- **Exception:** If this is intended, add `{"rule":"SIM210","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/if-expr-with-true-false/)

<a id="ruff-sim211"></a>

### `ruff/SIM211`

Use `not ...` instead of `False if ... else True`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-simplify rules (`if-expr-with-false-true`).
- **Exception:** If this is intended, add `{"rule":"SIM211","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/if-expr-with-false-true/)

<a id="ruff-sim212"></a>

### `ruff/SIM212`

Use `{expr_else} if {expr_else} else {expr_body}` instead of `{expr_body} if not {expr_else} else {expr_else}`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-simplify rules (`if-expr-with-twisted-arms`).
- **Exception:** If this is intended, add `{"rule":"SIM212","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/if-expr-with-twisted-arms/)

<a id="ruff-sim220"></a>

### `ruff/SIM220`

Use `False` instead of `{name} and not {name}`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-simplify rules (`expr-and-not-expr`).
- **Exception:** If this is intended, add `{"rule":"SIM220","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/expr-and-not-expr/)

<a id="ruff-sim221"></a>

### `ruff/SIM221`

Use `True` instead of `{name} or not {name}`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-simplify rules (`expr-or-not-expr`).
- **Exception:** If this is intended, add `{"rule":"SIM221","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/expr-or-not-expr/)

<a id="ruff-sim222"></a>

### `ruff/SIM222`

Use `{expr}` instead of `{replaced}`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-simplify rules (`expr-or-true`).
- **Exception:** If this is intended, add `{"rule":"SIM222","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/expr-or-true/)

<a id="ruff-sim223"></a>

### `ruff/SIM223`

Use `{expr}` instead of `{replaced}`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-simplify rules (`expr-and-false`).
- **Exception:** If this is intended, add `{"rule":"SIM223","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/expr-and-false/)

<a id="ruff-sim300"></a>

### `ruff/SIM300`

Yoda condition detected.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-simplify rules (`yoda-conditions`).
- **Exception:** If this is intended, add `{"rule":"SIM300","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/yoda-conditions/)

<a id="ruff-sim401"></a>

### `ruff/SIM401`

Use `{contents}` instead of an `if` block.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-simplify rules (`if-else-block-instead-of-dict-get`).
- **Exception:** If this is intended, add `{"rule":"SIM401","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/if-else-block-instead-of-dict-get/)

<a id="ruff-sim905"></a>

### `ruff/SIM905`

Consider using a list literal instead of `str.{}`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-simplify rules (`split-static-string`).
- **Exception:** If this is intended, add `{"rule":"SIM905","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/split-static-string/)

<a id="ruff-sim910"></a>

### `ruff/SIM910`

Use `{expected}` instead of `{actual}`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-simplify rules (`dict-get-with-none-default`).
- **Exception:** If this is intended, add `{"rule":"SIM910","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/dict-get-with-none-default/)

<a id="ruff-sim911"></a>

### `ruff/SIM911`

Use `{expected}` instead of `{actual}`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-simplify rules (`zip-dict-keys-and-values`).
- **Exception:** If this is intended, add `{"rule":"SIM911","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/zip-dict-keys-and-values/)

<a id="ruff-t201"></a>

### `ruff/T201`

`print` found.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-print rules (`print`).
- **Allowed form:** Use `logging`: `logger = logging.getLogger(__name__)`, then `logger.info(...)`.
- **Exception:** If this is intended, add `{"rule":"T201","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/print/)

<a id="ruff-t203"></a>

### `ruff/T203`

`pprint` found.

- **Why it is on:** Selected in the ruff config of the Python preset, with the flake8-print rules (`p-print`).
- **Allowed form:** Use `logging`: `logger = logging.getLogger(__name__)`, then `logger.info(...)`.
- **Exception:** If this is intended, add `{"rule":"T203","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/p-print/)

<a id="ruff-try002"></a>

### `ruff/TRY002`

Create your own exception.

- **Why it is on:** Selected in the ruff config of the Python preset, with the tryceratops rules (`raise-vanilla-class`).
- **Allowed form:** Raise a specific exception: a built-in such as `ValueError`, or a subclass named for the failure (`class OrderNotFoundError(Exception)`).
- **Exception:** If this is intended, add `{"rule":"TRY002","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/raise-vanilla-class/)

<a id="ruff-try004"></a>

### `ruff/TRY004`

Prefer `TypeError` exception for invalid type.

- **Why it is on:** Selected in the ruff config of the Python preset, with the tryceratops rules (`type-check-without-type-error`).
- **Allowed form:** Raise `TypeError` when the check is about the type of a value.
- **Exception:** If this is intended, add `{"rule":"TRY004","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/type-check-without-type-error/)

<a id="ruff-try201"></a>

### `ruff/TRY201`

Use `raise` without specifying exception name.

- **Why it is on:** Selected in the ruff config of the Python preset, with the tryceratops rules (`verbose-raise`).
- **Allowed form:** Re-raise with a bare `raise`, which keeps the traceback.
- **Exception:** If this is intended, add `{"rule":"TRY201","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/verbose-raise/)

<a id="ruff-try203"></a>

### `ruff/TRY203`

Remove exception handler; error is immediately re-raised.

- **Why it is on:** Selected in the ruff config of the Python preset, with the tryceratops rules (`useless-try-except`).
- **Allowed form:** Remove the `try`; a handler that only re-raises changes nothing.
- **Exception:** If this is intended, add `{"rule":"TRY203","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/useless-try-except/)

<a id="ruff-try400"></a>

### `ruff/TRY400`

Use `logging.exception` instead of `logging.error`.

- **Why it is on:** Selected in the ruff config of the Python preset, with the tryceratops rules (`error-instead-of-exception`).
- **Allowed form:** Inside an `except` block call `logger.exception(...)`, which logs the traceback, or `logger.warning(...)` for an error the code expects and handles.
- **Exception:** If this is intended, add `{"rule":"TRY400","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/error-instead-of-exception/)

<a id="ruff-try401"></a>

### `ruff/TRY401`

Redundant exception object included in `logging.exception` call.

- **Why it is on:** Selected in the ruff config of the Python preset, with the tryceratops rules (`verbose-log-message`).
- **Allowed form:** Leave the exception out of the message; `logger.exception("Could not load %s", name)` already logs it.
- **Exception:** If this is intended, add `{"rule":"TRY401","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/verbose-log-message/)

<a id="ruff-up031"></a>

### `ruff/UP031`

Use format specifiers instead of percent format.

- **Why it is on:** Selected in the ruff config of the Python preset, with the pyupgrade rules (`printf-string-formatting`).
- **Allowed form:** Use an f-string: `f"Hello, {name}"`.
- **Exception:** If this is intended, add `{"rule":"UP031","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/printf-string-formatting/)

<a id="ruff-up032"></a>

### `ruff/UP032`

Use f-string instead of `format` call.

- **Why it is on:** Selected in the ruff config of the Python preset, with the pyupgrade rules (`f-string`).
- **Allowed form:** Use an f-string: `f"Hello, {name}"`.
- **Exception:** If this is intended, add `{"rule":"UP032","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/f-string/)
