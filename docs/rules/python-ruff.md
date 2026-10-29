# Python: ruff rules

The ruff rules in nitpicker's own ruff config, by rule code. This page lists 364 rules. [All pages](README.md).

The guide for these rules: [docs/python-preset.md](../python-preset.md).

The descriptions and examples are from the documentation of ruff 0.16.8, under the MIT License.

Unless an entry says otherwise:

- **Presets:** Python
- **Analyzers:** `python`

<a id="ruff-arg001"></a>

### `ruff/ARG001`

Checks for the presence of unused arguments in function definitions.

- **Why it is on:** An argument that is defined but not used is likely a mistake, and should be removed to avoid confusion. If a variable is intentionally defined-but-not-used, it should be prefixed with an underscore, or some other value that adheres to the `lint.dummy-variable-rgx` pattern. Selected in the ruff config of the Python preset, with the flake8-unused-arguments rules (`unused-function-argument`).
- **Allowed form:** Remove the unused argument and update the callers. One that a signature requires (a callback, a hook) starts with an underscore, `_context`; a method that overrides a base class takes `@typing.override` (`typing_extensions.override` before Python 3.12) instead; a parameter that a framework passes by keyword keeps its name, and that path gets an exception.
- **Example of the allowed form:**

  ```python
  def foo(bar):
      return bar * 2
  ```

- **Exception:** If this is intended, add `{"rule":"ARG001","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unused-function-argument/)

<a id="ruff-arg002"></a>

### `ruff/ARG002`

Checks for the presence of unused arguments in instance method definitions.

- **Why it is on:** An argument that is defined but not used is likely a mistake, and should be removed to avoid confusion. If a variable is intentionally defined-but-not-used, it should be prefixed with an underscore, or some other value that adheres to the `lint.dummy-variable-rgx` pattern. Selected in the ruff config of the Python preset, with the flake8-unused-arguments rules (`unused-method-argument`).
- **Allowed form:** Remove the unused argument and update the callers. One that a signature requires (a callback, a hook) starts with an underscore, `_context`; a method that overrides a base class takes `@typing.override` (`typing_extensions.override` before Python 3.12) instead; a parameter that a framework passes by keyword keeps its name, and that path gets an exception.
- **Example of the allowed form:**

  ```python
  class Class:
      def foo(self, arg1):
          print(arg1)
  ```

- **Exception:** If this is intended, add `{"rule":"ARG002","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unused-method-argument/)

<a id="ruff-arg003"></a>

### `ruff/ARG003`

Checks for the presence of unused arguments in class method definitions.

- **Why it is on:** An argument that is defined but not used is likely a mistake, and should be removed to avoid confusion. If a variable is intentionally defined-but-not-used, it should be prefixed with an underscore, or some other value that adheres to the `lint.dummy-variable-rgx` pattern. Selected in the ruff config of the Python preset, with the flake8-unused-arguments rules (`unused-class-method-argument`).
- **Allowed form:** Remove the unused argument and update the callers. One that a signature requires (a callback, a hook) starts with an underscore, `_context`; a method that overrides a base class takes `@typing.override` (`typing_extensions.override` before Python 3.12) instead; a parameter that a framework passes by keyword keeps its name, and that path gets an exception.
- **Example of the allowed form:**

  ```python
  class Class:
      @classmethod
      def foo(cls, arg1):
          print(arg1)
  ```

- **Exception:** If this is intended, add `{"rule":"ARG003","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unused-class-method-argument/)

<a id="ruff-arg004"></a>

### `ruff/ARG004`

Checks for the presence of unused arguments in static method definitions.

- **Why it is on:** An argument that is defined but not used is likely a mistake, and should be removed to avoid confusion. If a variable is intentionally defined-but-not-used, it should be prefixed with an underscore, or some other value that adheres to the `lint.dummy-variable-rgx` pattern. Selected in the ruff config of the Python preset, with the flake8-unused-arguments rules (`unused-static-method-argument`).
- **Allowed form:** Remove the unused argument and update the callers. One that a signature requires (a callback, a hook) starts with an underscore, `_context`; a method that overrides a base class takes `@typing.override` (`typing_extensions.override` before Python 3.12) instead; a parameter that a framework passes by keyword keeps its name, and that path gets an exception.
- **Example of the allowed form:**

  ```python
  class Class:
      @staticmethod
      def foo(arg1):
          print(arg1)
  ```

- **Exception:** If this is intended, add `{"rule":"ARG004","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unused-static-method-argument/)

<a id="ruff-arg005"></a>

### `ruff/ARG005`

Checks for the presence of unused arguments in lambda expression definitions.

- **Why it is on:** An argument that is defined but not used is likely a mistake, and should be removed to avoid confusion. If a variable is intentionally defined-but-not-used, it should be prefixed with an underscore, or some other value that adheres to the `lint.dummy-variable-rgx` pattern. Selected in the ruff config of the Python preset, with the flake8-unused-arguments rules (`unused-lambda-argument`).
- **Allowed form:** Remove the unused argument and update the callers. One that a signature requires (a callback, a hook) starts with an underscore, `_context`; a method that overrides a base class takes `@typing.override` (`typing_extensions.override` before Python 3.12) instead; a parameter that a framework passes by keyword keeps its name, and that path gets an exception.
- **Example of the allowed form:**

  ```python
  my_list = [1, 2, 3, 4, 5]
  squares = map(lambda x: x**2, my_list)
  ```

- **Exception:** If this is intended, add `{"rule":"ARG005","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unused-lambda-argument/)

<a id="ruff-b002"></a>

### `ruff/B002`

Checks for the attempted use of the unary prefix increment (`++`) or decrement operator (`--`).

- **Why it is on:** Python does not support the unary prefix increment or decrement operator. Writing `++n` is equivalent to `+(+(n))` and writing `--n` is equivalent to `-(-(n))`. In both cases, it is equivalent to `n`. Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`unary-prefix-increment-decrement`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unary-prefix-increment-decrement/).
- **Example of the allowed form:**

  ```python
  x += 1
  y -= 1
  ```

- **Exception:** If this is intended, add `{"rule":"B002","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unary-prefix-increment-decrement/)

<a id="ruff-b003"></a>

### `ruff/B003`

Checks for assignments to `os.environ`.

- **Why it is on:** In Python, `os.environ` is a mapping that represents the environment of the current process. However, reassigning to `os.environ` does not clear the environment. Instead, it merely updates the `os.environ` for the current process. This can lead to unexpected behavior, especially when running the program in a subprocess. Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`assignment-to-os-environ`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/assignment-to-os-environ/).
- **Example of the allowed form:**

  ```python
  import os

  os.environ.clear()
  os.environ["foo"] = "bar"
  ```

- **Exception:** If this is intended, add `{"rule":"B003","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/assignment-to-os-environ/)

<a id="ruff-b004"></a>

### `ruff/B004`

Checks for uses of `hasattr` to test if an object is callable (e.g., `hasattr(obj, "__call__")`).

- **Why it is on:** Using `hasattr` is an unreliable mechanism for testing if an object is callable. If `obj` implements a custom `__getattr__`, or if its `__call__` is itself not callable, you may get misleading results. Instead, use `callable(obj)` to test if `obj` is callable. Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`unreliable-callable-check`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unreliable-callable-check/).
- **Example of the allowed form:**

  ```python
  callable(obj)
  ```

- **Exception:** If this is intended, add `{"rule":"B004","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unreliable-callable-check/)

<a id="ruff-b005"></a>

### `ruff/B005`

Checks for uses of multi-character strings in `.strip()`, `.lstrip()`, and `.rstrip()` calls.

- **Why it is on:** All characters in the call to `.strip()`, `.lstrip()`, or `.rstrip()` are removed from the leading and trailing ends of the string. If the string contains multiple characters, the reader may be misled into thinking that a prefix or suffix is being removed, rather than a set of characters. In Python 3.9 and later, you can use `str.removeprefix` and `str.removesuffix` to remove an exact prefix or suffix from a string, respectively, which should be preferred when possible. Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`strip-with-multi-characters`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/strip-with-multi-characters/).
- **Example of the allowed form:**

  ```python
  "text.txt".removesuffix(".txt")  # "text"
  ```

- **Exception:** If this is intended, add `{"rule":"B005","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/strip-with-multi-characters/)

<a id="ruff-b006"></a>

### `ruff/B006`

Checks for uses of mutable objects as function argument defaults.

- **Why it is on:** Function defaults are evaluated once, when the function is defined. The same mutable object is then shared across all calls to the function. If the object is modified, those modifications will persist across calls, which can lead to unexpected behavior. Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`mutable-argument-default`).
- **Allowed form:** Default to `None` and create the value inside the function, or use an immutable default such as a tuple.
- **Example of the allowed form:**

  ```python
  def add_to_list(item, some_list=None):
      if some_list is None:
          some_list = []
      some_list.append(item)
      return some_list


  l1 = add_to_list(0)  # [0]
  l2 = add_to_list(1)  # [1]
  ```

- **Exception:** If this is intended, add `{"rule":"B006","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/mutable-argument-default/)

<a id="ruff-b007"></a>

### `ruff/B007`

Checks for unused variables in loops (e.g., `for` and `while` statements).

- **Why it is on:** Defining a variable in a loop statement that is never used can confuse readers. If the variable is intended to be unused (e.g., to facilitate destructuring of a tuple or other object), prefix it with an underscore to indicate the intent. Otherwise, remove the variable entirely. Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`unused-loop-control-variable`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unused-loop-control-variable/).
- **Example of the allowed form:**

  ```python
  for i, _j in foo:
      bar(i)
  ```

- **Exception:** If this is intended, add `{"rule":"B007","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unused-loop-control-variable/)

<a id="ruff-b009"></a>

### `ruff/B009`

Checks for uses of `getattr` that take a constant attribute value as an argument (e.g., `getattr(obj, "foo")`).

- **Why it is on:** `getattr` is used to access attributes dynamically. If the attribute is defined as a constant, it is no safer than a typical property access. When possible, prefer property access over `getattr` calls, as the former is more concise and idiomatic. Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`get-attr-with-constant`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/get-attr-with-constant/).
- **Example of the allowed form:**

  ```python
  obj.foo
  ```

- **Exception:** If this is intended, add `{"rule":"B009","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/get-attr-with-constant/)

<a id="ruff-b010"></a>

### `ruff/B010`

Checks for uses of `setattr` that take a constant attribute value as an argument (e.g., `setattr(obj, "foo", 42)`).

- **Why it is on:** `setattr` is used to set attributes dynamically. If the attribute is defined as a constant, it is no safer than a typical property access. When possible, prefer property access over `setattr` calls, as the former is more concise and idiomatic. Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`set-attr-with-constant`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/set-attr-with-constant/).
- **Example of the allowed form:**

  ```python
  obj.foo = 42
  ```

- **Exception:** If this is intended, add `{"rule":"B010","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/set-attr-with-constant/)

<a id="ruff-b011"></a>

### `ruff/B011`

Checks for uses of `assert False`.

- **Why it is on:** Python removes `assert` statements when running in optimized mode (`python -O`), making `assert False` an unreliable means of raising an `AssertionError`. Instead, raise an `AssertionError` directly. Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`assert-false`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/assert-false/).
- **Example of the allowed form:**

  ```python
  raise AssertionError
  ```

- **Exception:** If this is intended, add `{"rule":"B011","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/assert-false/)

<a id="ruff-b012"></a>

### `ruff/B012`

Checks for `break`, `continue`, and `return` statements in `finally` blocks.

- **Why it is on:** The use of `break`, `continue`, and `return` statements in `finally` blocks can cause exceptions to be silenced. `finally` blocks execute regardless of whether an exception is raised. If a `break`, `continue`, or `return` statement is reached in a `finally` block, any exception raised in the `try` or `except` blocks will be silenced. Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`jump-statement-in-finally`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/jump-statement-in-finally/).
- **Example of the allowed form:**

  ```python
  def speed(distance, time):
      try:
          return distance / time
      except ZeroDivisionError:
          raise ValueError("Time cannot be zero")
  ```

- **Exception:** If this is intended, add `{"rule":"B012","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/jump-statement-in-finally/)

<a id="ruff-b013"></a>

### `ruff/B013`

Checks for single-element tuples in exception handlers (e.g., `except (ValueError,):`).

- **Why it is on:** A tuple with a single element can be more concisely and idiomatically expressed as a single value. Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`redundant-tuple-in-exception-handler`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/redundant-tuple-in-exception-handler/).
- **Example of the allowed form:**

  ```python
  try:
      ...
  except ValueError:
      ...
  ```

- **Exception:** If this is intended, add `{"rule":"B013","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/redundant-tuple-in-exception-handler/)

<a id="ruff-b014"></a>

### `ruff/B014`

Checks for exception handlers that catch duplicate exceptions.

- **Why it is on:** Including the same exception multiple times in the same handler is redundant, as the first exception will catch the exception, making the second exception unreachable. The same applies to exception hierarchies, as a handler for a parent exception (like `Exception`) will also catch child exceptions (like `ValueError`). Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`duplicate-handler-exception`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/duplicate-handler-exception/).
- **Example of the allowed form:**

  ```python
  try:
      ...
  except Exception:
      ...
  ```

- **Exception:** If this is intended, add `{"rule":"B014","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/duplicate-handler-exception/)

<a id="ruff-b015"></a>

### `ruff/B015`

Checks for useless comparisons.

- **Why it is on:** Useless comparisons have no effect on the program, and are often included by mistake. If the comparison is intended to enforce an invariant, prepend the comparison with an `assert`. Otherwise, remove it entirely. Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`useless-comparison`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/useless-comparison/).
- **Example of the allowed form:**

  ```python
  assert foo == bar, "`foo` and `bar` should be equal."
  ```

- **Exception:** If this is intended, add `{"rule":"B015","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/useless-comparison/)

<a id="ruff-b016"></a>

### `ruff/B016`

Checks for `raise` statements that raise a literal value.

- **Why it is on:** `raise` must be followed by an exception instance or an exception class, and exceptions must be instances of `BaseException` or a subclass thereof. Raising a literal will raise a `TypeError` at runtime. Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`raise-literal`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/raise-literal/).
- **Example of the allowed form:**

  ```python
  raise Exception("foo")
  ```

- **Exception:** If this is intended, add `{"rule":"B016","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/raise-literal/)

<a id="ruff-b017"></a>

### `ruff/B017`

Checks for `assertRaises` and `pytest.raises` context managers that catch `Exception` or `BaseException`.

- **Why it is on:** These forms catch every `Exception`, which can lead to tests passing even if, e.g., the code under consideration raises a `SyntaxError` or `IndentationError`. Either assert for a more specific exception (builtin or custom), or use `assertRaisesRegex` or `pytest.raises(..., match=<REGEX>)` respectively. Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`assert-raises-exception`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/assert-raises-exception/).
- **Example of the allowed form:**

  ```python
  self.assertRaises(SomeSpecificException, foo)
  ```

- **Exception:** If this is intended, add `{"rule":"B017","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/assert-raises-exception/)

<a id="ruff-b018"></a>

### `ruff/B018`

Checks for useless expressions.

- **Why it is on:** Useless expressions have no effect on the program, and are often included by mistake. Assign a useless expression to a variable, or remove it entirely. Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`useless-expression`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/useless-expression/).
- **Example of the allowed form:**

  ```python
  foo = 1 + 1
  ```

- **Exception:** If this is intended, add `{"rule":"B018","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/useless-expression/)

<a id="ruff-b019"></a>

### `ruff/B019`

Checks for uses of the `functools.lru_cache` and `functools.cache` decorators on methods.

- **Why it is on:** Using the `functools.lru_cache` and `functools.cache` decorators on methods can lead to memory leaks, as the global cache will retain a reference to the instance, preventing it from being garbage collected. Instead, refactor the method to depend only on its arguments and not on the instance of the class, or use the `@lru_cache` decorator on a function outside of the class. Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`cached-instance-method`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/cached-instance-method/).
- **Example of the allowed form:**

  ```python
  from functools import lru_cache


  @lru_cache
  def square(x: int) -> int:
      return x * x


  class Number:
      value: int

      def squared(self):
          return square(self.value)
  ```

- **Exception:** If this is intended, add `{"rule":"B019","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/cached-instance-method/)

<a id="ruff-b020"></a>

### `ruff/B020`

Checks for loop control variables that override the loop iterable.

- **Why it is on:** Loop control variables should not override the loop iterable, as this can lead to confusing behavior. Instead, use a distinct variable name for any loop control variables. Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`loop-variable-overrides-iterator`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/loop-variable-overrides-iterator/).
- **Example of the allowed form:**

  ```python
  items = [1, 2, 3]

  for item in items:
      print(item)
  ```

- **Exception:** If this is intended, add `{"rule":"B020","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/loop-variable-overrides-iterator/)

<a id="ruff-b021"></a>

### `ruff/B021`

Checks for docstrings that are written via f-strings.

- **Why it is on:** Python will interpret the f-string as a joined string, rather than as a docstring. As such, the "docstring" will not be accessible via the `__doc__` attribute, nor will it be picked up by any automated documentation tooling. Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`f-string-docstring`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/f-string-docstring/).
- **Example of the allowed form:**

  ```python
  def foo():
      """A docstring."""
  ```

- **Exception:** If this is intended, add `{"rule":"B021","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/f-string-docstring/)

<a id="ruff-b022"></a>

### `ruff/B022`

Checks for `contextlib.suppress` without arguments.

- **Why it is on:** `contextlib.suppress` is a context manager that suppresses exceptions. It takes, as arguments, the exceptions to suppress within the enclosed block. If no exceptions are specified, then the context manager won't suppress any exceptions, and is thus redundant. Consider adding exceptions to the `contextlib.suppress` call, or removing the context manager entirely. Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`useless-contextlib-suppress`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/useless-contextlib-suppress/).
- **Example of the allowed form:**

  ```python
  import contextlib

  with contextlib.suppress(Exception):
      foo()
  ```

- **Exception:** If this is intended, add `{"rule":"B022","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/useless-contextlib-suppress/)

<a id="ruff-b023"></a>

### `ruff/B023`

Checks for function definitions that use a loop variable.

- **Why it is on:** The loop variable is not bound in the function definition, so it will always have the value it had in the last iteration when the function is called. Instead, consider using a default argument to bind the loop variable at function definition time. Or, use `functools.partial`. Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`function-uses-loop-variable`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/function-uses-loop-variable/).
- **Example of the allowed form:**

  ```python
  adders = [lambda x, i=i: x + i for i in range(3)]
  values = [adder(1) for adder in adders]  # [1, 2, 3]
  ```

- **Exception:** If this is intended, add `{"rule":"B023","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/function-uses-loop-variable/)

<a id="ruff-b024"></a>

### `ruff/B024`

Checks for abstract classes without abstract methods or properties. Annotated but unassigned class variables are regarded as abstract.

- **Why it is on:** Abstract base classes are used to define interfaces. If an abstract base class has no abstract methods or properties, you may have forgotten to add an abstract method or property to the class, or omitted an `@abstractmethod` decorator. If the class is not meant to be used as an interface, consider removing the `ABC` base class from the class definition. Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`abstract-base-class-without-abstract-method`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/abstract-base-class-without-abstract-method/).
- **Example of the allowed form:**

  ```python
  from abc import ABC, abstractmethod
  from typing import ClassVar


  class Foo(ABC):
      class_var: ClassVar[str]  # unassigned

      @abstractmethod
      def method(self):
          bar()
  ```

- **Exception:** If this is intended, add `{"rule":"B024","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/abstract-base-class-without-abstract-method/)

<a id="ruff-b025"></a>

### `ruff/B025`

Checks for `try-except` blocks with duplicate exception handlers.

- **Why it is on:** Duplicate exception handlers are redundant, as the first handler will catch the exception, making the second handler unreachable. Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`duplicate-try-block-exception`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/duplicate-try-block-exception/).
- **Example of the allowed form:**

  ```python
  try:
      ...
  except ValueError:
      ...
  ```

- **Exception:** If this is intended, add `{"rule":"B025","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/duplicate-try-block-exception/)

<a id="ruff-b026"></a>

### `ruff/B026`

Checks for function calls that use star-argument unpacking after providing a keyword argument.

- **Why it is on:** In Python, you can use star-argument unpacking to pass a list or tuple of arguments to a function. Providing a star-argument after a keyword argument can lead to confusing behavior, and is only supported for backwards compatibility. Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`star-arg-unpacking-after-keyword-arg`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/star-arg-unpacking-after-keyword-arg/).
- **Example of the allowed form:**

  ```python
  def foo(x, y, z):
      return x, y, z


  foo(1, 2, 3)  # (1, 2, 3)
  foo(x=1, y=2, z=3)  # (1, 2, 3)
  foo(*[1, 2, 3])  # (1, 2, 3)
  foo(*[1, 2], 3)  # (1, 2, 3)
  ```

- **Exception:** If this is intended, add `{"rule":"B026","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/star-arg-unpacking-after-keyword-arg/)

<a id="ruff-b027"></a>

### `ruff/B027`

Checks for empty methods in abstract base classes without an abstract decorator.

- **Why it is on:** Empty methods in abstract base classes without an abstract decorator may be be indicative of a mistake. If the method is meant to be abstract, add an `@abstractmethod` decorator to the method. Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`empty-method-without-abstract-decorator`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/empty-method-without-abstract-decorator/).
- **Example of the allowed form:**

  ```python
  from abc import ABC, abstractmethod


  class Foo(ABC):
      @abstractmethod
      def method(self): ...
  ```

- **Exception:** If this is intended, add `{"rule":"B027","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/empty-method-without-abstract-decorator/)

<a id="ruff-b028"></a>

### `ruff/B028`

Checks for `warnings.warn` calls without an explicit `stacklevel` keyword argument.

- **Why it is on:** The `warnings.warn` method uses a `stacklevel` of 1 by default, which will output a stack frame of the line on which the "warn" method is called. Setting it to a higher number will output a stack frame from higher up the stack. It's recommended to use a `stacklevel` of 2 or higher, to give the caller more context about the warning. Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`no-explicit-stacklevel`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/no-explicit-stacklevel/).
- **Example of the allowed form:**

  ```python
  import warnings

  warnings.warn("This is a warning", stacklevel=2)
  ```

- **Exception:** If this is intended, add `{"rule":"B028","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/no-explicit-stacklevel/)

<a id="ruff-b029"></a>

### `ruff/B029`

Checks for exception handlers that catch an empty tuple.

- **Why it is on:** An exception handler that catches an empty tuple will not catch anything, and is indicative of a mistake. Instead, add exceptions to the `except` clause. Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`except-with-empty-tuple`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/except-with-empty-tuple/).
- **Example of the allowed form:**

  ```python
  try:
      1 / 0
  except ZeroDivisionError:
      ...
  ```

- **Exception:** If this is intended, add `{"rule":"B029","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/except-with-empty-tuple/)

<a id="ruff-b030"></a>

### `ruff/B030`

Checks for exception handlers that catch non-exception classes.

- **Why it is on:** Catching classes that do not inherit from `BaseException` will raise a `TypeError`. Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`except-with-non-exception-classes`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/except-with-non-exception-classes/).
- **Example of the allowed form:**

  ```python
  try:
      1 / 0
  except ZeroDivisionError:
      ...
  ```

- **Exception:** If this is intended, add `{"rule":"B030","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/except-with-non-exception-classes/)

<a id="ruff-b031"></a>

### `ruff/B031`

Checks for multiple usage of the generator returned from `itertools.groupby()`.

- **Why it is on:** Using the generator more than once will do nothing on the second usage. If that data is needed later, it should be stored as a list. Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`reuse-of-groupby-generator`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/reuse-of-groupby-generator/).
- **Example of the allowed form:**

  ```python
  import itertools

  for name, group in itertools.groupby(data):
      values = list(group)
      for _ in range(5):
          do_something_with_the_group(values)
  ```

- **Exception:** If this is intended, add `{"rule":"B031","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/reuse-of-groupby-generator/)

<a id="ruff-b032"></a>

### `ruff/B032`

Checks for the unintentional use of type annotations.

- **Why it is on:** The use of a colon (`:`) in lieu of an assignment (`=`) can be syntactically valid, but is almost certainly a mistake when used in a subscript or attribute assignment. Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`unintentional-type-annotation`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unintentional-type-annotation/).
- **Example of the allowed form:**

  ```python
  a["b"] = 1
  ```

- **Exception:** If this is intended, add `{"rule":"B032","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unintentional-type-annotation/)

<a id="ruff-b033"></a>

### `ruff/B033`

Checks for set literals that contain duplicate items.

- **Why it is on:** In Python, sets are unordered collections of unique elements. Including a duplicate item in a set literal is redundant, as the duplicate item will be replaced with a single item at runtime. Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`duplicate-value`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/duplicate-value/).
- **Example of the allowed form:**

  ```python
  {1, 2, 3}
  ```

- **Exception:** If this is intended, add `{"rule":"B033","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/duplicate-value/)

<a id="ruff-b034"></a>

### `ruff/B034`

Checks for calls to `re.sub`, `re.subn`, and `re.split` that pass `count`, `maxsplit`, or `flags` as positional arguments.

- **Why it is on:** Passing `count`, `maxsplit`, or `flags` as positional arguments to `re.sub`, `re.subn`, or `re.split` can lead to confusion, as most methods in the `re` module accept `flags` as the third positional argument, while `re.sub`, `re.subn`, and `re.split` have different signatures. Instead, pass `count`, `maxsplit`, and `flags` as keyword arguments. Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`re-sub-positional-args`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/re-sub-positional-args/).
- **Example of the allowed form:**

  ```python
  import re

  re.split("pattern", "replacement", maxsplit=1)
  ```

- **Exception:** If this is intended, add `{"rule":"B034","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/re-sub-positional-args/)

<a id="ruff-b035"></a>

### `ruff/B035`

Checks for dictionary comprehensions that use a static key, like a string literal or a variable defined outside the comprehension.

- **Why it is on:** Using a static key (like a string literal) in a dictionary comprehension is usually a mistake, as it will result in a dictionary with only one key, despite the comprehension iterating over multiple values. Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`static-key-dict-comprehension`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/static-key-dict-comprehension/).
- **Example of the allowed form:**

  ```python
  data = ["some", "Data"]
  {value: value.upper() for value in data}
  ```

- **Exception:** If this is intended, add `{"rule":"B035","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/static-key-dict-comprehension/)

<a id="ruff-b039"></a>

### `ruff/B039`

Checks for uses of mutable objects as `ContextVar` defaults.

- **Why it is on:** The `ContextVar` default is evaluated once, when the `ContextVar` is defined. The same mutable object is then shared across all `.get()` method calls to the `ContextVar`. If the object is modified, those modifications will persist across calls, which can lead to unexpected behavior. Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`mutable-contextvar-default`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/mutable-contextvar-default/).
- **Example of the allowed form:**

  ```python
  from contextvars import ContextVar


  cv: ContextVar[list | None] = ContextVar("cv", default=None)

  ...

  if cv.get() is None:
      cv.set([])
  ```

- **Exception:** If this is intended, add `{"rule":"B039","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/mutable-contextvar-default/)

<a id="ruff-b904"></a>

### `ruff/B904`

Checks for `raise` statements in exception handlers that lack a `from` clause.

- **Why it is on:** In Python, `raise` can be used with or without an exception from which the current exception is derived. This is known as exception chaining. When printing the stack trace, chained exceptions are displayed in such a way so as make it easier to trace the exception back to its root cause. When raising a new exception from within an `except` clause, it's recommended to include a `from` clause to explicitly set the exception's cause. Without it, Python will implicitly chain from the current exception (setting `__context__`), but the `__cause__` attribute won't be set, which may make debugging slightly more difficult. Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`raise-without-from-inside-except`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/raise-without-from-inside-except/).
- **Example of the allowed form:**

  ```python
  try:
      ...
  except FileNotFoundError as exc:
      if ...:
          raise RuntimeError("...") from None
      else:
          raise UserWarning("...") from exc
  ```

- **Exception:** If this is intended, add `{"rule":"B904","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/raise-without-from-inside-except/)

<a id="ruff-b905"></a>

### `ruff/B905`

Checks for `zip` calls without an explicit `strict` parameter when called with two or more iterables, or any starred argument.

- **Why it is on:** By default, if the iterables passed to `zip` are of different lengths, the resulting iterator will be silently truncated to the length of the shortest iterable. This can lead to subtle bugs. Pass `strict=True` to raise a `ValueError` if the iterables are of non-uniform length. Alternatively, if the iterables are deliberately of different lengths, pass `strict=False` to make the intention explicit. Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`zip-without-explicit-strict`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/zip-without-explicit-strict/).
- **Example of the allowed form:**

  ```python
  zip(a, b, strict=True)
  ```

- **Exception:** If this is intended, add `{"rule":"B905","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/zip-without-explicit-strict/)

<a id="ruff-b911"></a>

### `ruff/B911`

Checks for `itertools.batched` calls without an explicit `strict` parameter.

- **Why it is on:** By default, if the length of the iterable is not divisible by the second argument to `itertools.batched`, the last batch will be shorter than the rest. In Python 3.13, a `strict` parameter was added which allows controlling if the batches must be of uniform length. Pass `strict=True` to raise a `ValueError` if the batches are of non-uniform length. Otherwise, pass `strict=False` to make the intention explicit. Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`batched-without-explicit-strict`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/batched-without-explicit-strict/).
- **Exception:** If this is intended, add `{"rule":"B911","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/batched-without-explicit-strict/)

<a id="ruff-b912"></a>

### `ruff/B912`

Checks for `map` calls without an explicit `strict` parameter when called with two or more iterables, or any starred argument.

- **Why it is on:** By default, if the iterables passed to `map` are of different lengths, the resulting iterator will be silently truncated to the length of the shortest iterable. This can lead to subtle bugs. Pass `strict=True` to raise a `ValueError` if the iterables are of non-uniform length. Alternatively, if the iterables are deliberately of different lengths, pass `strict=False` to make the intention explicit. Selected in the ruff config of the Python preset, with the flake8-bugbear rules (`map-without-explicit-strict`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/map-without-explicit-strict/).
- **Example of the allowed form:**

  ```python
  map(f, a, b, strict=True)
  ```

- **Exception:** If this is intended, add `{"rule":"B912","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/map-without-explicit-strict/)

<a id="ruff-ble001"></a>

### `ruff/BLE001`

Checks for `except` clauses that catch all exceptions. This includes `except BaseException` and `except Exception`.

- **Why it is on:** Overly broad `except` clauses can lead to unexpected behavior, such as catching `KeyboardInterrupt` or `SystemExit` exceptions that prevent the user from exiting the program. Instead of catching all exceptions, catch only those that are expected to be raised in the `try` block. Selected in the ruff config of the Python preset, with the flake8-blind-except rules (`blind-except`).
- **Allowed form:** Catch the specific exception and handle it, or re-raise it with its cause (`raise DomainError(...) from error`); `contextlib.suppress(SpecificError)` ignores one expected error. In a test, use `pytest.raises(SpecificError)` (`self.assertRaises` in unittest).
- **Example of the allowed form:**

  ```python
  try:
      foo()
  except FileNotFoundError:
      ...
  ```

- **Exception:** If this is intended, add `{"rule":"BLE001","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/blind-except/)

<a id="ruff-c400"></a>

### `ruff/C400`

Checks for unnecessary generators that can be rewritten as list comprehensions (or with `list()` directly).

- **Why it is on:** It is unnecessary to use `list()` around a generator expression, since there are equivalent comprehensions for these types. Using a comprehension is clearer and more idiomatic. Further, if the comprehension can be removed entirely, as in the case of `list(x for x in foo)`, it's better to use `list(foo)` directly, since it's even more direct. Selected in the ruff config of the Python preset, with the flake8-comprehensions rules (`unnecessary-generator-list`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-generator-list/).
- **Example of the allowed form:**

  ```python
  [f(x) for x in foo]
  list(foo)
  list(foo)
  ```

- **Exception:** If this is intended, add `{"rule":"C400","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-generator-list/)

<a id="ruff-c401"></a>

### `ruff/C401`

Checks for unnecessary generators that can be rewritten as set comprehensions (or with `set()` directly).

- **Why it is on:** It is unnecessary to use `set` around a generator expression, since there are equivalent comprehensions for these types. Using a comprehension is clearer and more idiomatic. Further, if the comprehension can be removed entirely, as in the case of `set(x for x in foo)`, it's better to use `set(foo)` directly, since it's even more direct. Selected in the ruff config of the Python preset, with the flake8-comprehensions rules (`unnecessary-generator-set`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-generator-set/).
- **Example of the allowed form:**

  ```python
  {f(x) for x in foo}
  set(foo)
  set(foo)
  ```

- **Exception:** If this is intended, add `{"rule":"C401","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-generator-set/)

<a id="ruff-c402"></a>

### `ruff/C402`

Checks for unnecessary generators that can be rewritten as dict comprehensions.

- **Why it is on:** It is unnecessary to use `dict()` around a generator expression, since there are equivalent comprehensions for these types. Using a comprehension is clearer and more idiomatic. Selected in the ruff config of the Python preset, with the flake8-comprehensions rules (`unnecessary-generator-dict`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-generator-dict/).
- **Example of the allowed form:**

  ```python
  {x: f(x) for x in foo}
  ```

- **Exception:** If this is intended, add `{"rule":"C402","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-generator-dict/)

<a id="ruff-c403"></a>

### `ruff/C403`

Checks for unnecessary list comprehensions.

- **Why it is on:** It's unnecessary to use a list comprehension inside a call to `set()`, since there is an equivalent comprehension for this type. Selected in the ruff config of the Python preset, with the flake8-comprehensions rules (`unnecessary-list-comprehension-set`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-list-comprehension-set/).
- **Example of the allowed form:**

  ```python
  {f(x) for x in foo}
  ```

- **Exception:** If this is intended, add `{"rule":"C403","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-list-comprehension-set/)

<a id="ruff-c404"></a>

### `ruff/C404`

Checks for unnecessary list comprehensions.

- **Why it is on:** It's unnecessary to use a list comprehension inside a call to `dict()`, since there is an equivalent comprehension for this type. Selected in the ruff config of the Python preset, with the flake8-comprehensions rules (`unnecessary-list-comprehension-dict`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-list-comprehension-dict/).
- **Example of the allowed form:**

  ```python
  {x: f(x) for x in foo}
  ```

- **Exception:** If this is intended, add `{"rule":"C404","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-list-comprehension-dict/)

<a id="ruff-c405"></a>

### `ruff/C405`

Checks for `set()` calls that take unnecessary list or tuple literals as arguments.

- **Why it is on:** It's unnecessary to use a list or tuple literal within a call to `set()`. Instead, the expression can be rewritten as a set literal. Selected in the ruff config of the Python preset, with the flake8-comprehensions rules (`unnecessary-literal-set`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-literal-set/).
- **Example of the allowed form:**

  ```python
  {1, 2}
  {1, 2}
  set()
  ```

- **Exception:** If this is intended, add `{"rule":"C405","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-literal-set/)

<a id="ruff-c406"></a>

### `ruff/C406`

Checks for unnecessary list or tuple literals.

- **Why it is on:** It's unnecessary to use a list or tuple literal within a call to `dict()`. It can be rewritten as a dict literal (`{}`). Selected in the ruff config of the Python preset, with the flake8-comprehensions rules (`unnecessary-literal-dict`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-literal-dict/).
- **Example of the allowed form:**

  ```python
  {1: 2, 3: 4}
  {1: 2, 3: 4}
  {}
  ```

- **Exception:** If this is intended, add `{"rule":"C406","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-literal-dict/)

<a id="ruff-c408"></a>

### `ruff/C408`

Checks for unnecessary `dict()`, `list()` or `tuple()` calls that can be rewritten as empty literals.

- **Why it is on:** It's unnecessary to call, e.g., `dict()` as opposed to using an empty literal (`{}`). The former is slower because the name `dict` must be looked up in the global scope in case it has been rebound. Selected in the ruff config of the Python preset, with the flake8-comprehensions rules (`unnecessary-collection-call`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-collection-call/).
- **Example of the allowed form:**

  ```python
  {}
  {"a": 1, "b": 2}
  []
  ()
  ```

- **Exception:** If this is intended, add `{"rule":"C408","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-collection-call/)

<a id="ruff-c409"></a>

### `ruff/C409`

Checks for `tuple` calls that take unnecessary list or tuple literals as arguments.

- **Why it is on:** It's unnecessary to use a list or tuple literal within a `tuple()` call, since there is a literal syntax for these types. If a list literal was passed, then it should be rewritten as a `tuple` literal. Otherwise, if a tuple literal was passed, then the outer call to `tuple()` should be removed. Selected in the ruff config of the Python preset, with the flake8-comprehensions rules (`unnecessary-literal-within-tuple-call`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-literal-within-tuple-call/).
- **Example of the allowed form:**

  ```python
  (1, 2)
  (1, 2)
  ```

- **Exception:** If this is intended, add `{"rule":"C409","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-literal-within-tuple-call/)

<a id="ruff-c410"></a>

### `ruff/C410`

Checks for `list()` calls that take unnecessary list or tuple literals as arguments.

- **Why it is on:** It's unnecessary to use a list or tuple literal within a `list()` call, since there is a literal syntax for these types. If a list literal is passed in, then the outer call to `list()` should be removed. Otherwise, if a tuple literal is passed in, then it should be rewritten as a list literal. Selected in the ruff config of the Python preset, with the flake8-comprehensions rules (`unnecessary-literal-within-list-call`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-literal-within-list-call/).
- **Example of the allowed form:**

  ```python
  [1, 2]
  [1, 2]
  ```

- **Exception:** If this is intended, add `{"rule":"C410","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-literal-within-list-call/)

<a id="ruff-c411"></a>

### `ruff/C411`

Checks for unnecessary `list()` calls around list comprehensions.

- **Why it is on:** It is redundant to use a `list()` call around a list comprehension. Selected in the ruff config of the Python preset, with the flake8-comprehensions rules (`unnecessary-list-call`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-list-call/).
- **Exception:** If this is intended, add `{"rule":"C411","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-list-call/)

<a id="ruff-c413"></a>

### `ruff/C413`

Checks for unnecessary `list()` or `reversed()` calls around `sorted()` calls.

- **Why it is on:** It is unnecessary to use `list()` around `sorted()`, as the latter already returns a list. It is also unnecessary to use `reversed()` around `sorted()`, as the latter has a `reverse` argument that can be used in lieu of an additional `reversed()` call. Selected in the ruff config of the Python preset, with the flake8-comprehensions rules (`unnecessary-call-around-sorted`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-call-around-sorted/).
- **Example of the allowed form:**

  ```python
  sorted(iterable, reverse=True)
  ```

- **Exception:** If this is intended, add `{"rule":"C413","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-call-around-sorted/)

<a id="ruff-c414"></a>

### `ruff/C414`

Checks for unnecessary `list()`, `reversed()`, `set()`, `sorted()`, and `tuple()` call within `list()`, `set()`, `sorted()`, and `tuple()` calls.

- **Why it is on:** It's unnecessary to double-cast or double-process iterables by wrapping the listed functions within an additional `list()`, `set()`, `sorted()`, or `tuple()` call. Doing so is redundant and can be confusing for readers. Selected in the ruff config of the Python preset, with the flake8-comprehensions rules (`unnecessary-double-cast-or-process`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-double-cast-or-process/).
- **Example of the allowed form:**

  ```python
  list(iterable)
  ```

- **Exception:** If this is intended, add `{"rule":"C414","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-double-cast-or-process/)

<a id="ruff-c415"></a>

### `ruff/C415`

Checks for unnecessary subscript reversal of iterable.

- **Why it is on:** It's unnecessary to reverse the order of an iterable when passing it into `reversed()`, `set()` or `sorted()` functions as they will change the order of the elements again. Selected in the ruff config of the Python preset, with the flake8-comprehensions rules (`unnecessary-subscript-reversal`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-subscript-reversal/).
- **Example of the allowed form:**

  ```python
  sorted(iterable)
  set(iterable)
  iterable
  ```

- **Exception:** If this is intended, add `{"rule":"C415","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-subscript-reversal/)

<a id="ruff-c416"></a>

### `ruff/C416`

Checks for unnecessary dict, list, and set comprehension.

- **Why it is on:** It's unnecessary to use a dict/list/set comprehension to build a data structure if the elements are unchanged. Wrap the iterable with `dict()`, `list()`, or `set()` instead. Selected in the ruff config of the Python preset, with the flake8-comprehensions rules (`unnecessary-comprehension`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-comprehension/).
- **Example of the allowed form:**

  ```python
  dict(iterable)
  list(iterable)
  set(iterable)
  ```

- **Exception:** If this is intended, add `{"rule":"C416","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-comprehension/)

<a id="ruff-c417"></a>

### `ruff/C417`

Checks for unnecessary `map()` calls with lambda functions.

- **Why it is on:** Using `map(func, iterable)` when `func` is a lambda is slower than using a generator expression or a comprehension, as the latter approach avoids the function call overhead, in addition to being more readable. This rule also applies to `map()` calls within `list()`, `set()`, and `dict()` calls. For example: Selected in the ruff config of the Python preset, with the flake8-comprehensions rules (`unnecessary-map`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-map/).
- **Example of the allowed form:**

  ```python
  (x + 1 for x in iterable)
  ```

- **Exception:** If this is intended, add `{"rule":"C417","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-map/)

<a id="ruff-c418"></a>

### `ruff/C418`

Checks for `dict()` calls that take unnecessary dict literals or dict comprehensions as arguments.

- **Why it is on:** It's unnecessary to wrap a dict literal or comprehension within a `dict()` call, since the literal or comprehension syntax already returns a dictionary. Selected in the ruff config of the Python preset, with the flake8-comprehensions rules (`unnecessary-literal-within-dict-call`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-literal-within-dict-call/).
- **Example of the allowed form:**

  ```python
  {}
  {"a": 1}
  ```

- **Exception:** If this is intended, add `{"rule":"C418","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-literal-within-dict-call/)

<a id="ruff-c419"></a>

### `ruff/C419`

Checks for unnecessary list or set comprehensions passed to builtin functions that take an iterable.

- **Why it is on:** Many builtin functions (this rule currently covers `any` and `all` in stable, along with `min`, `max`, and `sum` in preview) accept any iterable, including a generator. Constructing a temporary list via list comprehension is unnecessary and wastes memory for large iterables. `any` and `all` can also short-circuit iteration, saving a lot of time. The unnecessary comprehension forces a full iteration of the input iterable, giving up the benefits of short-circuiting. For example, compare the performance of `all` with a list comprehension against that of a generator in a case where an early short-circuit is possible (almost 40x faster): Selected in the ruff config of the Python preset, with the flake8-comprehensions rules (`unnecessary-comprehension-in-call`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-comprehension-in-call/).
- **Example of the allowed form:**

  ```python
  any(x.id for x in bar)
  all(x.id for x in bar)
  sum(x.val for x in bar)
  min(x.val for x in bar)
  max(x.val for x in bar)
  ```

- **Exception:** If this is intended, add `{"rule":"C419","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-comprehension-in-call/)

<a id="ruff-c420"></a>

### `ruff/C420`

Checks for unnecessary dict comprehension when creating a dictionary from an iterable.

- **Why it is on:** It's unnecessary to use a dict comprehension to build a dictionary from an iterable when the value is static. Prefer `dict.fromkeys(iterable)` over `{value: None for value in iterable}`, as `dict.fromkeys` is more readable and efficient. Selected in the ruff config of the Python preset, with the flake8-comprehensions rules (`unnecessary-dict-comprehension-for-iterable`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-dict-comprehension-for-iterable/).
- **Example of the allowed form:**

  ```python
  dict.fromkeys(iterable)
  dict.fromkeys(iterable, 1)
  ```

- **Exception:** If this is intended, add `{"rule":"C420","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-dict-comprehension-for-iterable/)

<a id="ruff-e401"></a>

### `ruff/E401`

Check for multiple imports on one line.

- **Why it is on:** According to PEP 8, "imports should usually be on separate lines." Selected in the ruff config of the Python preset, with the pycodestyle rules (`multiple-imports-on-one-line`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/multiple-imports-on-one-line/).
- **Example of the allowed form:**

  ```python
  import os
  import sys
  ```

- **Exception:** If this is intended, add `{"rule":"E401","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/multiple-imports-on-one-line/)

<a id="ruff-e402"></a>

### `ruff/E402`

Checks for imports that are not at the top of the file.

- **Why it is on:** According to PEP 8, "imports are always put at the top of the file, just after any module comments and docstrings, and before module globals and constants." This rule makes an exception for both `sys.path` modifications (allowing for `sys.path.insert`, `sys.path.append`, etc.) and `os.environ` modifications between imports. Selected in the ruff config of the Python preset, with the pycodestyle rules (`module-import-not-at-top-of-file`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/module-import-not-at-top-of-file/).
- **Example of the allowed form:**

  ```python
  import os
  from sys import x

  "One string"
  "Two string"
  a = 1
  ```

- **Exception:** If this is intended, add `{"rule":"E402","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/module-import-not-at-top-of-file/)

<a id="ruff-e701"></a>

### `ruff/E701`

Checks for compound statements (multiple statements on the same line).

- **Why it is on:** According to PEP 8, "compound statements are generally discouraged". Selected in the ruff config of the Python preset, with the pycodestyle rules (`multiple-statements-on-one-line-colon`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/multiple-statements-on-one-line-colon/).
- **Example of the allowed form:**

  ```python
  if foo == "blah":
      do_blah_thing()
  ```

- **Exception:** If this is intended, add `{"rule":"E701","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/multiple-statements-on-one-line-colon/)

<a id="ruff-e702"></a>

### `ruff/E702`

Checks for multiline statements on one line.

- **Why it is on:** According to PEP 8, including multi-clause statements on the same line is discouraged. Selected in the ruff config of the Python preset, with the pycodestyle rules (`multiple-statements-on-one-line-semicolon`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/multiple-statements-on-one-line-semicolon/).
- **Example of the allowed form:**

  ```python
  do_one()
  do_two()
  do_three()
  ```

- **Exception:** If this is intended, add `{"rule":"E702","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/multiple-statements-on-one-line-semicolon/)

<a id="ruff-e703"></a>

### `ruff/E703`

Checks for statements that end with an unnecessary semicolon.

- **Why it is on:** A trailing semicolon is unnecessary and should be removed. Selected in the ruff config of the Python preset, with the pycodestyle rules (`useless-semicolon`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/useless-semicolon/).
- **Example of the allowed form:**

  ```python
  do_four()
  ```

- **Exception:** If this is intended, add `{"rule":"E703","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/useless-semicolon/)

<a id="ruff-e711"></a>

### `ruff/E711`

Checks for comparisons to `None` which are not using the `is` operator.

- **Why it is on:** According to PEP 8, "Comparisons to singletons like None should always be done with `is` or `is not`, never the equality operators." Selected in the ruff config of the Python preset, with the pycodestyle rules (`none-comparison`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/none-comparison/).
- **Example of the allowed form:**

  ```python
  if arg is not None:
      pass
  ```

- **Exception:** If this is intended, add `{"rule":"E711","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/none-comparison/)

<a id="ruff-e712"></a>

### `ruff/E712`

Checks for equality comparisons to boolean literals.

- **Why it is on:** PEP 8 recommends against using the equality operators `==` and `!=` to compare values to `True` or `False`. Instead, use `if cond:` or `if not cond:` to check for truth values. Selected in the ruff config of the Python preset, with the pycodestyle rules (`true-false-comparison`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/true-false-comparison/).
- **Example of the allowed form:**

  ```python
  if foo:
      ...

  if not bar:
      ...
  ```

- **Exception:** If this is intended, add `{"rule":"E712","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/true-false-comparison/)

<a id="ruff-e713"></a>

### `ruff/E713`

Checks for membership tests using `not {element} in {collection}`.

- **Why it is on:** Testing membership with `{element} not in {collection}` is more readable. Selected in the ruff config of the Python preset, with the pycodestyle rules (`not-in-test`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/not-in-test/).
- **Example of the allowed form:**

  ```python
  Z = X not in Y
  if X.B not in Y:
      pass
  ```

- **Exception:** If this is intended, add `{"rule":"E713","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/not-in-test/)

<a id="ruff-e714"></a>

### `ruff/E714`

Checks for identity comparisons using `not {foo} is {bar}`.

- **Why it is on:** According to PEP8, testing for an object's identity with `is not` is more readable. Selected in the ruff config of the Python preset, with the pycodestyle rules (`not-is-test`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/not-is-test/).
- **Example of the allowed form:**

  ```python
  if X is not Y:
      pass
  Z = X.B is not Y
  ```

- **Exception:** If this is intended, add `{"rule":"E714","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/not-is-test/)

<a id="ruff-e721"></a>

### `ruff/E721`

Checks for object type comparisons using `==` and other comparison operators.

- **Why it is on:** Unlike a direct type comparison, `isinstance` will also check if an object is an instance of a class or a subclass thereof. If you want to check for an exact type match, use `is` or `is not`. Selected in the ruff config of the Python preset, with the pycodestyle rules (`type-comparison`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/type-comparison/).
- **Example of the allowed form:**

  ```python
  if isinstance(obj, int):
      pass
  ```

- **Exception:** If this is intended, add `{"rule":"E721","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/type-comparison/)

<a id="ruff-e722"></a>

### `ruff/E722`

Checks for bare `except` catches in `try`-`except` statements.

- **Why it is on:** A bare `except` catches `BaseException` which includes `KeyboardInterrupt`, `SystemExit`, `Exception`, and others. Catching `BaseException` can make it hard to interrupt the program (e.g., with Ctrl-C) and can disguise other problems. Selected in the ruff config of the Python preset, with the pycodestyle rules (`bare-except`).
- **Allowed form:** Catch the specific exception and handle it, or re-raise it with its cause (`raise DomainError(...) from error`); `contextlib.suppress(SpecificError)` ignores one expected error. In a test, use `pytest.raises(SpecificError)` (`self.assertRaises` in unittest).
- **Example of the allowed form:**

  ```python
  try:
      do_something_that_might_break()
  except MoreSpecificException as e:
      handle_error(e)
  ```

- **Exception:** If this is intended, add `{"rule":"E722","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/bare-except/)

<a id="ruff-e731"></a>

### `ruff/E731`

Checks for lambda expressions which are assigned to a variable.

- **Why it is on:** Per PEP 8, you should "Always use a def statement instead of an assignment statement that binds a lambda expression directly to an identifier." Using a `def` statement leads to better tracebacks, and the assignment itself negates the primary benefit of using a `lambda` expression (i.e., that it can be embedded inside another expression). Selected in the ruff config of the Python preset, with the pycodestyle rules (`lambda-assignment`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/lambda-assignment/).
- **Example of the allowed form:**

  ```python
  def f(x):
      return 2 * x
  ```

- **Exception:** If this is intended, add `{"rule":"E731","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/lambda-assignment/)

<a id="ruff-e741"></a>

### `ruff/E741`

Checks for the use of the characters 'l', 'O', or 'I' as variable names.

- **Why it is on:** In some fonts, these characters are indistinguishable from the numerals one and zero. When tempted to use 'l', use 'L' instead. Selected in the ruff config of the Python preset, with the pycodestyle rules (`ambiguous-variable-name`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/ambiguous-variable-name/).
- **Example of the allowed form:**

  ```python
  L = 0
  o = 123
  i = 42
  ```

- **Exception:** If this is intended, add `{"rule":"E741","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/ambiguous-variable-name/)

<a id="ruff-e742"></a>

### `ruff/E742`

Checks for the use of the characters 'l', 'O', or 'I' as class names.

- **Why it is on:** In some fonts, these characters are indistinguishable from the numerals one and zero. When tempted to use 'l', use 'L' instead. Selected in the ruff config of the Python preset, with the pycodestyle rules (`ambiguous-class-name`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/ambiguous-class-name/).
- **Example of the allowed form:**

  ```python
  class Integer(object): ...
  ```

- **Exception:** If this is intended, add `{"rule":"E742","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/ambiguous-class-name/)

<a id="ruff-e743"></a>

### `ruff/E743`

Checks for the use of the characters 'l', 'O', or 'I' as function names.

- **Why it is on:** In some fonts, these characters are indistinguishable from the numerals one and zero. When tempted to use 'l', use 'L' instead. Selected in the ruff config of the Python preset, with the pycodestyle rules (`ambiguous-function-name`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/ambiguous-function-name/).
- **Example of the allowed form:**

  ```python
  def long_name(x): ...
  ```

- **Exception:** If this is intended, add `{"rule":"E743","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/ambiguous-function-name/)

<a id="ruff-e902"></a>

### `ruff/E902`

This is not a regular diagnostic; instead, it's raised when a file cannot be read from disk.

- **Why it is on:** An `IOError` indicates an error in the development setup. For example, the user may not have permissions to read a given file, or the filesystem may contain a broken symlink. Selected in the ruff config of the Python preset, with the pycodestyle rules (`io-error`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/io-error/).
- **Exception:** If this is intended, add `{"rule":"E902","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/io-error/)

<a id="ruff-era001"></a>

### `ruff/ERA001`

Checks for commented-out Python code.

- **Why it is on:** Commented-out code is dead code, and is often included inadvertently. It should be removed. Selected in the ruff config of the Python preset, with the eradicate rules (`commented-out-code`).
- **Allowed form:** Delete the commented-out code; version control keeps the history. A comment that explains something is written as prose (`Raises: ValueError` and `e.g.` lines are allowed).
- **Exception:** If this is intended, add `{"rule":"ERA001","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/commented-out-code/)

<a id="ruff-f401"></a>

### `ruff/F401`

Checks for unused imports.

- **Why it is on:** Unused imports add a performance overhead at runtime, and risk creating import cycles. They also increase the cognitive load of reading the code. If an import statement is used to check for the availability or existence of a module, consider using `importlib.util.find_spec` instead. Selected in the ruff config of the Python preset, with the Pyflakes rules (`unused-import`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unused-import/).
- **Example of the allowed form:**

  ```python
  def area(radius):
      return 3.14 * radius**2
  ```

- **Exception:** If this is intended, add `{"rule":"F401","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unused-import/)

<a id="ruff-f402"></a>

### `ruff/F402`

Checks for import bindings that are shadowed by loop variables.

- **Why it is on:** Shadowing an import with loop variables makes the code harder to read and reason about, as the identify of the imported binding is no longer clear. It's also often indicative of a mistake, as it's unlikely that the loop variable is intended to be used as the imported binding. Consider using a different name for the loop variable. Selected in the ruff config of the Python preset, with the Pyflakes rules (`import-shadowed-by-loop-var`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/import-shadowed-by-loop-var/).
- **Example of the allowed form:**

  ```python
  from os import path


  for filename in files:
      print(filename)
  ```

- **Exception:** If this is intended, add `{"rule":"F402","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/import-shadowed-by-loop-var/)

<a id="ruff-f403"></a>

### `ruff/F403`

Checks for the use of wildcard imports.

- **Why it is on:** Wildcard imports (e.g., `from module import *`) make it hard to determine which symbols are available in the current namespace, and from which module they were imported. They're also discouraged by PEP 8. Selected in the ruff config of the Python preset, with the Pyflakes rules (`undefined-local-with-import-star`).
- **Allowed form:** Import the names you use: `from module import name`.
- **Example of the allowed form:**

  ```python
  from math import pi


  def area(radius):
      return pi * radius**2
  ```

- **Exception:** If this is intended, add `{"rule":"F403","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/undefined-local-with-import-star/)

<a id="ruff-f404"></a>

### `ruff/F404`

Checks for `__future__` imports that are not located at the beginning of a file.

- **Why it is on:** Imports from `__future__` must be placed the beginning of the file, before any other statements (apart from docstrings). The use of `__future__` imports elsewhere is invalid and will result in a `SyntaxError`. Selected in the ruff config of the Python preset, with the Pyflakes rules (`late-future-import`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/late-future-import/).
- **Example of the allowed form:**

  ```python
  from __future__ import annotations

  from pathlib import Path
  ```

- **Exception:** If this is intended, add `{"rule":"F404","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/late-future-import/)

<a id="ruff-f406"></a>

### `ruff/F406`

Check for the use of wildcard imports outside of the module namespace.

- **Why it is on:** The use of wildcard imports outside of the module namespace (e.g., within functions) can lead to confusion, as the import can shadow local variables. Though wildcard imports are discouraged by PEP 8, when necessary, they should be placed in the module namespace (i.e., at the top-level of a module). Selected in the ruff config of the Python preset, with the Pyflakes rules (`undefined-local-with-nested-import-star-usage`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/undefined-local-with-nested-import-star-usage/).
- **Example of the allowed form:**

  ```python
  from math import *


  def foo(): ...
  ```

- **Exception:** If this is intended, add `{"rule":"F406","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/undefined-local-with-nested-import-star-usage/)

<a id="ruff-f407"></a>

### `ruff/F407`

Checks for `__future__` imports that are not defined in the current Python version.

- **Why it is on:** Importing undefined or unsupported members from the `__future__` module is a `SyntaxError`. Selected in the ruff config of the Python preset, with the Pyflakes rules (`future-feature-not-defined`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/future-feature-not-defined/).
- **Exception:** If this is intended, add `{"rule":"F407","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/future-feature-not-defined/)

<a id="ruff-f501"></a>

### `ruff/F501`

Checks for invalid `printf`-style format strings.

- **Why it is on:** Conversion specifiers are required for `printf`-style format strings. These specifiers must contain a `%` character followed by a conversion type. Selected in the ruff config of the Python preset, with the Pyflakes rules (`percent-format-invalid-format`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/percent-format-invalid-format/).
- **Example of the allowed form:**

  ```python
  "Hello, %s" % "world"
  ```

- **Exception:** If this is intended, add `{"rule":"F501","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/percent-format-invalid-format/)

<a id="ruff-f502"></a>

### `ruff/F502`

Checks for named placeholders in `printf`-style format strings without mapping-type values.

- **Why it is on:** When using named placeholders in `printf`-style format strings, the values must be a map type (such as a dictionary). Otherwise, the expression will raise a `TypeError`. Selected in the ruff config of the Python preset, with the Pyflakes rules (`percent-format-expected-mapping`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/percent-format-expected-mapping/).
- **Example of the allowed form:**

  ```python
  "%(greeting)s, %(name)s" % {"greeting": "Hello", "name": "World"}
  ```

- **Exception:** If this is intended, add `{"rule":"F502","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/percent-format-expected-mapping/)

<a id="ruff-f503"></a>

### `ruff/F503`

Checks for uses of mapping-type values in `printf`-style format strings without named placeholders.

- **Why it is on:** When using mapping-type values (such as `dict`) in `printf`-style format strings, the keys must be named. Otherwise, the expression will raise a `TypeError`. Selected in the ruff config of the Python preset, with the Pyflakes rules (`percent-format-expected-sequence`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/percent-format-expected-sequence/).
- **Example of the allowed form:**

  ```python
  "%(greeting)s, %(name)s" % {"greeting": "Hello", "name": "World"}
  ```

- **Exception:** If this is intended, add `{"rule":"F503","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/percent-format-expected-sequence/)

<a id="ruff-f504"></a>

### `ruff/F504`

Checks for unused mapping keys in `printf`-style format strings.

- **Why it is on:** Unused named placeholders in `printf`-style format strings are unnecessary, and likely indicative of a mistake. They should be removed. Selected in the ruff config of the Python preset, with the Pyflakes rules (`percent-format-extra-named-arguments`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/percent-format-extra-named-arguments/).
- **Example of the allowed form:**

  ```python
  "Hello, %(name)s" % {"name": "World"}
  ```

- **Exception:** If this is intended, add `{"rule":"F504","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/percent-format-extra-named-arguments/)

<a id="ruff-f505"></a>

### `ruff/F505`

Checks for named placeholders in `printf`-style format strings that are not present in the provided mapping.

- **Why it is on:** Named placeholders that lack a corresponding value in the provided mapping will raise a `KeyError`. Selected in the ruff config of the Python preset, with the Pyflakes rules (`percent-format-missing-argument`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/percent-format-missing-argument/).
- **Example of the allowed form:**

  ```python
  "Hello, %(name)s" % {"name": "world"}
  ```

- **Exception:** If this is intended, add `{"rule":"F505","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/percent-format-missing-argument/)

<a id="ruff-f506"></a>

### `ruff/F506`

Checks for `printf`-style format strings that have mixed positional and named placeholders.

- **Why it is on:** Python does not support mixing positional and named placeholders in `printf`-style format strings. The use of mixed placeholders will raise a `TypeError` at runtime. Selected in the ruff config of the Python preset, with the Pyflakes rules (`percent-format-mixed-positional-and-named`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/percent-format-mixed-positional-and-named/).
- **Example of the allowed form:**

  ```python
  "%s, %s" % ("Hello", "World")
  ```

- **Exception:** If this is intended, add `{"rule":"F506","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/percent-format-mixed-positional-and-named/)

<a id="ruff-f507"></a>

### `ruff/F507`

Checks for `printf`-style format strings that have a mismatch between the number of positional placeholders and the number of substitution values.

- **Why it is on:** When a `printf`-style format string is provided with too many or too few substitution values, it will raise a `TypeError` at runtime. Selected in the ruff config of the Python preset, with the Pyflakes rules (`percent-format-positional-count-mismatch`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/percent-format-positional-count-mismatch/).
- **Example of the allowed form:**

  ```python
  "%s, %s" % ("Hello", "world")
  ```

- **Exception:** If this is intended, add `{"rule":"F507","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/percent-format-positional-count-mismatch/)

<a id="ruff-f508"></a>

### `ruff/F508`

Checks for `printf`-style format strings that use the `*` specifier with non-tuple values.

- **Why it is on:** The use of the `*` specifier with non-tuple values will raise a `TypeError` at runtime. Selected in the ruff config of the Python preset, with the Pyflakes rules (`percent-format-star-requires-sequence`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/percent-format-star-requires-sequence/).
- **Example of the allowed form:**

  ```python
  from math import pi

  "%.*f" % (2, pi)  # 3.14
  ```

- **Exception:** If this is intended, add `{"rule":"F508","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/percent-format-star-requires-sequence/)

<a id="ruff-f509"></a>

### `ruff/F509`

Checks for `printf`-style format strings with invalid format characters.

- **Why it is on:** In `printf`-style format strings, the `%` character is used to indicate placeholders. If a `%` character is not followed by a valid format character, it will raise a `ValueError` at runtime. Selected in the ruff config of the Python preset, with the Pyflakes rules (`percent-format-unsupported-format-character`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/percent-format-unsupported-format-character/).
- **Example of the allowed form:**

  ```python
  "Hello, %s" % "world"
  ```

- **Exception:** If this is intended, add `{"rule":"F509","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/percent-format-unsupported-format-character/)

<a id="ruff-f521"></a>

### `ruff/F521`

Checks for `str.format` calls with invalid format strings.

- **Why it is on:** Invalid format strings will raise a `ValueError`. Selected in the ruff config of the Python preset, with the Pyflakes rules (`string-dot-format-invalid-format`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/string-dot-format-invalid-format/).
- **Example of the allowed form:**

  ```python
  "{}".format(foo)
  ```

- **Exception:** If this is intended, add `{"rule":"F521","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/string-dot-format-invalid-format/)

<a id="ruff-f522"></a>

### `ruff/F522`

Checks for `str.format` calls with unused keyword arguments.

- **Why it is on:** Unused keyword arguments are redundant, and often indicative of a mistake. They should be removed. Selected in the ruff config of the Python preset, with the Pyflakes rules (`string-dot-format-extra-named-arguments`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/string-dot-format-extra-named-arguments/).
- **Example of the allowed form:**

  ```python
  "Hello, {name}".format(name="World")
  ```

- **Exception:** If this is intended, add `{"rule":"F522","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/string-dot-format-extra-named-arguments/)

<a id="ruff-f523"></a>

### `ruff/F523`

Checks for `str.format` calls with unused positional arguments.

- **Why it is on:** Unused positional arguments are redundant, and often indicative of a mistake. They should be removed. Selected in the ruff config of the Python preset, with the Pyflakes rules (`string-dot-format-extra-positional-arguments`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/string-dot-format-extra-positional-arguments/).
- **Example of the allowed form:**

  ```python
  "Hello, {0}".format("world")
  ```

- **Exception:** If this is intended, add `{"rule":"F523","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/string-dot-format-extra-positional-arguments/)

<a id="ruff-f524"></a>

### `ruff/F524`

Checks for `str.format` calls with placeholders that are missing arguments.

- **Why it is on:** In `str.format` calls, omitting arguments for placeholders will raise a `KeyError` at runtime. Selected in the ruff config of the Python preset, with the Pyflakes rules (`string-dot-format-missing-arguments`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/string-dot-format-missing-arguments/).
- **Example of the allowed form:**

  ```python
  "{greeting}, {name}".format(greeting="Hello", name="World")
  ```

- **Exception:** If this is intended, add `{"rule":"F524","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/string-dot-format-missing-arguments/)

<a id="ruff-f525"></a>

### `ruff/F525`

Checks for `str.format` calls that mix automatic and manual numbering.

- **Why it is on:** In `str.format` calls, mixing automatic and manual numbering will raise a `ValueError` at runtime. Selected in the ruff config of the Python preset, with the Pyflakes rules (`string-dot-format-mixing-automatic`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/string-dot-format-mixing-automatic/).
- **Example of the allowed form:**

  ```python
  "{0}, {1}".format("Hello", "World")
  ```

- **Exception:** If this is intended, add `{"rule":"F525","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/string-dot-format-mixing-automatic/)

<a id="ruff-f541"></a>

### `ruff/F541`

Checks for f-strings that do not contain any placeholder expressions.

- **Why it is on:** f-strings are a convenient way to format strings, but they are not necessary if there are no placeholder expressions to format. In this case, a regular string should be used instead, as an f-string without placeholders can be confusing for readers, who may expect such a placeholder to be present. An f-string without any placeholders could also indicate that the author forgot to add a placeholder expression. Selected in the ruff config of the Python preset, with the Pyflakes rules (`f-string-missing-placeholders`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/f-string-missing-placeholders/).
- **Example of the allowed form:**

  ```python
  "Hello, world!"
  ```

- **Exception:** If this is intended, add `{"rule":"F541","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/f-string-missing-placeholders/)

<a id="ruff-f601"></a>

### `ruff/F601`

Checks for dictionary literals that associate multiple values with the same key.

- **Why it is on:** Dictionary keys should be unique. If a key is associated with multiple values, the earlier values will be overwritten. Including multiple values for the same key in a dictionary literal is likely a mistake. Selected in the ruff config of the Python preset, with the Pyflakes rules (`multi-value-repeated-key-literal`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/multi-value-repeated-key-literal/).
- **Example of the allowed form:**

  ```python
  foo = {
      "bar": 1,
      "baz": 2,
  }
  foo["baz"]  # 2
  ```

- **Exception:** If this is intended, add `{"rule":"F601","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/multi-value-repeated-key-literal/)

<a id="ruff-f602"></a>

### `ruff/F602`

Checks for dictionary keys that are repeated with different values.

- **Why it is on:** Dictionary keys should be unique. If a key is repeated with a different value, the first values will be overwritten and the key will correspond to the last value. This is likely a mistake. Selected in the ruff config of the Python preset, with the Pyflakes rules (`multi-value-repeated-key-variable`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/multi-value-repeated-key-variable/).
- **Example of the allowed form:**

  ```python
  foo = {
      bar: 1,
      baz: 2,
  }
  foo[baz]  # 2
  ```

- **Exception:** If this is intended, add `{"rule":"F602","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/multi-value-repeated-key-variable/)

<a id="ruff-f621"></a>

### `ruff/F621`

Checks for the use of too many expressions in starred assignment statements.

- **Why it is on:** In assignment statements, starred expressions can be used to unpack iterables. In Python 3, no more than `1 << 8` assignments are allowed before a starred expression, and no more than `1 << 24` expressions are allowed after a starred expression. Selected in the ruff config of the Python preset, with the Pyflakes rules (`expressions-in-star-assignment`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/expressions-in-star-assignment/).
- **Exception:** If this is intended, add `{"rule":"F621","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/expressions-in-star-assignment/)

<a id="ruff-f622"></a>

### `ruff/F622`

Checks for the use of multiple starred expressions in assignment statements.

- **Why it is on:** In assignment statements, starred expressions can be used to unpack iterables. Including more than one starred expression on the left-hand-side of an assignment will cause a `SyntaxError`, as it is unclear which expression should receive the remaining values. Selected in the ruff config of the Python preset, with the Pyflakes rules (`multiple-starred-expressions`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/multiple-starred-expressions/).
- **Exception:** If this is intended, add `{"rule":"F622","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/multiple-starred-expressions/)

<a id="ruff-f631"></a>

### `ruff/F631`

Checks for `assert` statements that use non-empty tuples as test conditions.

- **Why it is on:** Non-empty tuples are always `True`, so an `assert` statement with a non-empty tuple as its test condition will always pass. This is likely a mistake. Selected in the ruff config of the Python preset, with the Pyflakes rules (`assert-tuple`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/assert-tuple/).
- **Example of the allowed form:**

  ```python
  assert some_condition
  ```

- **Exception:** If this is intended, add `{"rule":"F631","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/assert-tuple/)

<a id="ruff-f632"></a>

### `ruff/F632`

Checks for `is` and `is not` comparisons against literals, like integers, strings, or lists.

- **Why it is on:** The `is` and `is not` comparators operate on identity, in that they check whether two objects are the same object. If the objects are not the same object, the comparison will always be `False`. Using `is` and `is not` with constant literals often works "by accident", but are not guaranteed to produce the expected result. As of Python 3.8, using `is` and `is not` with constant literals will produce a `SyntaxWarning`. Selected in the ruff config of the Python preset, with the Pyflakes rules (`is-literal`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/is-literal/).
- **Example of the allowed form:**

  ```python
  x = 200
  if x == 200:
      print("It's 200!")
  ```

- **Exception:** If this is intended, add `{"rule":"F632","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/is-literal/)

<a id="ruff-f633"></a>

### `ruff/F633`

Checks for `print` statements that use the `>>` syntax.

- **Why it is on:** In Python 2, the `print` statement can be used with the `>>` syntax to print to a file-like object. This `print >> sys.stderr` syntax no longer exists in Python 3, where `print` is only a function, not a statement. Instead, use the `file` keyword argument to the `print` function, the `sys.stderr.write` function, or the `logging` module. Selected in the ruff config of the Python preset, with the Pyflakes rules (`invalid-print-syntax`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/invalid-print-syntax/).
- **Example of the allowed form:**

  ```python
  print("Hello, world!", file=sys.stderr)
  ```

- **Exception:** If this is intended, add `{"rule":"F633","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/invalid-print-syntax/)

<a id="ruff-f634"></a>

### `ruff/F634`

Checks for `if` statements that use non-empty tuples as test conditions.

- **Why it is on:** Non-empty tuples are always `True`, so an `if` statement with a non-empty tuple as its test condition will always pass. This is likely a mistake. Selected in the ruff config of the Python preset, with the Pyflakes rules (`if-tuple`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/if-tuple/).
- **Example of the allowed form:**

  ```python
  if False:
      print("This will never run")
  ```

- **Exception:** If this is intended, add `{"rule":"F634","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/if-tuple/)

<a id="ruff-f701"></a>

### `ruff/F701`

Checks for `break` statements outside of loops.

- **Why it is on:** The use of a `break` statement outside of a `for` or `while` loop will raise a `SyntaxError`. Selected in the ruff config of the Python preset, with the Pyflakes rules (`break-outside-loop`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/break-outside-loop/).
- **Exception:** If this is intended, add `{"rule":"F701","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/break-outside-loop/)

<a id="ruff-f702"></a>

### `ruff/F702`

Checks for `continue` statements outside of loops.

- **Why it is on:** The use of a `continue` statement outside of a `for` or `while` loop will raise a `SyntaxError`. Selected in the ruff config of the Python preset, with the Pyflakes rules (`continue-outside-loop`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/continue-outside-loop/).
- **Exception:** If this is intended, add `{"rule":"F702","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/continue-outside-loop/)

<a id="ruff-f704"></a>

### `ruff/F704`

Checks for `yield`, `yield from`, and `await` usages outside of functions.

- **Why it is on:** The use of `yield`, `yield from`, or `await` outside of a function will raise a `SyntaxError`. Selected in the ruff config of the Python preset, with the Pyflakes rules (`yield-outside-function`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/yield-outside-function/).
- **Exception:** If this is intended, add `{"rule":"F704","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/yield-outside-function/)

<a id="ruff-f706"></a>

### `ruff/F706`

Checks for `return` statements outside of functions.

- **Why it is on:** The use of a `return` statement outside of a function will raise a `SyntaxError`. Selected in the ruff config of the Python preset, with the Pyflakes rules (`return-outside-function`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/return-outside-function/).
- **Exception:** If this is intended, add `{"rule":"F706","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/return-outside-function/)

<a id="ruff-f707"></a>

### `ruff/F707`

Checks for `except` blocks that handle all exceptions, but are not the last `except` block in a `try` statement.

- **Why it is on:** When an exception is raised within a `try` block, the `except` blocks are evaluated in order, and the first matching block is executed. If an `except` block handles all exceptions, but isn't the last block, Python will raise a `SyntaxError`, as the following blocks would never be executed. Selected in the ruff config of the Python preset, with the Pyflakes rules (`default-except-not-last`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/default-except-not-last/).
- **Example of the allowed form:**

  ```python
  def reciprocal(n):
      try:
          reciprocal = 1 / n
      except ZeroDivisionError:
          print("Cannot divide by zero.")
      except:
          print("An exception occurred.")
      else:
          return reciprocal
  ```

- **Exception:** If this is intended, add `{"rule":"F707","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/default-except-not-last/)

<a id="ruff-f722"></a>

### `ruff/F722`

Checks for forward annotations that include invalid syntax.

- **Why it is on:** In Python, type annotations can be quoted as strings literals to enable references to types that have not yet been defined, known as "forward references". However, these quoted annotations must be valid Python expressions. The use of invalid syntax in a quoted annotation won't raise a `SyntaxError`, but will instead raise an error when type checking is performed. Selected in the ruff config of the Python preset, with the Pyflakes rules (`forward-annotation-syntax-error`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/forward-annotation-syntax-error/).
- **Exception:** If this is intended, add `{"rule":"F722","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/forward-annotation-syntax-error/)

<a id="ruff-f811"></a>

### `ruff/F811`

Checks for variable definitions that redefine (or "shadow") unused variables.

- **Why it is on:** Redefinitions of unused names are unnecessary and often indicative of a mistake. Selected in the ruff config of the Python preset, with the Pyflakes rules (`redefined-while-unused`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/redefined-while-unused/).
- **Example of the allowed form:**

  ```python
  import foo
  import bar
  ```

- **Exception:** If this is intended, add `{"rule":"F811","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/redefined-while-unused/)

<a id="ruff-f821"></a>

### `ruff/F821`

Checks for uses of undefined names.

- **Why it is on:** An undefined name is likely to raise `NameError` at runtime. Selected in the ruff config of the Python preset, with the Pyflakes rules (`undefined-name`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/undefined-name/).
- **Example of the allowed form:**

  ```python
  def double(n):
      return n * 2
  ```

- **Exception:** If this is intended, add `{"rule":"F821","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/undefined-name/)

<a id="ruff-f822"></a>

### `ruff/F822`

Checks for undefined names in `__all__`.

- **Why it is on:** In Python, the `__all__` variable is used to define the names that are exported when a module is imported as a wildcard (e.g., `from foo import *`). The names in `__all__` must be defined in the module, but are included as strings. Including an undefined name in `__all__` is likely to raise `NameError` at runtime, when the module is imported. Selected in the ruff config of the Python preset, with the Pyflakes rules (`undefined-export`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/undefined-export/).
- **Example of the allowed form:**

  ```python
  from foo import bar, baz


  __all__ = ["bar", "baz"]
  ```

- **Exception:** If this is intended, add `{"rule":"F822","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/undefined-export/)

<a id="ruff-f823"></a>

### `ruff/F823`

Checks for undefined local variables.

- **Why it is on:** Referencing a local variable before it has been assigned will raise an `UnboundLocalError` at runtime. Selected in the ruff config of the Python preset, with the Pyflakes rules (`undefined-local`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/undefined-local/).
- **Example of the allowed form:**

  ```python
  x = 1


  def foo():
      global x
      x += 1
  ```

- **Exception:** If this is intended, add `{"rule":"F823","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/undefined-local/)

<a id="ruff-f841"></a>

### `ruff/F841`

Checks for the presence of unused variables in function scopes.

- **Why it is on:** A variable that is defined but not used is likely a mistake, and should be removed to avoid confusion. If a variable is intentionally defined-but-not-used, it should be prefixed with an underscore, or some other value that adheres to the `lint.dummy-variable-rgx` pattern. Selected in the ruff config of the Python preset, with the Pyflakes rules (`unused-variable`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unused-variable/).
- **Example of the allowed form:**

  ```python
  def foo():
      x = 1
      return x
  ```

- **Exception:** If this is intended, add `{"rule":"F841","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unused-variable/)

<a id="ruff-f842"></a>

### `ruff/F842`

Checks for local variables that are annotated but never used.

- **Why it is on:** Annotations are used to provide type hints to static type checkers. If a variable is annotated but never used, the annotation is unnecessary. Selected in the ruff config of the Python preset, with the Pyflakes rules (`unused-annotation`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unused-annotation/).
- **Exception:** If this is intended, add `{"rule":"F842","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unused-annotation/)

<a id="ruff-f901"></a>

### `ruff/F901`

Checks for `raise` statements that raise `NotImplemented`.

- **Why it is on:** `NotImplemented` is a special value returned by binary special methods to indicate that an operation is not implemented with respect to a particular type. Because `NotImplemented` is not an exception, it cannot be raised. Raise `NotImplementedError` instead, which is used to indicate that a method is abstract or not implemented in the derived class. Selected in the ruff config of the Python preset, with the Pyflakes rules (`raise-not-implemented`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/raise-not-implemented/).
- **Example of the allowed form:**

  ```python
  class Foo:
      def bar(self):
          raise NotImplementedError
  ```

- **Exception:** If this is intended, add `{"rule":"F901","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/raise-not-implemented/)

<a id="ruff-fbt001"></a>

### `ruff/FBT001`

Checks for the use of boolean positional arguments in function definitions, as determined by the presence of a type hint containing `bool` as an evident subtype - e.g. `bool`, `bool | int`, `typing.Optionalbool`, etc.

- **Why it is on:** Calling a function with boolean positional arguments is confusing as the meaning of the boolean value is not clear to the caller and to future readers of the code. The use of a boolean will also limit the function to only two possible behaviors, which makes the function difficult to extend in the future. Selected in the ruff config of the Python preset, with the flake8-boolean-trap rules (`boolean-type-hint-positional-argument`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/boolean-type-hint-positional-argument/).
- **Exception:** If this is intended, add `{"rule":"FBT001","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/boolean-type-hint-positional-argument/)

<a id="ruff-fbt002"></a>

### `ruff/FBT002`

Checks for the use of boolean positional arguments in function definitions, as determined by the presence of a boolean default value.

- **Why it is on:** Calling a function with boolean positional arguments is confusing as the meaning of the boolean value is not clear to the caller and to future readers of the code. The use of a boolean will also limit the function to only two possible behaviors, which makes the function difficult to extend in the future. Selected in the ruff config of the Python preset, with the flake8-boolean-trap rules (`boolean-default-value-positional-argument`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/boolean-default-value-positional-argument/).
- **Exception:** If this is intended, add `{"rule":"FBT002","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/boolean-default-value-positional-argument/)

<a id="ruff-fly002"></a>

### `ruff/FLY002`

Checks for `str.join` calls that can be replaced with f-strings.

- **Why it is on:** f-strings are more readable and generally preferred over `str.join` calls. Selected in the ruff config of the Python preset, with the flynt rules (`static-join-to-f-string`).
- **Allowed form:** Use an f-string: `f"Hello, {name}"`.
- **Example of the allowed form:**

  ```python
  f"{foo} {bar}"
  ```

- **Exception:** If this is intended, add `{"rule":"FLY002","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/static-join-to-f-string/)

<a id="ruff-g001"></a>

### `ruff/G001`

Checks for uses of `str.format` to format logging messages.

- **Why it is on:** The `logging` module provides a mechanism for passing additional values to be logged using the `extra` keyword argument. This is more consistent, more efficient, and less error-prone than formatting the string directly. Using `str.format` to format a logging message requires that Python eagerly format the string, even if the logging statement is never executed (e.g., if the log level is above the level of the logging statement), whereas using the `extra` keyword argument defers formatting until required. Selected in the ruff config of the Python preset, with the flake8-logging-format rules (`logging-string-format`).
- **Allowed form:** Pass the values as arguments, not a formatted string: `logger.info("Loaded %s items", count)`.
- **Example of the allowed form:**

  ```python
  import logging

  logging.basicConfig(format="%(user_id)s - %(message)s", level=logging.INFO)

  user = "Maria"

  logging.info("Something happened", extra={"user_id": user})
  ```

- **Exception:** If this is intended, add `{"rule":"G001","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/logging-string-format/)

<a id="ruff-g002"></a>

### `ruff/G002`

Checks for uses of `printf`-style format strings to format logging messages.

- **Why it is on:** The `logging` module provides a mechanism for passing additional values to be logged using the `extra` keyword argument. This is more consistent, more efficient, and less error-prone than formatting the string directly. Using `printf`-style format strings to format a logging message requires that Python eagerly format the string, even if the logging statement is never executed (e.g., if the log level is above the level of the logging statement), whereas using the `extra` keyword argument defers formatting until required. Selected in the ruff config of the Python preset, with the flake8-logging-format rules (`logging-percent-format`).
- **Allowed form:** Pass the values as arguments, not a formatted string: `logger.info("Loaded %s items", count)`.
- **Example of the allowed form:**

  ```python
  import logging

  logging.basicConfig(format="%(user_id)s - %(message)s", level=logging.INFO)

  user = "Maria"

  logging.info("Something happened", extra=dict(user_id=user))
  ```

- **Exception:** If this is intended, add `{"rule":"G002","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/logging-percent-format/)

<a id="ruff-g003"></a>

### `ruff/G003`

Checks for uses string concatenation via the `+` operator to format logging messages.

- **Why it is on:** The `logging` module provides a mechanism for passing additional values to be logged using the `extra` keyword argument. This is more consistent, more efficient, and less error-prone than formatting the string directly. Using concatenation to format a logging message requires that Python eagerly format the string, even if the logging statement is never executed (e.g., if the log level is above the level of the logging statement), whereas using the `extra` keyword argument defers formatting until required. Selected in the ruff config of the Python preset, with the flake8-logging-format rules (`logging-string-concat`).
- **Allowed form:** Pass the values as arguments, not a formatted string: `logger.info("Loaded %s items", count)`.
- **Example of the allowed form:**

  ```python
  import logging

  logging.basicConfig(format="%(user_id)s - %(message)s", level=logging.INFO)

  user = "Maria"

  logging.info("Something happened", extra=dict(user_id=user))
  ```

- **Exception:** If this is intended, add `{"rule":"G003","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/logging-string-concat/)

<a id="ruff-g004"></a>

### `ruff/G004`

Checks for uses of f-strings to format logging messages.

- **Why it is on:** The `logging` module provides a mechanism for passing additional values to be logged using the `extra` keyword argument. This is more consistent, more efficient, and less error-prone than formatting the string directly. Using f-strings to format a logging message requires that Python eagerly format the string, even if the logging statement is never executed (e.g., if the log level is above the level of the logging statement), whereas using the `extra` keyword argument defers formatting until required. Selected in the ruff config of the Python preset, with the flake8-logging-format rules (`logging-f-string`).
- **Allowed form:** Pass the values as arguments, not a formatted string: `logger.info("Loaded %s items", count)`.
- **Example of the allowed form:**

  ```python
  import logging

  logging.basicConfig(format="%(user_id)s - %(message)s", level=logging.INFO)

  user = "Maria"

  logging.info("Something happened", extra=dict(user_id=user))
  ```

- **Exception:** If this is intended, add `{"rule":"G004","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/logging-f-string/)

<a id="ruff-g010"></a>

### `ruff/G010`

Checks for uses of `logging.warn` and `logging.Logger.warn`.

- **Why it is on:** `logging.warn` and `logging.Logger.warn` are deprecated in favor of `logging.warning` and `logging.Logger.warning`, which are functionally equivalent. Selected in the ruff config of the Python preset, with the flake8-logging-format rules (`logging-warn`).
- **Allowed form:** Call `logger.warning(...)`; `logger.warn` is deprecated.
- **Example of the allowed form:**

  ```python
  import logging

  logging.warning("Something happened")
  ```

- **Exception:** If this is intended, add `{"rule":"G010","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/logging-warn/)

<a id="ruff-g101"></a>

### `ruff/G101`

Checks for `extra` keywords in logging statements that clash with `LogRecord` attributes.

- **Why it is on:** The `logging` module provides a mechanism for passing additional values to be logged using the `extra` keyword argument. These values are then passed to the `LogRecord` constructor. Providing a value via `extra` that clashes with one of the attributes of the `LogRecord` constructor will raise a `KeyError` when the `LogRecord` is constructed. Selected in the ruff config of the Python preset, with the flake8-logging-format rules (`logging-extra-attr-clash`).
- **Allowed form:** Rename the key in `extra` so it does not clash with a log record attribute: `extra={"user_name": name}`.
- **Example of the allowed form:**

  ```python
  import logging

  logging.basicConfig(format="%(user_id)s - %(message)s", level=logging.INFO)

  username = "Maria"

  logging.info("Something happened", extra=dict(user_id=username))
  ```

- **Exception:** If this is intended, add `{"rule":"G101","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/logging-extra-attr-clash/)

<a id="ruff-g201"></a>

### `ruff/G201`

Checks for uses of `logging.error` that pass `exc_info=True`.

- **Why it is on:** Calling `logging.error` with `exc_info=True` is equivalent to calling `logging.exception`. Using `logging.exception` is more concise, more readable, and conveys the intent of the logging statement more clearly. Selected in the ruff config of the Python preset, with the flake8-logging-format rules (`logging-exc-info`).
- **Allowed form:** Inside an `except` block call `logger.exception(...)`, which logs the traceback.
- **Example of the allowed form:**

  ```python
  import logging

  try:
      ...
  except ValueError:
      logging.exception("Exception occurred")
  ```

- **Exception:** If this is intended, add `{"rule":"G201","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/logging-exc-info/)

<a id="ruff-g202"></a>

### `ruff/G202`

Checks for redundant `exc_info` keyword arguments in logging statements.

- **Why it is on:** `exc_info` is `True` by default for `logging.exception`, and `False` by default for `logging.error`. Passing `exc_info=True` to `logging.exception` calls is redundant, as is passing `exc_info=False` to `logging.error` calls. Selected in the ruff config of the Python preset, with the flake8-logging-format rules (`logging-redundant-exc-info`).
- **Allowed form:** Drop `exc_info=True`; `logger.exception(...)` already logs the traceback.
- **Example of the allowed form:**

  ```python
  import logging

  try:
      ...
  except ValueError:
      logging.exception("Exception occurred")
  ```

- **Exception:** If this is intended, add `{"rule":"G202","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/logging-redundant-exc-info/)

<a id="ruff-n801"></a>

### `ruff/N801`

Checks for class names that do not follow the `CamelCase` convention.

- **Why it is on:** PEP 8 recommends the use of the `CapWords` (or `CamelCase`) convention for class names: > Class names should normally use the `CapWords` convention. > > The naming convention for functions may be used instead in cases where the interface is > documented and used primarily as a callable. > > Note that there is a separate convention for builtin names: most builtin names are single > words (or two words run together), with the `CapWords` convention used only for exception > names and builtin constants. Selected in the ruff config of the Python preset, with the pep8-naming rules (`invalid-class-name`).
- **Allowed form:** Name the class in `CapWords` (`OrderLine`), not `snake_case`.
- **Example of the allowed form:**

  ```python
  class MyClass:
      pass
  ```

- **Exception:** If this is intended, add `{"rule":"N801","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/invalid-class-name/)

<a id="ruff-n802"></a>

### `ruff/N802`

Checks for functions names that do not follow the `snake_case` naming convention.

- **Why it is on:** PEP 8 recommends that function names follow `snake_case`: > Function names should be lowercase, with words separated by underscores as necessary to > improve readability. mixedCase is allowed only in contexts where that’s already the > prevailing style (e.g. threading.py), to retain backwards compatibility. Selected in the ruff config of the Python preset, with the pep8-naming rules (`invalid-function-name`).
- **Allowed form:** Rename the function, argument or variable in snake_case (`order_id`); `X`, `X_*` and names starting with `assert` are already allowed.
- **Example of the allowed form:**

  ```python
  def my_function():
      pass
  ```

- **Exception:** If this is intended, add `{"rule":"N802","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/invalid-function-name/)

<a id="ruff-n803"></a>

### `ruff/N803`

Checks for argument names that do not follow the `snake_case` convention.

- **Why it is on:** PEP 8 recommends that function names should be lower case and separated by underscores (also known as `snake_case`). > Function names should be lowercase, with words separated by underscores > as necessary to improve readability. > > Variable names follow the same convention as function names. > > mixedCase is allowed only in contexts where that’s already the > prevailing style (e.g. threading.py), to retain backwards compatibility. Selected in the ruff config of the Python preset, with the pep8-naming rules (`invalid-argument-name`).
- **Allowed form:** Rename the function, argument or variable in snake_case (`order_id`); `X`, `X_*` and names starting with `assert` are already allowed.
- **Example of the allowed form:**

  ```python
  def my_function(a, my_arg):
      pass
  ```

- **Exception:** If this is intended, add `{"rule":"N803","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/invalid-argument-name/)

<a id="ruff-n804"></a>

### `ruff/N804`

Checks for class methods that use a name other than `cls` for their first argument.

- **Why it is on:** PEP 8 recommends the use of `cls` as the first argument for all class methods: > Always use `cls` for the first argument to class methods. > > If a function argument’s name clashes with a reserved keyword, it is generally better to > append a single trailing underscore rather than use an abbreviation or spelling corruption. > Thus `class_` is better than `clss`. (Perhaps better is to avoid such clashes by using a synonym.) Selected in the ruff config of the Python preset, with the pep8-naming rules (`invalid-first-argument-name-for-class-method`).
- **Allowed form:** Name the first parameter `self` (`cls` in a classmethod, with `@classmethod`); SQLAlchemy `@declared_attr` and pydantic validators are already treated as class methods. Keep snake_case for the rest.
- **Example of the allowed form:**

  ```python
  class Example:
      @classmethod
      def function(cls, data): ...
  ```

- **Exception:** If this is intended, add `{"rule":"N804","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/invalid-first-argument-name-for-class-method/)

<a id="ruff-n805"></a>

### `ruff/N805`

Checks for instance methods that use a name other than `self` for their first argument.

- **Why it is on:** PEP 8 recommends the use of `self` as first argument for all instance methods: > Always use self for the first argument to instance methods. > > If a function argument’s name clashes with a reserved keyword, it is generally better to > append a single trailing underscore rather than use an abbreviation or spelling corruption. > Thus `class_` is better than `clss`. (Perhaps better is to avoid such clashes by using a synonym.) Selected in the ruff config of the Python preset, with the pep8-naming rules (`invalid-first-argument-name-for-method`).
- **Allowed form:** Name the first parameter `self` (`cls` in a classmethod, with `@classmethod`); SQLAlchemy `@declared_attr` and pydantic validators are already treated as class methods. Keep snake_case for the rest.
- **Example of the allowed form:**

  ```python
  class Example:
      def function(self, data): ...
  ```

- **Exception:** If this is intended, add `{"rule":"N805","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/invalid-first-argument-name-for-method/)

<a id="ruff-n806"></a>

### `ruff/N806`

Checks for the use of non-lowercase variable names in functions.

- **Why it is on:** PEP 8 recommends that all function variables use lowercase names: > Function names should be lowercase, with words separated by underscores as necessary to > improve readability. Variable names follow the same convention as function names. mixedCase > is allowed only in contexts where that's already the prevailing style (e.g. threading.py), > to retain backwards compatibility. Selected in the ruff config of the Python preset, with the pep8-naming rules (`non-lowercase-variable-in-function`).
- **Allowed form:** Rename the function, argument or variable in snake_case (`order_id`); `X`, `X_*` and names starting with `assert` are already allowed.
- **Example of the allowed form:**

  ```python
  def my_function(a):
      b = a + 3
      return b
  ```

- **Exception:** If this is intended, add `{"rule":"N806","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/non-lowercase-variable-in-function/)

<a id="ruff-n807"></a>

### `ruff/N807`

Checks for functions with "dunder" names (that is, names with two leading and trailing underscores) that are not documented.

- **Why it is on:** PEP 8 recommends that only documented "dunder" methods are used: > ..."magic" objects or attributes that live in user-controlled > namespaces. E.g. `__init__`, `__import__` or `__file__`. Never invent > such names; only use them as documented. Selected in the ruff config of the Python preset, with the pep8-naming rules (`dunder-function-name`).
- **Allowed form:** Rename the function, argument or variable in snake_case (`order_id`); `X`, `X_*` and names starting with `assert` are already allowed.
- **Example of the allowed form:**

  ```python
  def my_function():
      pass
  ```

- **Exception:** If this is intended, add `{"rule":"N807","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/dunder-function-name/)

<a id="ruff-n811"></a>

### `ruff/N811`

Checks for constant imports that are aliased to non-constant-style names.

- **Why it is on:** PEP 8 recommends naming conventions for classes, functions, constants, and more. The use of inconsistent naming styles between import and alias names may lead readers to expect an import to be of another type (e.g., confuse a Python class with a constant). Import aliases should thus follow the same naming style as the member being imported. Selected in the ruff config of the Python preset, with the pep8-naming rules (`constant-imported-as-non-constant`).
- **Allowed form:** Keep the alias in the case of the name it stands for (`import numpy as np`, `from lib import Widget as Wrapped`); the alias `F` is allowed. Use snake_case for a function or module alias.
- **Example of the allowed form:**

  ```python
  from example import CONSTANT_VALUE
  ```

- **Exception:** If this is intended, add `{"rule":"N811","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/constant-imported-as-non-constant/)

<a id="ruff-n812"></a>

### `ruff/N812`

Checks for lowercase imports that are aliased to non-lowercase names.

- **Why it is on:** PEP 8 recommends naming conventions for classes, functions, constants, and more. The use of inconsistent naming styles between import and alias names may lead readers to expect an import to be of another type (e.g., confuse a Python class with a constant). Import aliases should thus follow the same naming style as the member being imported. Selected in the ruff config of the Python preset, with the pep8-naming rules (`lowercase-imported-as-non-lowercase`).
- **Allowed form:** Keep the alias in the case of the name it stands for (`import numpy as np`, `from lib import Widget as Wrapped`); the alias `F` is allowed. Use snake_case for a function or module alias.
- **Example of the allowed form:**

  ```python
  from example import myclassname
  ```

- **Exception:** If this is intended, add `{"rule":"N812","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/lowercase-imported-as-non-lowercase/)

<a id="ruff-n813"></a>

### `ruff/N813`

Checks for `CamelCase` imports that are aliased to lowercase names.

- **Why it is on:** PEP 8 recommends naming conventions for classes, functions, constants, and more. The use of inconsistent naming styles between import and alias names may lead readers to expect an import to be of another type (e.g., confuse a Python class with a constant). Import aliases should thus follow the same naming style as the member being imported. Selected in the ruff config of the Python preset, with the pep8-naming rules (`camelcase-imported-as-lowercase`).
- **Allowed form:** Keep the alias in the case of the name it stands for (`import numpy as np`, `from lib import Widget as Wrapped`); the alias `F` is allowed. Use snake_case for a function or module alias.
- **Example of the allowed form:**

  ```python
  from example import MyClassName
  ```

- **Exception:** If this is intended, add `{"rule":"N813","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/camelcase-imported-as-lowercase/)

<a id="ruff-n814"></a>

### `ruff/N814`

Checks for `CamelCase` imports that are aliased to constant-style names.

- **Why it is on:** PEP 8 recommends naming conventions for classes, functions, constants, and more. The use of inconsistent naming styles between import and alias names may lead readers to expect an import to be of another type (e.g., confuse a Python class with a constant). Import aliases should thus follow the same naming style as the member being imported. Selected in the ruff config of the Python preset, with the pep8-naming rules (`camelcase-imported-as-constant`).
- **Allowed form:** Keep the alias in the case of the name it stands for (`import numpy as np`, `from lib import Widget as Wrapped`); the alias `F` is allowed. Use snake_case for a function or module alias.
- **Example of the allowed form:**

  ```python
  from example import MyClassName
  ```

- **Exception:** If this is intended, add `{"rule":"N814","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/camelcase-imported-as-constant/)

<a id="ruff-n815"></a>

### `ruff/N815`

Checks for class variable names that follow the `mixedCase` convention.

- **Why it is on:** PEP 8 recommends that variable names should be lower case and separated by underscores (also known as `snake_case`). > Function names should be lowercase, with words separated by underscores > as necessary to improve readability. > > Variable names follow the same convention as function names. > > mixedCase is allowed only in contexts where that’s already the > prevailing style (e.g. threading.py), to retain backwards compatibility. Selected in the ruff config of the Python preset, with the pep8-naming rules (`mixed-case-variable-in-class-scope`).
- **Allowed form:** Use snake_case for the name; in a pydantic model keep the Python name in snake_case and set the external name with `Field(alias="orderId")`.
- **Example of the allowed form:**

  ```python
  class MyClass:
      my_variable = "hello"
      another_variable = "world"
  ```

- **Exception:** If this is intended, add `{"rule":"N815","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/mixed-case-variable-in-class-scope/)

<a id="ruff-n816"></a>

### `ruff/N816`

Checks for global variable names that follow the `mixedCase` convention.

- **Why it is on:** PEP 8 recommends that global variable names should be lower case and separated by underscores (also known as `snake_case`). > ### Global Variable Names > (Let’s hope that these variables are meant for use inside one module > only.) The conventions are about the same as those for functions. > > Modules that are designed for use via `from M import *` should use the > `__all__` mechanism to prevent exporting globals, or use the older > convention of prefixing such globals with an underscore (which you might > want to do to indicate these globals are “module non-public”). > > ### Function and Variable Names > Function names should be lowercase, with words separated by underscores > as necessary to improve readability. > > Variable names follow the same convention as function names. > > mixedCase is allowed only in contexts where that’s already the prevailing > style (e.g. threading.py), to retain backwards compatibility. Selected in the ruff config of the Python preset, with the pep8-naming rules (`mixed-case-variable-in-global-scope`).
- **Allowed form:** Use snake_case for the name; in a pydantic model keep the Python name in snake_case and set the external name with `Field(alias="orderId")`.
- **Example of the allowed form:**

  ```python
  my_variable = "hello"
  another_variable = "world"
  yet_another_variable = "foo"
  ```

- **Exception:** If this is intended, add `{"rule":"N816","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/mixed-case-variable-in-global-scope/)

<a id="ruff-n817"></a>

### `ruff/N817`

Checks for `CamelCase` imports that are aliased as acronyms.

- **Why it is on:** PEP 8 recommends naming conventions for classes, functions, constants, and more. The use of inconsistent naming styles between import and alias names may lead readers to expect an import to be of another type (e.g., confuse a Python class with a constant). Import aliases should thus follow the same naming style as the member being imported. Selected in the ruff config of the Python preset, with the pep8-naming rules (`camelcase-imported-as-acronym`).
- **Allowed form:** Keep the alias in the case of the name it stands for (`import numpy as np`, `from lib import Widget as Wrapped`); the alias `F` is allowed. Use snake_case for a function or module alias.
- **Example of the allowed form:**

  ```python
  from example import MyClassName
  ```

- **Exception:** If this is intended, add `{"rule":"N817","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/camelcase-imported-as-acronym/)

<a id="ruff-n818"></a>

### `ruff/N818`

Checks for custom exception definitions that omit the `Error` suffix.

- **Why it is on:** The `Error` suffix is recommended by PEP 8: > Because exceptions should be classes, the class naming convention > applies here. However, you should use the suffix `"Error"` on your > exception names (if the exception actually is an error). Selected in the ruff config of the Python preset, with the pep8-naming rules (`error-suffix-on-exception-name`).
- **Allowed form:** Give an exception class the suffix `Error`: `OrderFailedError`; the rest of the name is `CapWords`, not snake_case.
- **Example of the allowed form:**

  ```python
  class ValidationError(Exception): ...
  ```

- **Exception:** If this is intended, add `{"rule":"N818","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/error-suffix-on-exception-name/)

<a id="ruff-n999"></a>

### `ruff/N999`

Checks for module names that do not follow the `snake_case` naming convention or are otherwise invalid.

- **Why it is on:** PEP 8 recommends the use of the `snake_case` naming convention for module names: > Modules should have short, all-lowercase names. Underscores can be used in the > module name if it improves readability. Python packages should also have short, > all-lowercase names, although the use of underscores is discouraged. > > When an extension module written in C or C++ has an accompanying Python module that > provides a higher level (e.g. more object-oriented) interface, the C/C++ module has > a leading underscore (e.g. `_socket`). Selected in the ruff config of the Python preset, with the pep8-naming rules (`invalid-module-name`).
- **Allowed form:** Name the module in lowercase snake_case, with no dashes or capitals.
- **Exception:** If this is intended, add `{"rule":"N999","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/invalid-module-name/)

<a id="ruff-perf101"></a>

### `ruff/PERF101`

Checks for explicit casts to `list` on for-loop iterables.

- **Why it is on:** Using a `list()` call to eagerly iterate over an already-iterable type (like a tuple, list, or set) is inefficient, as it forces Python to create a new list unnecessarily. Removing the `list()` call will not change the behavior of the code, but may improve performance. Selected in the ruff config of the Python preset, with the Perflint rules (`unnecessary-list-cast`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-list-cast/).
- **Example of the allowed form:**

  ```python
  items = (1, 2, 3)
  for i in items:
      print(i)
  ```

- **Exception:** If this is intended, add `{"rule":"PERF101","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-list-cast/)

<a id="ruff-perf102"></a>

### `ruff/PERF102`

Checks for uses of `dict.items()` that discard either the key or the value when iterating over the dictionary.

- **Why it is on:** If you only need the keys or values of a dictionary, you should use `dict.keys()` or `dict.values()` respectively, instead of `dict.items()`. These specialized methods are more efficient than `dict.items()`, as they avoid allocating tuples for every item in the dictionary. They also communicate the intent of the code more clearly. Note that, as with all `perflint` rules, this is only intended as a micro-optimization, and will have a negligible impact on performance in most cases. Selected in the ruff config of the Python preset, with the Perflint rules (`incorrect-dict-iterator`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/incorrect-dict-iterator/).
- **Example of the allowed form:**

  ```python
  obj = {"a": 1, "b": 2}
  for value in obj.values():
      print(value)
  ```

- **Exception:** If this is intended, add `{"rule":"PERF102","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/incorrect-dict-iterator/)

<a id="ruff-perf203"></a>

### `ruff/PERF203`

Checks for uses of except handling via `try`-`except` within `for` and `while` loops.

- **Why it is on:** Exception handling via `try`-`except` blocks incurs some performance overhead, regardless of whether an exception is raised. To optimize your code, two techniques are possible: 1. Refactor your code to put the entire loop into the `try`-`except` block, rather than wrapping each iteration in a separate `try`-`except` block. 2. Use "Look Before You Leap" idioms that attempt to avoid exceptions being raised in the first place, avoiding the need to use `try`-`except` blocks in the first place. Selected in the ruff config of the Python preset, with the Perflint rules (`try-except-in-loop`).
- **Allowed form:** Move the `try` out of the loop, or handle each item in a helper function.
- **Example of the allowed form:**

  ```python
  string_numbers: list[str] = ["1", "2", "three", "4", "5"]

  int_numbers: list[int] = []
  try:
      for num in string_numbers:
          int_numbers.append(int(num))
  except ValueError as e:
      print(f"Couldn't convert to integer: {e}")

  number_names: dict[int, str] = {1: "one", 3: "three", 4: "four"}
  for number in range(5):
      name = number_names.get(number)
      if name is not None:
          print(f"The name of {number} is {name}")
  ```

- **Exception:** If this is intended, add `{"rule":"PERF203","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/try-except-in-loop/)

<a id="ruff-perf401"></a>

### `ruff/PERF401`

Checks for `for` loops that can be replaced by a list comprehension.

- **Why it is on:** When creating a transformed list from an existing list using a for-loop, prefer a list comprehension. List comprehensions are more readable and more performant. Using the below as an example, the list comprehension is ~10% faster on Python 3.11, and ~25% faster on Python 3.10. Selected in the ruff config of the Python preset, with the Perflint rules (`manual-list-comprehension`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/manual-list-comprehension/).
- **Example of the allowed form:**

  ```python
  original = list(range(10000))
  filtered = [x for x in original if x % 2]
  ```

- **Exception:** If this is intended, add `{"rule":"PERF401","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/manual-list-comprehension/)

<a id="ruff-perf402"></a>

### `ruff/PERF402`

Checks for `for` loops that append every item of an iterable to a list, which can be replaced with a call to `list`.

- **Why it is on:** When populating a list from an iterable with a `for` loop, prefer `list` instead. The `list` call is more readable and more performant. For an existing list, you can also use `list.copy` instead of `list`. Using the below as an example, the `list`-based copy is ~2x faster on Python 3.11. Selected in the ruff config of the Python preset, with the Perflint rules (`manual-list-copy`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/manual-list-copy/).
- **Example of the allowed form:**

  ```python
  original = list(range(10000))
  filtered = list(original)
  ```

- **Exception:** If this is intended, add `{"rule":"PERF402","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/manual-list-copy/)

<a id="ruff-perf403"></a>

### `ruff/PERF403`

Checks for `for` loops that can be replaced by a dictionary comprehension.

- **Why it is on:** When creating or extending a dictionary in a for-loop, prefer a dictionary comprehension. Comprehensions are more readable and more performant. For example, when comparing `{x: x for x in list(range(1000))}` to the `for` loop version, the comprehension is ~10% faster on Python 3.11. Selected in the ruff config of the Python preset, with the Perflint rules (`manual-dict-comprehension`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/manual-dict-comprehension/).
- **Example of the allowed form:**

  ```python
  pairs = (("a", 1), ("b", 2))
  result = {x: y for x, y in pairs if y % 2}
  ```

- **Exception:** If this is intended, add `{"rule":"PERF403","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/manual-dict-comprehension/)

<a id="ruff-pie790"></a>

### `ruff/PIE790`

Checks for unnecessary `pass` statements and ellipsis (`...`) literals in functions, classes, and other blocks.

- **Why it is on:** In Python, the `pass` statement and ellipsis (`...`) literal serve as placeholders, allowing for syntactically correct empty code blocks. The primary purpose of these nodes is to avoid syntax errors in situations where a statement or expression is syntactically required, but no code needs to be executed. If a `pass` or ellipsis is present in a code block that includes at least one other statement (even, e.g., a docstring), it is unnecessary and should be removed. Selected in the ruff config of the Python preset, with the flake8-pie rules (`unnecessary-placeholder`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-placeholder/).
- **Example of the allowed form:**

  ```python
  def func():
      """Placeholder docstring."""
  ```

- **Exception:** If this is intended, add `{"rule":"PIE790","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-placeholder/)

<a id="ruff-pie794"></a>

### `ruff/PIE794`

Checks for duplicate field definitions in classes.

- **Why it is on:** Defining a field multiple times in a class body is redundant and likely a mistake. Selected in the ruff config of the Python preset, with the flake8-pie rules (`duplicate-class-field-definition`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/duplicate-class-field-definition/).
- **Example of the allowed form:**

  ```python
  class Person:
      name = Tom
      ...
  ```

- **Exception:** If this is intended, add `{"rule":"PIE794","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/duplicate-class-field-definition/)

<a id="ruff-pie796"></a>

### `ruff/PIE796`

Checks for enums that contain duplicate values.

- **Why it is on:** Enum values should be unique. Non-unique values are redundant and likely a mistake. Selected in the ruff config of the Python preset, with the flake8-pie rules (`non-unique-enums`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/non-unique-enums/).
- **Example of the allowed form:**

  ```python
  from enum import Enum


  class Foo(Enum):
      A = 1
      B = 2
      C = 3
  ```

- **Exception:** If this is intended, add `{"rule":"PIE796","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/non-unique-enums/)

<a id="ruff-pie800"></a>

### `ruff/PIE800`

Checks for unnecessary dictionary unpacking operators (`**`).

- **Why it is on:** Unpacking a dictionary into another dictionary is redundant. The unpacking operator can be removed, making the code more readable. Selected in the ruff config of the Python preset, with the flake8-pie rules (`unnecessary-spread`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-spread/).
- **Example of the allowed form:**

  ```python
  foo = {"A": 1, "B": 2}
  bar = {**foo, "C": 3}
  ```

- **Exception:** If this is intended, add `{"rule":"PIE800","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-spread/)

<a id="ruff-pie804"></a>

### `ruff/PIE804`

Checks for unnecessary `dict` kwargs.

- **Why it is on:** If the `dict` keys are valid identifiers, they can be passed as keyword arguments directly, without constructing unnecessary dictionary. This also makes code more type-safe as type checkers often cannot precisely verify dynamic keyword arguments. Selected in the ruff config of the Python preset, with the flake8-pie rules (`unnecessary-dict-kwargs`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-dict-kwargs/).
- **Example of the allowed form:**

  ```python
  def foo(bar):
      return bar + 1


  print(foo(bar=2))  # prints 3

  # Typing error detected: No parameter named "baz".
  print(foo(bar=2, baz=3))
  ```

- **Exception:** If this is intended, add `{"rule":"PIE804","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-dict-kwargs/)

<a id="ruff-pie807"></a>

### `ruff/PIE807`

Checks for lambdas that can be replaced with the `list` or `dict` builtins.

- **Why it is on:** Using container builtins are more succinct and idiomatic than wrapping the literal in a lambda. Selected in the ruff config of the Python preset, with the flake8-pie rules (`reimplemented-container-builtin`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/reimplemented-container-builtin/).
- **Example of the allowed form:**

  ```python
  from dataclasses import dataclass, field


  @dataclass
  class Foo:
      bar: list[int] = field(default_factory=list)
      baz: dict[str, int] = field(default_factory=dict)
  ```

- **Exception:** If this is intended, add `{"rule":"PIE807","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/reimplemented-container-builtin/)

<a id="ruff-pie808"></a>

### `ruff/PIE808`

Checks for `range` calls with an unnecessary `start` argument.

- **Why it is on:** `range(0, x)` is equivalent to `range(x)`, as `0` is the default value for the `start` argument. Omitting the `start` argument makes the code more concise and idiomatic. Selected in the ruff config of the Python preset, with the flake8-pie rules (`unnecessary-range-start`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-range-start/).
- **Example of the allowed form:**

  ```python
  range(3)
  ```

- **Exception:** If this is intended, add `{"rule":"PIE808","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-range-start/)

<a id="ruff-pie810"></a>

### `ruff/PIE810`

Checks for `startswith` or `endswith` calls on the same value with different prefixes or suffixes.

- **Why it is on:** The `startswith` and `endswith` methods accept tuples of prefixes or suffixes respectively. Passing a tuple of prefixes or suffixes is more efficient and readable than calling the method multiple times. Selected in the ruff config of the Python preset, with the flake8-pie rules (`multiple-starts-ends-with`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/multiple-starts-ends-with/).
- **Example of the allowed form:**

  ```python
  msg = "Hello, world!"
  if msg.startswith(("Hello", "Hi")):
      print("Greetings!")
  ```

- **Exception:** If this is intended, add `{"rule":"PIE810","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/multiple-starts-ends-with/)

<a id="ruff-plr2004"></a>

### `ruff/PLR2004`

Checks for the use of unnamed numerical constants ("magic") values in comparisons.

- **Why it is on:** The use of "magic" values can make code harder to read and maintain, as readers will have to infer the meaning of the value from the context. Such values are discouraged by PEP 8. For convenience, this rule excludes a variety of common values from the "magic" value definition, such as `0`, `1`, `""`, and `"__main__"`. It also exempts comparisons against `sys.version`, `sys.version_info`, and `sys.implementation.version`. Selected in the ruff config of the Python preset, with the Pylint rules (`magic-value-comparison`).
- **Allowed form:** Name the value as a constant: `MAX_RETRIES = 3`, then compare with `MAX_RETRIES`; compare an HTTP status with a member of `http.HTTPStatus` (`HTTPStatus.NOT_FOUND`). -1, 0, 1, 2, 10, 100 and 1000 are allowed.
- **Example of the allowed form:**

  ```python
  MAX_DISCOUNT = 100


  def apply_discount(price: float) -> float:
      if price <= MAX_DISCOUNT:
          return price / 2
      else:
          return price
  ```

- **Exception:** If this is intended, add `{"rule":"PLR2004","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/magic-value-comparison/)

<a id="ruff-plw0602"></a>

### `ruff/PLW0602`

Checks for `global` variables that are not assigned a value in the current scope.

- **Why it is on:** The `global` keyword allows an inner scope to modify a variable declared in the outer scope. If the variable is not modified within the inner scope, there is no need to use `global`. Selected in the ruff config of the Python preset, with the Pylint rules (`global-variable-not-assigned`).
- **Allowed form:** Remove the `global` statement; a function reads a module name without declaring it.
- **Example of the allowed form:**

  ```python
  DEBUG = True


  def foo():
      if DEBUG:
          print("foo() called")
      ...
  ```

- **Exception:** If this is intended, add `{"rule":"PLW0602","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/global-variable-not-assigned/)

<a id="ruff-plw0603"></a>

### `ruff/PLW0603`

Checks for the use of `global` statements to update identifiers.

- **Why it is on:** Pylint discourages the use of `global` variables as global mutable state is a common source of bugs and confusing behavior. Selected in the ruff config of the Python preset, with the Pylint rules (`global-statement`).
- **Allowed form:** Do not rebind a module name: pass the state in and return the new value, hold it in an object created in the composition root, or use `functools.cache` for a value created on first use.
- **Example of the allowed form:**

  ```python
  var = 1


  def foo():
      var = 10
      print(var)
      return var


  var = foo()
  print(var)
  ```

- **Exception:** If this is intended, add `{"rule":"PLW0603","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/global-statement/)

<a id="ruff-pt001"></a>

### `ruff/PT001`

Checks for argument-free `@pytest.fixture()` decorators with or without parentheses, depending on the `lint.flake8-pytest-style.fixture-parentheses` setting.

- **Why it is on:** If a `@pytest.fixture()` doesn't take any arguments, the parentheses are optional. Either removing those unnecessary parentheses or requiring them for all fixtures is fine, but it's best to be consistent. The rule defaults to removing unnecessary parentheses, to match the documentation of the official pytest projects. Selected in the ruff config of the Python preset, with the flake8-pytest-style rules (`pytest-fixture-incorrect-parentheses-style`).
- **Allowed form:** Write the decorator without parentheses: `@pytest.fixture`, `@pytest.mark.slow`.
- **Example of the allowed form:**

  ```python
  import pytest


  @pytest.fixture
  def my_fixture(): ...
  ```

- **Exception:** If this is intended, add `{"rule":"PT001","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/pytest-fixture-incorrect-parentheses-style/)

<a id="ruff-pt002"></a>

### `ruff/PT002`

Checks for `pytest.fixture` calls with positional arguments.

- **Why it is on:** For clarity and consistency, prefer using keyword arguments to specify fixture configuration. Selected in the ruff config of the Python preset, with the flake8-pytest-style rules (`pytest-fixture-positional-args`).
- **Allowed form:** Pass the fixture options by keyword: `@pytest.fixture(scope="session")`.
- **Example of the allowed form:**

  ```python
  import pytest


  @pytest.fixture(scope="module")
  def my_fixture(): ...
  ```

- **Exception:** If this is intended, add `{"rule":"PT002","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/pytest-fixture-positional-args/)

<a id="ruff-pt003"></a>

### `ruff/PT003`

Checks for `pytest.fixture` calls with `scope="function"`.

- **Why it is on:** `scope="function"` can be omitted, as it is the default. Selected in the ruff config of the Python preset, with the flake8-pytest-style rules (`pytest-extraneous-scope-function`).
- **Allowed form:** Drop `scope="function"`; it is the default scope of a fixture.
- **Example of the allowed form:**

  ```python
  import pytest


  @pytest.fixture()
  def my_fixture(): ...
  ```

- **Exception:** If this is intended, add `{"rule":"PT003","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/pytest-extraneous-scope-function/)

<a id="ruff-pt006"></a>

### `ruff/PT006`

Checks for the type of parameter names passed to `pytest.mark.parametrize`.

- **Why it is on:** The `argnames` argument of `pytest.mark.parametrize` takes a string or a sequence of strings. For a single parameter, it's preferable to use a string. For multiple parameters, it's preferable to use the style configured via the `lint.flake8-pytest-style.parametrize-names-type` setting. Selected in the ruff config of the Python preset, with the flake8-pytest-style rules (`pytest-parametrize-names-wrong-type`).
- **Allowed form:** Pass the names as a tuple: `@pytest.mark.parametrize(("a", "b"), [(1, 2)])`.
- **Example of the allowed form:**

  ```python
  import pytest


  @pytest.mark.parametrize("param", [1, 2, 3])
  def test_foo(param): ...


  @pytest.mark.parametrize(("param1", "param2"), [(1, 2), (3, 4)])
  def test_bar(param1, param2): ...
  ```

- **Exception:** If this is intended, add `{"rule":"PT006","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/pytest-parametrize-names-wrong-type/)

<a id="ruff-pt007"></a>

### `ruff/PT007`

Checks for the type of parameter values passed to `pytest.mark.parametrize`.

- **Why it is on:** The `argvalues` argument of `pytest.mark.parametrize` takes an iterator of parameter values, which can be provided as lists or tuples. To aid in readability, it's recommended to use a consistent style for the list of values rows, and, in the case of multiple parameters, for each row of values. Selected in the ruff config of the Python preset, with the flake8-pytest-style rules (`pytest-parametrize-values-wrong-type`).
- **Allowed form:** Pass the values as a list of tuples: `[(1, 2), (3, 4)]`, or a list for one name.
- **Example of the allowed form:**

  ```python
  import pytest


  @pytest.mark.parametrize("param", [1, 2, 3])
  def test_foo(param): ...


  @pytest.mark.parametrize(("param1", "param2"), [(1, 2), (3, 4)])
  def test_bar(param1, param2): ...
  ```

- **Exception:** If this is intended, add `{"rule":"PT007","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/pytest-parametrize-values-wrong-type/)

<a id="ruff-pt008"></a>

### `ruff/PT008`

Checks for mocked calls that use a dummy `lambda` function instead of `return_value`.

- **Why it is on:** When patching calls, an explicit `return_value` better conveys the intent than a `lambda` function, assuming the `lambda` does not use the arguments passed to it. `return_value` is also robust to changes in the patched function's signature, and enables additional assertions to verify behavior. For example, `return_value` allows for verification of the number of calls or the arguments passed to the patched function via `assert_called_once_with` and related methods. Selected in the ruff config of the Python preset, with the flake8-pytest-style rules (`pytest-patch-with-lambda`).
- **Allowed form:** Patch with `return_value=...`, or `mocker.patch(target, new=...)`, not a lambda.
- **Example of the allowed form:**

  ```python
  def test_foo(mocker):
      mocker.patch("module.target", return_value=7)

      # If the lambda makes use of the arguments, no diagnostic is emitted.
      mocker.patch("module.other_target", lambda x, y: x)
  ```

- **Exception:** If this is intended, add `{"rule":"PT008","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/pytest-patch-with-lambda/)

<a id="ruff-pt010"></a>

### `ruff/PT010`

Checks for `pytest.raises` calls without an expected exception.

- **Why it is on:** `pytest.raises` expects to receive an expected exception as its first argument. If omitted, the `pytest.raises` call will fail at runtime. The rule will also accept calls without an expected exception but with `match` and/or `check` keyword arguments, which are also valid after pytest version 8.4.0. Selected in the ruff config of the Python preset, with the flake8-pytest-style rules (`pytest-raises-without-exception`).
- **Allowed form:** Name the expected exception: `with pytest.raises(ValueError, match="invalid"):`.
- **Example of the allowed form:**

  ```python
  import pytest


  def test_foo():
      with pytest.raises(SomeException):
          do_something()
  ```

- **Exception:** If this is intended, add `{"rule":"PT010","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/pytest-raises-without-exception/)

<a id="ruff-pt011"></a>

### `ruff/PT011`

Checks for `pytest.raises` calls without a `match` or `check` parameter.

- **Why it is on:** `pytest.raises(Error)` will catch any `Error` and may catch errors that are unrelated to the code under test. To avoid this, `pytest.raises` should be called with a `match` parameter (to constrain the exception message) or a `check` parameter (to constrain the exception itself). The exception names that require a `match` or `check` parameter can be configured via the `lint.flake8-pytest-style.raises-require-match-for` and `lint.flake8-pytest-style.raises-extend-require-match-for` settings. Selected in the ruff config of the Python preset, with the flake8-pytest-style rules (`pytest-raises-too-broad`).
- **Allowed form:** Match the message: `with pytest.raises(ValueError, match="invalid"):`, or raise a more specific exception.
- **Example of the allowed form:**

  ```python
  import pytest


  def test_foo():
      with pytest.raises(ValueError, match="expected message"):
          ...
  ```

- **Exception:** If this is intended, add `{"rule":"PT011","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/pytest-raises-too-broad/)

<a id="ruff-pt012"></a>

### `ruff/PT012`

Checks for `pytest.raises` context managers with multiple statements.

- **Why it is on:** When a `pytest.raises` is used as a context manager and contains multiple statements, it can lead to the test passing when it actually should fail. A `pytest.raises` context manager should only contain a single simple statement that raises the expected exception. Selected in the ruff config of the Python preset, with the flake8-pytest-style rules (`pytest-raises-with-multiple-statements`).
- **Allowed form:** Keep one statement in the `pytest.raises` block, the call that raises; build the arguments before it.
- **Example of the allowed form:**

  ```python
  import pytest


  def test_foo():
      setup()
      with pytest.raises(MyError):
          func_to_test()
      assert foo()
  ```

- **Exception:** If this is intended, add `{"rule":"PT012","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/pytest-raises-with-multiple-statements/)

<a id="ruff-pt013"></a>

### `ruff/PT013`

Checks for incorrect import of pytest.

- **Why it is on:** For consistency, `pytest` should be imported as `import pytest` and its members should be accessed in the form of `pytest.xxx.yyy` for consistency Selected in the ruff config of the Python preset, with the flake8-pytest-style rules (`pytest-incorrect-pytest-import`).
- **Allowed form:** Import pytest as a module: `import pytest`, then `pytest.raises(...)`.
- **Example of the allowed form:**

  ```python
  import pytest
  ```

- **Exception:** If this is intended, add `{"rule":"PT013","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/pytest-incorrect-pytest-import/)

<a id="ruff-pt014"></a>

### `ruff/PT014`

Checks for duplicate test cases in `pytest.mark.parametrize`.

- **Why it is on:** Duplicate test cases are redundant and should be removed. Selected in the ruff config of the Python preset, with the flake8-pytest-style rules (`pytest-duplicate-parametrize-test-cases`).
- **Allowed form:** List each parametrize case once.
- **Example of the allowed form:**

  ```python
  import pytest


  @pytest.mark.parametrize(
      ("param1", "param2"),
      [
          (1, 2),
      ],
  )
  def test_foo(param1, param2): ...
  ```

- **Exception:** If this is intended, add `{"rule":"PT014","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/pytest-duplicate-parametrize-test-cases/)

<a id="ruff-pt015"></a>

### `ruff/PT015`

Checks for `assert` statements whose test expression is a falsy value.

- **Why it is on:** `pytest.fail` conveys the intent more clearly than `assert falsy_value`. Selected in the ruff config of the Python preset, with the flake8-pytest-style rules (`pytest-assert-always-false`).
- **Allowed form:** Fail with a message: `pytest.fail("the reason")`.
- **Example of the allowed form:**

  ```python
  import pytest


  def test_foo():
      if some_condition:
          pytest.fail("some_condition was True")
      ...
  ```

- **Exception:** If this is intended, add `{"rule":"PT015","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/pytest-assert-always-false/)

<a id="ruff-pt016"></a>

### `ruff/PT016`

Checks for `pytest.fail` calls without a message.

- **Why it is on:** `pytest.fail` calls without a message make it harder to understand and debug test failures. Selected in the ruff config of the Python preset, with the flake8-pytest-style rules (`pytest-fail-without-message`).
- **Allowed form:** Fail with a message: `pytest.fail("the reason")`.
- **Example of the allowed form:**

  ```python
  import pytest


  def test_foo():
      pytest.fail("...")


  def test_bar():
      pytest.fail(reason="...")
  ```

- **Exception:** If this is intended, add `{"rule":"PT016","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/pytest-fail-without-message/)

<a id="ruff-pt017"></a>

### `ruff/PT017`

Checks for `assert` statements in `except` clauses.

- **Why it is on:** When testing for exceptions, `pytest.raises()` should be used instead of `assert` statements in `except` clauses, as it's more explicit and idiomatic. Further, `pytest.raises()` will fail if the exception is not raised, unlike the `assert` statement. Selected in the ruff config of the Python preset, with the flake8-pytest-style rules (`pytest-assert-in-except`).
- **Allowed form:** Assert on the exception with `with pytest.raises(ValueError) as caught:`, then `assert "x" in str(caught.value)`.
- **Example of the allowed form:**

  ```python
  import pytest


  def test_foo():
      with pytest.raises(ZeroDivisionError) as exc_info:
          1 / 0
      assert exc_info.value.args
  ```

- **Exception:** If this is intended, add `{"rule":"PT017","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/pytest-assert-in-except/)

<a id="ruff-pt018"></a>

### `ruff/PT018`

Checks for assertions that combine multiple independent conditions.

- **Why it is on:** Composite assertion statements are harder to debug upon failure, as the failure message will not indicate which condition failed. Selected in the ruff config of the Python preset, with the flake8-pytest-style rules (`pytest-composite-assertion`).
- **Allowed form:** Split the assertion in two: `assert a` and `assert b`, one condition each.
- **Example of the allowed form:**

  ```python
  def test_foo():
      assert something
      assert something_else


  def test_bar():
      assert not something
      assert not something_else
  ```

- **Exception:** If this is intended, add `{"rule":"PT018","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/pytest-composite-assertion/)

<a id="ruff-pt019"></a>

### `ruff/PT019`

Checks for `pytest` test functions that should be decorated with `@pytest.mark.usefixtures`.

- **Why it is on:** In `pytest`, fixture injection is used to activate fixtures in a test function. Fixtures can be injected either by passing them as parameters to the test function, or by using the `@pytest.mark.usefixtures` decorator. Selected in the ruff config of the Python preset, with the flake8-pytest-style rules (`pytest-fixture-param-without-value`).
- **Allowed form:** Use `@pytest.mark.usefixtures("name")` for a fixture whose value the test does not use.
- **Example of the allowed form:**

  ```python
  import pytest


  @pytest.fixture
  def _patch_something(): ...


  @pytest.mark.usefixtures("_patch_something")
  def test_foo(): ...
  ```

- **Exception:** If this is intended, add `{"rule":"PT019","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/pytest-fixture-param-without-value/)

<a id="ruff-pt020"></a>

### `ruff/PT020`

Checks for `pytest.yield_fixture` usage.

- **Why it is on:** `pytest.fixture` has supported `yield` since pytest 3.0, which left `pytest.yield_fixture` as a plain alias for it. The alias has been deprecated since pytest 6.2, now raises a `PytestRemovedIn10Warning`, and will be removed in pytest 10. The two are the same function, so switching to `pytest.fixture` is a rename with no other consequence. Selected in the ruff config of the Python preset, with the flake8-pytest-style rules (`pytest-deprecated-yield-fixture`).
- **Allowed form:** Declare the fixture with `@pytest.fixture`; `yield_fixture` is deprecated.
- **Example of the allowed form:**

  ```python
  import pytest


  @pytest.fixture()
  def my_fixture():
      obj = SomeClass()
      yield obj
      obj.cleanup()
  ```

- **Exception:** If this is intended, add `{"rule":"PT020","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/pytest-deprecated-yield-fixture/)

<a id="ruff-pt021"></a>

### `ruff/PT021`

Checks for unnecessary `request.addfinalizer` usages in `pytest` fixtures.

- **Why it is on:** `pytest` offers two ways to perform cleanup in fixture code. The first is sequential (via the `yield` statement), the second callback-based (via `request.addfinalizer`). The sequential approach is more readable and should be preferred, unless the fixture uses the "factory as fixture" pattern. Selected in the ruff config of the Python preset, with the flake8-pytest-style rules (`pytest-fixture-finalizer-callback`).
- **Allowed form:** Clean up after a `yield` in the fixture instead of `request.addfinalizer`.
- **Example of the allowed form:**

  ```python
  import pytest


  @pytest.fixture()
  def my_fixture():
      resource = acquire_resource()
      yield resource
      resource.release()


  # "factory-as-fixture" pattern
  @pytest.fixture()
  def my_factory(request):
      def create_resource(arg):
          resource = acquire_resource(arg)
          request.addfinalizer(resource.release)
          return resource

      return create_resource
  ```

- **Exception:** If this is intended, add `{"rule":"PT021","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/pytest-fixture-finalizer-callback/)

<a id="ruff-pt022"></a>

### `ruff/PT022`

Checks for unnecessary `yield` expressions in `pytest` fixtures.

- **Why it is on:** In `pytest` fixtures, the `yield` expression should only be used for fixtures that include teardown code, to clean up the fixture after the test function has finished executing. Selected in the ruff config of the Python preset, with the flake8-pytest-style rules (`pytest-useless-yield-fixture`).
- **Allowed form:** Use `return` in a fixture that has no teardown.
- **Example of the allowed form:**

  ```python
  import pytest


  @pytest.fixture()
  def my_fixture_with_teardown():
      resource = acquire_resource()
      yield resource
      resource.release()


  @pytest.fixture()
  def my_fixture_without_teardown():
      resource = acquire_resource()
      return resource
  ```

- **Exception:** If this is intended, add `{"rule":"PT022","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/pytest-useless-yield-fixture/)

<a id="ruff-pt023"></a>

### `ruff/PT023`

Checks for argument-free `@pytest.mark.<marker>()` decorators with or without parentheses, depending on the `lint.flake8-pytest-style.mark-parentheses` setting.

- **Why it is on:** If a `@pytest.mark.<marker>()` doesn't take any arguments, the parentheses are optional. Either removing those unnecessary parentheses or requiring them for all fixtures is fine, but it's best to be consistent. Selected in the ruff config of the Python preset, with the flake8-pytest-style rules (`pytest-incorrect-mark-parentheses-style`).
- **Allowed form:** Write the decorator without parentheses: `@pytest.fixture`, `@pytest.mark.slow`.
- **Example of the allowed form:**

  ```python
  import pytest


  @pytest.mark.foo
  def test_something(): ...
  ```

- **Exception:** If this is intended, add `{"rule":"PT023","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/pytest-incorrect-mark-parentheses-style/)

<a id="ruff-pt024"></a>

### `ruff/PT024`

Checks for unnecessary `@pytest.mark.asyncio` decorators applied to fixtures.

- **Why it is on:** `pytest.mark.asyncio` is unnecessary for fixtures. Selected in the ruff config of the Python preset, with the flake8-pytest-style rules (`pytest-unnecessary-asyncio-mark-on-fixture`).
- **Allowed form:** Remove `@pytest.mark.asyncio` from the fixture; the fixture decorator is enough.
- **Example of the allowed form:**

  ```python
  import pytest


  @pytest.fixture()
  async def my_fixture():
      return 0
  ```

- **Exception:** If this is intended, add `{"rule":"PT024","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/pytest-unnecessary-asyncio-mark-on-fixture/)

<a id="ruff-pt025"></a>

### `ruff/PT025`

Checks for `pytest.mark.usefixtures` decorators applied to `pytest` fixtures.

- **Why it is on:** The `pytest.mark.usefixtures` decorator has no effect on `pytest` fixtures. Selected in the ruff config of the Python preset, with the flake8-pytest-style rules (`pytest-erroneous-use-fixtures-on-fixture`).
- **Allowed form:** Request the fixtures as parameters of the fixture; `usefixtures` has no effect on a fixture.
- **Example of the allowed form:**

  ```python
  import pytest


  @pytest.fixture()
  def a():
      pass


  @pytest.fixture()
  def b(a):
      pass
  ```

- **Exception:** If this is intended, add `{"rule":"PT025","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/pytest-erroneous-use-fixtures-on-fixture/)

<a id="ruff-pt026"></a>

### `ruff/PT026`

Checks for `@pytest.mark.usefixtures()` decorators that aren't passed any arguments.

- **Why it is on:** A `@pytest.mark.usefixtures()` decorator that isn't passed any arguments is useless and should be removed. Selected in the ruff config of the Python preset, with the flake8-pytest-style rules (`pytest-use-fixtures-without-parameters`).
- **Allowed form:** Name the fixtures: `@pytest.mark.usefixtures("database")`, or remove the mark.
- **Example of the allowed form:**

  ```python
  def test_something(): ...
  ```

- **Exception:** If this is intended, add `{"rule":"PT026","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/pytest-use-fixtures-without-parameters/)

<a id="ruff-pt028"></a>

### `ruff/PT028`

Checks for parameters of test functions with default arguments.

- **Why it is on:** Such a parameter will always have the default value during the test regardless of whether a fixture with the same name is defined. Selected in the ruff config of the Python preset, with the flake8-pytest-style rules (`pytest-parameter-with-default-argument`).
- **Allowed form:** Remove the default value from the test parameter; parametrize or a fixture supplies it.
- **Example of the allowed form:**

  ```python
  def test_foo(a): ...
  ```

- **Exception:** If this is intended, add `{"rule":"PT028","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/pytest-parameter-with-default-argument/)

<a id="ruff-pt030"></a>

### `ruff/PT030`

Checks for `pytest.warns` calls without a `match` parameter.

- **Why it is on:** `pytest.warns(Warning)` will catch any `Warning` and may catch warnings that are unrelated to the code under test. To avoid this, `pytest.warns` should be called with a `match` parameter. The warning names that require a `match` parameter can be configured via the `lint.flake8-pytest-style.warns-require-match-for` and `lint.flake8-pytest-style.warns-extend-require-match-for` settings. Selected in the ruff config of the Python preset, with the flake8-pytest-style rules (`pytest-warns-too-broad`).
- **Allowed form:** Match the message: `with pytest.warns(UserWarning, match="deprecated"):`, or name a more specific warning class.
- **Example of the allowed form:**

  ```python
  import pytest


  def test_foo():
      with pytest.warns(Warning, match="expected message"):
          ...
  ```

- **Exception:** If this is intended, add `{"rule":"PT030","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/pytest-warns-too-broad/)

<a id="ruff-pt031"></a>

### `ruff/PT031`

Checks for `pytest.warns` context managers with multiple statements.

- **Why it is on:** When `pytest.warns` is used as a context manager and contains multiple statements, it can lead to the test passing when it should instead fail. A `pytest.warns` context manager should only contain a single simple statement that triggers the expected warning. Selected in the ruff config of the Python preset, with the flake8-pytest-style rules (`pytest-warns-with-multiple-statements`).
- **Allowed form:** Keep one statement in the `pytest.warns` block, the call that warns; build the arguments before it.
- **Example of the allowed form:**

  ```python
  import pytest


  def test_foo_warns():
      setup()
      with pytest.warns(Warning):
          foo()
  ```

- **Exception:** If this is intended, add `{"rule":"PT031","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/pytest-warns-with-multiple-statements/)

<a id="ruff-pth100"></a>

### `ruff/PTH100`

Checks for uses of `os.path.abspath`.

- **Why it is on:** `pathlib` offers a high-level API for path manipulation, as compared to the lower-level API offered by `os.path`. When possible, using `Path` object methods such as `Path.resolve()` can improve readability over the `os.path` module's counterparts (e.g., `os.path.abspath()`). Selected in the ruff config of the Python preset, with the flake8-use-pathlib rules (`os-path-abspath`).
- **Allowed form:** Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.
- **Example of the allowed form:**

  ```python
  from pathlib import Path

  file_path = Path("../path/to/file").resolve()
  ```

- **Exception:** If this is intended, add `{"rule":"PTH100","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/os-path-abspath/)

<a id="ruff-pth101"></a>

### `ruff/PTH101`

Checks for uses of `os.chmod`.

- **Why it is on:** `pathlib` offers a high-level API for path manipulation, as compared to the lower-level API offered by `os`. When possible, using `Path` object methods such as `Path.chmod()` can improve readability over the `os` module's counterparts (e.g., `os.chmod()`). Selected in the ruff config of the Python preset, with the flake8-use-pathlib rules (`os-chmod`).
- **Allowed form:** Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.
- **Example of the allowed form:**

  ```python
  from pathlib import Path

  Path("file.py").chmod(0o444)
  ```

- **Exception:** If this is intended, add `{"rule":"PTH101","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/os-chmod/)

<a id="ruff-pth102"></a>

### `ruff/PTH102`

Checks for uses of `os.mkdir`.

- **Why it is on:** `pathlib` offers a high-level API for path manipulation, as compared to the lower-level API offered by `os`. When possible, using `Path` object methods such as `Path.mkdir()` can improve readability over the `os` module's counterparts (e.g., `os.mkdir()`). Selected in the ruff config of the Python preset, with the flake8-use-pathlib rules (`os-mkdir`).
- **Allowed form:** Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.
- **Example of the allowed form:**

  ```python
  from pathlib import Path

  Path("./directory/").mkdir()
  ```

- **Exception:** If this is intended, add `{"rule":"PTH102","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/os-mkdir/)

<a id="ruff-pth103"></a>

### `ruff/PTH103`

Checks for uses of `os.makedirs`.

- **Why it is on:** `pathlib` offers a high-level API for path manipulation, as compared to the lower-level API offered by `os`. When possible, using `Path` object methods such as `Path.mkdir(parents=True)` can improve readability over the `os` module's counterparts (e.g., `os.makedirs()`. Selected in the ruff config of the Python preset, with the flake8-use-pathlib rules (`os-makedirs`).
- **Allowed form:** Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.
- **Example of the allowed form:**

  ```python
  from pathlib import Path

  Path("./nested/directory/").mkdir(parents=True)
  ```

- **Exception:** If this is intended, add `{"rule":"PTH103","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/os-makedirs/)

<a id="ruff-pth104"></a>

### `ruff/PTH104`

Checks for uses of `os.rename`.

- **Why it is on:** `pathlib` offers a high-level API for path manipulation, as compared to the lower-level API offered by `os`. When possible, using `Path` object methods such as `Path.rename()` can improve readability over the `os` module's counterparts (e.g., `os.rename()`). Selected in the ruff config of the Python preset, with the flake8-use-pathlib rules (`os-rename`).
- **Allowed form:** Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.
- **Example of the allowed form:**

  ```python
  from pathlib import Path

  Path("old.py").rename("new.py")
  ```

- **Exception:** If this is intended, add `{"rule":"PTH104","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/os-rename/)

<a id="ruff-pth105"></a>

### `ruff/PTH105`

Checks for uses of `os.replace`.

- **Why it is on:** `pathlib` offers a high-level API for path manipulation, as compared to the lower-level API offered by `os`. When possible, using `Path` object methods such as `Path.replace()` can improve readability over the `os` module's counterparts (e.g., `os.replace()`). Note that `os` functions may be preferable if performance is a concern, e.g., in hot loops. Selected in the ruff config of the Python preset, with the flake8-use-pathlib rules (`os-replace`).
- **Allowed form:** Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.
- **Example of the allowed form:**

  ```python
  from pathlib import Path

  Path("old.py").replace("new.py")
  ```

- **Exception:** If this is intended, add `{"rule":"PTH105","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/os-replace/)

<a id="ruff-pth106"></a>

### `ruff/PTH106`

Checks for uses of `os.rmdir`.

- **Why it is on:** `pathlib` offers a high-level API for path manipulation, as compared to the lower-level API offered by `os`. When possible, using `Path` object methods such as `Path.rmdir()` can improve readability over the `os` module's counterparts (e.g., `os.rmdir()`). Selected in the ruff config of the Python preset, with the flake8-use-pathlib rules (`os-rmdir`).
- **Allowed form:** Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.
- **Example of the allowed form:**

  ```python
  from pathlib import Path

  Path("folder/").rmdir()
  ```

- **Exception:** If this is intended, add `{"rule":"PTH106","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/os-rmdir/)

<a id="ruff-pth107"></a>

### `ruff/PTH107`

Checks for uses of `os.remove`.

- **Why it is on:** `pathlib` offers a high-level API for path manipulation, as compared to the lower-level API offered by `os`. When possible, using `Path` object methods such as `Path.unlink()` can improve readability over the `os` module's counterparts (e.g., `os.remove()`). Selected in the ruff config of the Python preset, with the flake8-use-pathlib rules (`os-remove`).
- **Allowed form:** Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.
- **Example of the allowed form:**

  ```python
  from pathlib import Path

  Path("file.py").unlink()
  ```

- **Exception:** If this is intended, add `{"rule":"PTH107","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/os-remove/)

<a id="ruff-pth108"></a>

### `ruff/PTH108`

Checks for uses of `os.unlink`.

- **Why it is on:** `pathlib` offers a high-level API for path manipulation, as compared to the lower-level API offered by `os`. When possible, using `Path` object methods such as `Path.unlink()` can improve readability over the `os` module's counterparts (e.g., `os.unlink()`). Selected in the ruff config of the Python preset, with the flake8-use-pathlib rules (`os-unlink`).
- **Allowed form:** Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.
- **Example of the allowed form:**

  ```python
  from pathlib import Path

  Path("file.py").unlink()
  ```

- **Exception:** If this is intended, add `{"rule":"PTH108","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/os-unlink/)

<a id="ruff-pth109"></a>

### `ruff/PTH109`

Checks for uses of `os.getcwd` and `os.getcwdb`.

- **Why it is on:** `pathlib` offers a high-level API for path manipulation, as compared to the lower-level API offered by `os`. When possible, using `Path` object methods such as `Path.cwd()` can improve readability over the `os` module's counterparts (e.g., `os.getcwd()`). Selected in the ruff config of the Python preset, with the flake8-use-pathlib rules (`os-getcwd`).
- **Allowed form:** Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.
- **Example of the allowed form:**

  ```python
  from pathlib import Path

  cwd = Path.cwd()
  ```

- **Exception:** If this is intended, add `{"rule":"PTH109","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/os-getcwd/)

<a id="ruff-pth110"></a>

### `ruff/PTH110`

Checks for uses of `os.path.exists`.

- **Why it is on:** `pathlib` offers a high-level API for path manipulation, as compared to the lower-level API offered by `os.path`. When possible, using `Path` object methods such as `Path.exists()` can improve readability over the `os.path` module's counterparts (e.g., `os.path.exists()`). Selected in the ruff config of the Python preset, with the flake8-use-pathlib rules (`os-path-exists`).
- **Allowed form:** Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.
- **Example of the allowed form:**

  ```python
  from pathlib import Path

  Path("file.py").exists()
  ```

- **Exception:** If this is intended, add `{"rule":"PTH110","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/os-path-exists/)

<a id="ruff-pth111"></a>

### `ruff/PTH111`

Checks for uses of `os.path.expanduser`.

- **Why it is on:** `pathlib` offers a high-level API for path manipulation, as compared to the lower-level API offered by `os.path`. When possible, using `Path` object methods such as `Path.expanduser()` can improve readability over the `os.path` module's counterparts (e.g., as `os.path.expanduser()`). Selected in the ruff config of the Python preset, with the flake8-use-pathlib rules (`os-path-expanduser`).
- **Allowed form:** Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.
- **Example of the allowed form:**

  ```python
  from pathlib import Path

  Path("~/films/Monty Python").expanduser()
  ```

- **Exception:** If this is intended, add `{"rule":"PTH111","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/os-path-expanduser/)

<a id="ruff-pth112"></a>

### `ruff/PTH112`

Checks for uses of `os.path.isdir`.

- **Why it is on:** `pathlib` offers a high-level API for path manipulation, as compared to the lower-level API offered by `os.path`. When possible, using `Path` object methods such as `Path.is_dir()` can improve readability over the `os.path` module's counterparts (e.g., `os.path.isdir()`). Selected in the ruff config of the Python preset, with the flake8-use-pathlib rules (`os-path-isdir`).
- **Allowed form:** Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.
- **Example of the allowed form:**

  ```python
  from pathlib import Path

  Path("docs").is_dir()
  ```

- **Exception:** If this is intended, add `{"rule":"PTH112","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/os-path-isdir/)

<a id="ruff-pth113"></a>

### `ruff/PTH113`

Checks for uses of `os.path.isfile`.

- **Why it is on:** `pathlib` offers a high-level API for path manipulation, as compared to the lower-level API offered by `os.path`. When possible, using `Path` object methods such as `Path.is_file()` can improve readability over the `os.path` module's counterparts (e.g., `os.path.isfile()`). Selected in the ruff config of the Python preset, with the flake8-use-pathlib rules (`os-path-isfile`).
- **Allowed form:** Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.
- **Example of the allowed form:**

  ```python
  from pathlib import Path

  Path("docs").is_file()
  ```

- **Exception:** If this is intended, add `{"rule":"PTH113","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/os-path-isfile/)

<a id="ruff-pth114"></a>

### `ruff/PTH114`

Checks for uses of `os.path.islink`.

- **Why it is on:** `pathlib` offers a high-level API for path manipulation, as compared to the lower-level API offered by `os.path`. When possible, using `Path` object methods such as `Path.is_symlink()` can improve readability over the `os.path` module's counterparts (e.g., `os.path.islink()`). Selected in the ruff config of the Python preset, with the flake8-use-pathlib rules (`os-path-islink`).
- **Allowed form:** Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.
- **Example of the allowed form:**

  ```python
  from pathlib import Path

  Path("docs").is_symlink()
  ```

- **Exception:** If this is intended, add `{"rule":"PTH114","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/os-path-islink/)

<a id="ruff-pth115"></a>

### `ruff/PTH115`

Checks for uses of `os.readlink`.

- **Why it is on:** `pathlib` offers a high-level API for path manipulation, as compared to the lower-level API offered by `os`. When possible, using `Path` object methods such as `Path.readlink()` can improve readability over the `os` module's counterparts (e.g., `os.readlink()`). Selected in the ruff config of the Python preset, with the flake8-use-pathlib rules (`os-readlink`).
- **Allowed form:** Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.
- **Example of the allowed form:**

  ```python
  from pathlib import Path

  Path(file_name).readlink()
  ```

- **Exception:** If this is intended, add `{"rule":"PTH115","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/os-readlink/)

<a id="ruff-pth116"></a>

### `ruff/PTH116`

Checks for uses of `os.stat`.

- **Why it is on:** `pathlib` offers a high-level API for path manipulation, as compared to the lower-level API offered by `os`. When possible, using `Path` object methods such as `Path.stat()` can improve readability over the `os` module's counterparts (e.g., `os.path.stat()`). Selected in the ruff config of the Python preset, with the flake8-use-pathlib rules (`os-stat`).
- **Allowed form:** Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.
- **Example of the allowed form:**

  ```python
  from pathlib import Path

  file_path = Path(file_name)
  stat = file_path.stat()
  owner_name = file_path.owner()
  group_name = file_path.group()
  ```

- **Exception:** If this is intended, add `{"rule":"PTH116","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/os-stat/)

<a id="ruff-pth117"></a>

### `ruff/PTH117`

Checks for uses of `os.path.isabs`.

- **Why it is on:** `pathlib` offers a high-level API for path manipulation, as compared to the lower-level API offered by `os.path`. When possible, using `Path` object methods such as `Path.is_absolute()` can improve readability over the `os.path` module's counterparts (e.g., as `os.path.isabs()`). Selected in the ruff config of the Python preset, with the flake8-use-pathlib rules (`os-path-isabs`).
- **Allowed form:** Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.
- **Example of the allowed form:**

  ```python
  from pathlib import Path

  if Path(file_name).is_absolute():
      print("Absolute path!")
  ```

- **Exception:** If this is intended, add `{"rule":"PTH117","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/os-path-isabs/)

<a id="ruff-pth118"></a>

### `ruff/PTH118`

Checks for uses of `os.path.join`.

- **Why it is on:** `pathlib` offers a high-level API for path manipulation, as compared to the lower-level API offered by `os.path`. When possible, using `Path` object methods such as `Path.joinpath()` or the `/` operator can improve readability over the `os.path` module's counterparts (e.g., `os.path.join()`). Selected in the ruff config of the Python preset, with the flake8-use-pathlib rules (`os-path-join`).
- **Allowed form:** Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.
- **Example of the allowed form:**

  ```python
  from pathlib import Path

  Path(ROOT_PATH) / "folder" / "file.py"
  ```

- **Exception:** If this is intended, add `{"rule":"PTH118","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/os-path-join/)

<a id="ruff-pth119"></a>

### `ruff/PTH119`

Checks for uses of `os.path.basename`.

- **Why it is on:** `pathlib` offers a high-level API for path manipulation, as compared to the lower-level API offered by `os.path`. When possible, using `Path` object methods such as `Path.name` can improve readability over the `os.path` module's counterparts (e.g., `os.path.basename()`). Selected in the ruff config of the Python preset, with the flake8-use-pathlib rules (`os-path-basename`).
- **Allowed form:** Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.
- **Example of the allowed form:**

  ```python
  from pathlib import Path

  Path(__file__).name
  ```

- **Exception:** If this is intended, add `{"rule":"PTH119","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/os-path-basename/)

<a id="ruff-pth120"></a>

### `ruff/PTH120`

Checks for uses of `os.path.dirname`.

- **Why it is on:** `pathlib` offers a high-level API for path manipulation, as compared to the lower-level API offered by `os.path`. When possible, using `Path` object methods such as `Path.parent` can improve readability over the `os.path` module's counterparts (e.g., `os.path.dirname()`). Selected in the ruff config of the Python preset, with the flake8-use-pathlib rules (`os-path-dirname`).
- **Allowed form:** Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.
- **Example of the allowed form:**

  ```python
  from pathlib import Path

  Path(__file__).parent
  ```

- **Exception:** If this is intended, add `{"rule":"PTH120","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/os-path-dirname/)

<a id="ruff-pth121"></a>

### `ruff/PTH121`

Checks for uses of `os.path.samefile`.

- **Why it is on:** `pathlib` offers a high-level API for path manipulation, as compared to the lower-level API offered by `os.path`. When possible, using `Path` object methods such as `Path.samefile()` can improve readability over the `os.path` module's counterparts (e.g., `os.path.samefile()`). Selected in the ruff config of the Python preset, with the flake8-use-pathlib rules (`os-path-samefile`).
- **Allowed form:** Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.
- **Example of the allowed form:**

  ```python
  from pathlib import Path

  Path("f1.py").samefile("f2.py")
  ```

- **Exception:** If this is intended, add `{"rule":"PTH121","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/os-path-samefile/)

<a id="ruff-pth122"></a>

### `ruff/PTH122`

Checks for uses of `os.path.splitext`.

- **Why it is on:** `pathlib` offers a high-level API for path manipulation, as compared to the lower-level API offered by `os.path`. When possible, using `Path` object methods such as `Path.suffix` and `Path.stem` can improve readability over the `os.path` module's counterparts (e.g., `os.path.splitext()`). `os.path.splitext()` specifically returns a tuple of the file root and extension (e.g., given `splitext('/foo/bar.py')`, `os.path.splitext()` returns `("foo/bar", ".py")`. These outputs can be reconstructed through a combination of `Path.suffix` (`".py"`), `Path.stem` (`"bar"`), and `Path.parent` (`"foo"`). Selected in the ruff config of the Python preset, with the flake8-use-pathlib rules (`os-path-splitext`).
- **Allowed form:** Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.
- **Example of the allowed form:**

  ```python
  from pathlib import Path

  path = Path("foo/bar.py")
  root = path.parent / path.stem
  ext = path.suffix
  ```

- **Exception:** If this is intended, add `{"rule":"PTH122","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/os-path-splitext/)

<a id="ruff-pth123"></a>

### `ruff/PTH123`

Checks for uses of the `open()` builtin.

- **Why it is on:** `pathlib` offers a high-level API for path manipulation. When possible, using `Path` object methods such as `Path.open()` can improve readability over the `open` builtin. Selected in the ruff config of the Python preset, with the flake8-use-pathlib rules (`builtin-open`).
- **Allowed form:** Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.
- **Example of the allowed form:**

  ```python
  from pathlib import Path

  with Path("f1.py").open("wb") as fp:
      ...
  ```

- **Exception:** If this is intended, add `{"rule":"PTH123","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/builtin-open/)

<a id="ruff-pth124"></a>

### `ruff/PTH124`

Checks for uses of the `py.path` library.

- **Why it is on:** The `py.path` library is in maintenance mode. Instead, prefer the standard library's `pathlib` module, or third-party modules like `path` (formerly `py.path`). Selected in the ruff config of the Python preset, with the flake8-use-pathlib rules (`py-path`).
- **Allowed form:** Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.
- **Example of the allowed form:**

  ```python
  from pathlib import Path

  p = Path("/foo/bar") / "bar" / "qux"
  ```

- **Exception:** If this is intended, add `{"rule":"PTH124","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/py-path/)

<a id="ruff-pth201"></a>

### `ruff/PTH201`

Checks for `pathlib.Path` objects that are initialized with the current directory.

- **Why it is on:** The `Path()` constructor defaults to the current directory, so passing it in explicitly (as `"."`) is unnecessary. Selected in the ruff config of the Python preset, with the flake8-use-pathlib rules (`path-constructor-current-directory`).
- **Allowed form:** Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.
- **Example of the allowed form:**

  ```python
  from pathlib import Path

  _ = Path()
  ```

- **Exception:** If this is intended, add `{"rule":"PTH201","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/path-constructor-current-directory/)

<a id="ruff-pth202"></a>

### `ruff/PTH202`

Checks for uses of `os.path.getsize`.

- **Why it is on:** `pathlib` offers a high-level API for path manipulation, as compared to the lower-level API offered by `os.path`. When possible, using `Path` object methods such as `Path.stat()` can improve readability over the `os.path` module's counterparts (e.g., `os.path.getsize()`). Selected in the ruff config of the Python preset, with the flake8-use-pathlib rules (`os-path-getsize`).
- **Allowed form:** Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.
- **Example of the allowed form:**

  ```python
  from pathlib import Path

  Path(__file__).stat().st_size
  ```

- **Exception:** If this is intended, add `{"rule":"PTH202","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/os-path-getsize/)

<a id="ruff-pth203"></a>

### `ruff/PTH203`

Checks for uses of `os.path.getatime`.

- **Why it is on:** `pathlib` offers a high-level API for path manipulation, as compared to the lower-level API offered by `os.path`. When possible, using `Path` object methods such as `Path.stat()` can improve readability over the `os.path` module's counterparts (e.g., `os.path.getatime()`). Selected in the ruff config of the Python preset, with the flake8-use-pathlib rules (`os-path-getatime`).
- **Allowed form:** Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.
- **Example of the allowed form:**

  ```python
  from pathlib import Path

  Path(__file__).stat().st_atime
  ```

- **Exception:** If this is intended, add `{"rule":"PTH203","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/os-path-getatime/)

<a id="ruff-pth204"></a>

### `ruff/PTH204`

Checks for uses of `os.path.getmtime`.

- **Why it is on:** `pathlib` offers a high-level API for path manipulation, as compared to the lower-level API offered by `os.path`. When possible, using `Path` object methods such as `Path.stat()` can improve readability over the `os.path` module's counterparts (e.g., `os.path.getmtime()`). Selected in the ruff config of the Python preset, with the flake8-use-pathlib rules (`os-path-getmtime`).
- **Allowed form:** Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.
- **Example of the allowed form:**

  ```python
  from pathlib import Path

  Path(__file__).stat().st_mtime
  ```

- **Exception:** If this is intended, add `{"rule":"PTH204","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/os-path-getmtime/)

<a id="ruff-pth205"></a>

### `ruff/PTH205`

Checks for uses of `os.path.getctime`.

- **Why it is on:** `pathlib` offers a high-level API for path manipulation, as compared to the lower-level API offered by `os.path`. When possible, using `Path` object methods such as `Path.stat()` can improve readability over the `os.path` module's counterparts (e.g., `os.path.getctime()`). Selected in the ruff config of the Python preset, with the flake8-use-pathlib rules (`os-path-getctime`).
- **Allowed form:** Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.
- **Example of the allowed form:**

  ```python
  from pathlib import Path

  Path(__file__).stat().st_ctime
  ```

- **Exception:** If this is intended, add `{"rule":"PTH205","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/os-path-getctime/)

<a id="ruff-pth206"></a>

### `ruff/PTH206`

Checks for uses of `.split(os.sep)`.

- **Why it is on:** The `pathlib` module in the standard library should be used for path manipulation. It provides a high-level API with the functionality needed for common operations on `Path` objects. Selected in the ruff config of the Python preset, with the flake8-use-pathlib rules (`os-sep-split`).
- **Allowed form:** Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.
- **Example of the allowed form:**

  ```python
  from pathlib import Path

  Path("path/to/file_name.txt").name

  Path("path/to/file_name.txt").parent.name

  # Iterating over the path parts
  if any(part in blocklist for part in Path("my/file/path").parts):
      ...
  ```

- **Exception:** If this is intended, add `{"rule":"PTH206","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/os-sep-split/)

<a id="ruff-pth207"></a>

### `ruff/PTH207`

Checks for the use of `glob.glob()` and `glob.iglob()`.

- **Why it is on:** `pathlib` offers a high-level API for path manipulation, as compared to the lower-level API offered by `os` and `glob`. When possible, using `Path` object methods such as `Path.glob()` can improve readability over their low-level counterparts (e.g., `glob.glob()`). Selected in the ruff config of the Python preset, with the flake8-use-pathlib rules (`glob`).
- **Allowed form:** Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.
- **Example of the allowed form:**

  ```python
  from pathlib import Path

  Path("my_path").glob("requirements*.txt")
  ```

- **Exception:** If this is intended, add `{"rule":"PTH207","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/glob/)

<a id="ruff-pth208"></a>

### `ruff/PTH208`

Checks for uses of `os.listdir`.

- **Why it is on:** `pathlib` offers a high-level API for path manipulation, as compared to the lower-level API offered by `os`. When possible, using `pathlib`'s `Path.iterdir()` can improve readability over `os.listdir()`. Selected in the ruff config of the Python preset, with the flake8-use-pathlib rules (`os-listdir`).
- **Allowed form:** Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.
- **Example of the allowed form:**

  ```python
  p = Path(".")
  for d in p.iterdir():
      ...

  if any(p.iterdir()):
      ...

  if (p / "file").exists():
      ...
  ```

- **Exception:** If this is intended, add `{"rule":"PTH208","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/os-listdir/)

<a id="ruff-pth210"></a>

### `ruff/PTH210`

Checks for `pathlib.Path.with_suffix()` calls where the given suffix does not have a leading dot or the given suffix is a single dot `"."` and the Python version is less than 3.14.

- **Why it is on:** `Path.with_suffix()` will raise an error at runtime if the given suffix is not prefixed with a dot or, in versions prior to Python 3.14, if it is a single dot `"."`. Selected in the ruff config of the Python preset, with the flake8-use-pathlib rules (`invalid-pathlib-with-suffix`).
- **Allowed form:** Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.
- **Example of the allowed form:**

  ```python
  from pathlib import Path

  path = Path()

  path.with_suffix(".py")
  ```

- **Exception:** If this is intended, add `{"rule":"PTH210","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/invalid-pathlib-with-suffix/)

<a id="ruff-pth211"></a>

### `ruff/PTH211`

Checks for uses of `os.symlink`.

- **Why it is on:** `pathlib` offers a high-level API for path manipulation, as compared to the lower-level API offered by `os.symlink`. Selected in the ruff config of the Python preset, with the flake8-use-pathlib rules (`os-symlink`).
- **Allowed form:** Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.
- **Example of the allowed form:**

  ```python
  from pathlib import Path

  Path("tmp/python").symlink_to("usr/bin/python")
  ```

- **Exception:** If this is intended, add `{"rule":"PTH211","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/os-symlink/)

<a id="ruff-ret501"></a>

### `ruff/RET501`

Checks for the presence of a `return None` statement when `None` is the only possible return value.

- **Why it is on:** Python implicitly assumes `return None` if an explicit `return` value is omitted. Therefore, explicitly returning `None` is redundant and should be avoided when it is the only possible `return` value across all code paths in a given function. Selected in the ruff config of the Python preset, with the flake8-return rules (`unnecessary-return-none`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-return-none/).
- **Example of the allowed form:**

  ```python
  def foo(bar):
      if not bar:
          return
      return
  ```

- **Exception:** If this is intended, add `{"rule":"RET501","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-return-none/)

<a id="ruff-ret502"></a>

### `ruff/RET502`

Checks for the presence of a `return` statement with no explicit value, for functions that return non-`None` values elsewhere.

- **Why it is on:** Including a `return` statement with no explicit value can cause confusion when other `return` statements in the function return non-`None` values. Python implicitly assumes return `None` if no other return value is present. Adding an explicit `return None` can make the code more readable by clarifying intent. Selected in the ruff config of the Python preset, with the flake8-return rules (`implicit-return-value`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/implicit-return-value/).
- **Example of the allowed form:**

  ```python
  def foo(bar):
      if not bar:
          return None
      return 1
  ```

- **Exception:** If this is intended, add `{"rule":"RET502","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/implicit-return-value/)

<a id="ruff-ret503"></a>

### `ruff/RET503`

Checks for missing explicit `return` statements at the end of functions that can return non-`None` values.

- **Why it is on:** The lack of an explicit `return` statement at the end of a function that can return non-`None` values can cause confusion. Python implicitly returns `None` if no other return value is present. Adding an explicit `return None` can make the code more readable by clarifying intent. Selected in the ruff config of the Python preset, with the flake8-return rules (`implicit-return`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/implicit-return/).
- **Example of the allowed form:**

  ```python
  def foo(bar):
      if not bar:
          return 1
      return None
  ```

- **Exception:** If this is intended, add `{"rule":"RET503","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/implicit-return/)

<a id="ruff-ret504"></a>

### `ruff/RET504`

Checks for variable assignments that immediately precede a `return` of the assigned variable.

- **Why it is on:** The variable assignment is not necessary, as the value can be returned directly. Selected in the ruff config of the Python preset, with the flake8-return rules (`unnecessary-assign`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-assign/).
- **Example of the allowed form:**

  ```python
  def foo():
      return 1
  ```

- **Exception:** If this is intended, add `{"rule":"RET504","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-assign/)

<a id="ruff-ret505"></a>

### `ruff/RET505`

Checks for `else` statements with a `return` statement in the preceding `if` block.

- **Why it is on:** The `else` statement is not needed as the `return` statement will always break out of the enclosing function. Removing the `else` will reduce nesting and make the code more readable. Selected in the ruff config of the Python preset, with the flake8-return rules (`superfluous-else-return`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/superfluous-else-return/).
- **Example of the allowed form:**

  ```python
  def foo(bar, baz):
      if bar:
          return 1
      return baz
  ```

- **Exception:** If this is intended, add `{"rule":"RET505","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/superfluous-else-return/)

<a id="ruff-ret506"></a>

### `ruff/RET506`

Checks for `else` statements with a `raise` statement in the preceding `if` block.

- **Why it is on:** The `else` statement is not needed as the `raise` statement will always break out of the current scope. Removing the `else` will reduce nesting and make the code more readable. Selected in the ruff config of the Python preset, with the flake8-return rules (`superfluous-else-raise`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/superfluous-else-raise/).
- **Example of the allowed form:**

  ```python
  def foo(bar, baz):
      if bar == "Specific Error":
          raise Exception(bar)
      raise Exception(baz)
  ```

- **Exception:** If this is intended, add `{"rule":"RET506","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/superfluous-else-raise/)

<a id="ruff-ret507"></a>

### `ruff/RET507`

Checks for `else` statements with a `continue` statement in the preceding `if` block.

- **Why it is on:** The `else` statement is not needed, as the `continue` statement will always continue onto the next iteration of a loop. Removing the `else` will reduce nesting and make the code more readable. Selected in the ruff config of the Python preset, with the flake8-return rules (`superfluous-else-continue`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/superfluous-else-continue/).
- **Example of the allowed form:**

  ```python
  def foo(bar, baz):
      for i in bar:
          if i < baz:
              continue
          x = 0
  ```

- **Exception:** If this is intended, add `{"rule":"RET507","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/superfluous-else-continue/)

<a id="ruff-ret508"></a>

### `ruff/RET508`

Checks for `else` statements with a `break` statement in the preceding `if` block.

- **Why it is on:** The `else` statement is not needed, as the `break` statement will always break out of the loop. Removing the `else` will reduce nesting and make the code more readable. Selected in the ruff config of the Python preset, with the flake8-return rules (`superfluous-else-break`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/superfluous-else-break/).
- **Example of the allowed form:**

  ```python
  def foo(bar, baz):
      for i in bar:
          if i > baz:
              break
          x = 0
  ```

- **Exception:** If this is intended, add `{"rule":"RET508","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/superfluous-else-break/)

<a id="ruff-ruf005"></a>

### `ruff/RUF005`

Checks for uses of the `+` operator to concatenate collections.

- **Why it is on:** In Python, the `+` operator can be used to concatenate collections (e.g., `x + y` to concatenate the lists `x` and `y`). However, collections can be concatenated more efficiently using the unpacking operator (e.g., `*x, *y` to concatenate `x` and `y`). Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`collection-literal-concatenation`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/collection-literal-concatenation/).
- **Example of the allowed form:**

  ```python
  foo = [2, 3, 4]
  bar = [1, *foo, 5, 6]
  ```

- **Exception:** If this is intended, add `{"rule":"RUF005","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/collection-literal-concatenation/)

<a id="ruff-ruf006"></a>

### `ruff/RUF006`

Checks for `asyncio.create_task` and `asyncio.ensure_future` calls that do not store a reference to the returned result.

- **Why it is on:** Per the `asyncio` documentation, the event loop only retains a weak reference to tasks. If the task returned by `asyncio.create_task` and `asyncio.ensure_future` is not stored in a variable, or a collection, or otherwise referenced, it may be garbage collected at any time. This can lead to unexpected and inconsistent behavior, as your tasks may or may not run to completion. Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`asyncio-dangling-task`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/asyncio-dangling-task/).
- **Example of the allowed form:**

  ```python
  import asyncio

  background_tasks = set()

  for i in range(10):
      task = asyncio.create_task(some_coro(param=i))

      # Add task to the set. This creates a strong reference.
      background_tasks.add(task)

      # To prevent keeping references to finished tasks forever,
      # make each task remove its own reference from the set after
      # completion:
      task.add_done_callback(background_tasks.discard)
  ```

- **Exception:** If this is intended, add `{"rule":"RUF006","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/asyncio-dangling-task/)

<a id="ruff-ruf007"></a>

### `ruff/RUF007`

Checks for use of `zip()` to iterate over successive pairs of elements.

- **Why it is on:** When iterating over successive pairs of elements, prefer `itertools.pairwise()` over `zip()`. `itertools.pairwise()` is more readable and conveys the intent of the code more clearly. Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`zip-instead-of-pairwise`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/zip-instead-of-pairwise/).
- **Example of the allowed form:**

  ```python
  from itertools import pairwise

  letters = "ABCD"
  pairwise(letters)  # ("A", "B"), ("B", "C"), ("C", "D")
  ```

- **Exception:** If this is intended, add `{"rule":"RUF007","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/zip-instead-of-pairwise/)

<a id="ruff-ruf008"></a>

### `ruff/RUF008`

Checks for mutable default values in dataclass attributes.

- **Why it is on:** Mutable default values share state across all instances of the dataclass. This can lead to bugs when the attributes are changed in one instance, as those changes will unexpectedly affect all other instances. Instead of sharing mutable defaults, use the `field(default_factory=...)` pattern. Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`mutable-dataclass-default`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/mutable-dataclass-default/).
- **Example of the allowed form:**

  ```python
  from dataclasses import dataclass, field


  @dataclass
  class A:
      mutable_default: list[int] = field(default_factory=list)
  ```

- **Exception:** If this is intended, add `{"rule":"RUF008","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/mutable-dataclass-default/)

<a id="ruff-ruf009"></a>

### `ruff/RUF009`

Checks for function calls in dataclass attribute defaults.

- **Why it is on:** Function calls are only performed once, at definition time. The returned value is then reused by all instances of the dataclass. This can lead to unexpected behavior when the function call returns a mutable object, as changes to the object will be shared across all instances. If a field needs to be initialized with a mutable object, use the `field(default_factory=...)` pattern. Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`function-call-in-dataclass-default-argument`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/function-call-in-dataclass-default-argument/).
- **Example of the allowed form:**

  ```python
  from dataclasses import dataclass, field


  def creating_list() -> list[int]:
      return [1, 2, 3, 4]


  @dataclass
  class A:
      mutable_default: list[int] = field(default_factory=creating_list)
  ```

- **Exception:** If this is intended, add `{"rule":"RUF009","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/function-call-in-dataclass-default-argument/)

<a id="ruff-ruf010"></a>

### `ruff/RUF010`

Checks for uses of `str()`, `repr()`, and `ascii()` as explicit type conversions within f-strings.

- **Why it is on:** f-strings support dedicated conversion flags for these types, which are more succinct and idiomatic. Note that, in many cases, calling `str()` within an f-string is unnecessary and can be removed entirely, as the value will be converted to a string automatically, the notable exception being for classes that implement a custom `__format__` method. Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`explicit-f-string-type-conversion`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/explicit-f-string-type-conversion/).
- **Example of the allowed form:**

  ```python
  a = "some string"
  f"{a!r}"
  ```

- **Exception:** If this is intended, add `{"rule":"RUF010","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/explicit-f-string-type-conversion/)

<a id="ruff-ruf013"></a>

### `ruff/RUF013`

Checks for the use of implicit `Optional` in type annotations when the default parameter value is `None`.

- **Why it is on:** Implicit `Optional` is prohibited by PEP 484. It is confusing and inconsistent with the rest of the type system. It's recommended to use `OptionalT` instead. For Python 3.10 and later, you can also use `T | None`. Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`implicit-optional`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/implicit-optional/).
- **Example of the allowed form:**

  ```python
  from typing import Optional


  def foo(arg: Optional[int] = None):
      pass
  ```

- **Exception:** If this is intended, add `{"rule":"RUF013","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/implicit-optional/)

<a id="ruff-ruf015"></a>

### `ruff/RUF015`

Checks the following constructs, all of which can be replaced by `next(iter(...))`:.

- **Why it is on:** Calling e.g. `list(...)` will create a new list of the entire collection, which can be very expensive for large collections. If you only need the first element of the collection, you can use `next(...)` or `next(iter(...)` to lazily fetch the first element. The same is true for the other constructs. Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`unnecessary-iterable-allocation-for-first-element`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-iterable-allocation-for-first-element/).
- **Example of the allowed form:**

  ```python
  head = next(iter(x))
  head = next(x * x for x in range(10))
  ```

- **Exception:** If this is intended, add `{"rule":"RUF015","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-iterable-allocation-for-first-element/)

<a id="ruff-ruf016"></a>

### `ruff/RUF016`

Checks for indexed access to lists, strings, tuples, bytes, and comprehensions using a type other than an integer or slice.

- **Why it is on:** Only integers or slices can be used as indices to these types. Using other types will result in a `TypeError` at runtime and a `SyntaxWarning` at import time. Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`invalid-index-type`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/invalid-index-type/).
- **Example of the allowed form:**

  ```python
  var = [1, 2, 3][0]
  ```

- **Exception:** If this is intended, add `{"rule":"RUF016","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/invalid-index-type/)

<a id="ruff-ruf017"></a>

### `ruff/RUF017`

Checks for the use of `sum()` to flatten lists of lists, which has quadratic complexity.

- **Why it is on:** The use of `sum()` to flatten lists of lists is quadratic in the number of lists, as `sum()` creates a new list for each element in the summation. Instead, consider using another method of flattening lists to avoid quadratic complexity. The following methods are all linear in the number of lists: Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`quadratic-list-summation`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/quadratic-list-summation/).
- **Exception:** If this is intended, add `{"rule":"RUF017","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/quadratic-list-summation/)

<a id="ruff-ruf018"></a>

### `ruff/RUF018`

Checks for named assignment expressions (e.g., `x := 0`) in `assert` statements.

- **Why it is on:** Named assignment expressions (also known as "walrus operators") are used to assign a value to a variable as part of a larger expression. Named assignments are syntactically valid in `assert` statements. However, when the Python interpreter is run under the `-O` flag, `assert` statements are not executed. In this case, the named assignment will also be ignored, which may result in unexpected behavior (e.g., undefined variable accesses). Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`assignment-in-assert`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/assignment-in-assert/).
- **Example of the allowed form:**

  ```python
  x = 0
  assert x == 0
  print(x)
  ```

- **Exception:** If this is intended, add `{"rule":"RUF018","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/assignment-in-assert/)

<a id="ruff-ruf019"></a>

### `ruff/RUF019`

Checks for unnecessary key checks prior to accessing a dictionary.

- **Why it is on:** When working with dictionaries, the `get` can be used to access a value without having to check if the dictionary contains the relevant key, returning `None` if the key is not present. Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`unnecessary-key-check`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-key-check/).
- **Example of the allowed form:**

  ```python
  if dct.get("key"):
      ...
  ```

- **Exception:** If this is intended, add `{"rule":"RUF019","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-key-check/)

<a id="ruff-ruf020"></a>

### `ruff/RUF020`

Checks for uses of `typing.NoReturn` and `typing.Never` in union types.

- **Why it is on:** `typing.NoReturn` and `typing.Never` are special types, used to indicate that a function never returns, or that a type has no values. Including `typing.NoReturn` or `typing.Never` in a union type is redundant, as, e.g., `typing.Never | T` is equivalent to `T`. Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`never-union`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/never-union/).
- **Example of the allowed form:**

  ```python
  def func() -> int: ...
  ```

- **Exception:** If this is intended, add `{"rule":"RUF020","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/never-union/)

<a id="ruff-ruf021"></a>

### `ruff/RUF021`

Checks for chained operators where adding parentheses could improve the clarity of the code.

- **Why it is on:** `and` always binds more tightly than `or` when chaining the two together, but this can be hard to remember (and sometimes surprising). Adding parentheses in these situations can greatly improve code readability, with no change to semantics or performance. For example: Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`parenthesize-chained-operators`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/parenthesize-chained-operators/).
- **Example of the allowed form:**

  ```python
  a, b, c = 1, 0, 2
  x = a or (b and c)

  d, e, f = 0, 1, 2
  y = (d and e) or f
  ```

- **Exception:** If this is intended, add `{"rule":"RUF021","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/parenthesize-chained-operators/)

<a id="ruff-ruf022"></a>

### `ruff/RUF022`

Checks for `__all__` definitions that are not ordered according to an "isort-style" sort.

- **Why it is on:** Consistency is good. Use a common convention for `__all__` to make your code more readable and idiomatic. Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`unsorted-dunder-all`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unsorted-dunder-all/).
- **Example of the allowed form:**

  ```python
  import sys

  __all__ = [
      "a",
      "b",
      "c",
  ]

  if sys.platform == "win32":
      __all__ += ["y", "z"]
  ```

- **Exception:** If this is intended, add `{"rule":"RUF022","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unsorted-dunder-all/)

<a id="ruff-ruf023"></a>

### `ruff/RUF023`

Checks for `__slots__` definitions that are not ordered according to a [natural sort](https://en.wikipedia.org/wiki/Natural_sort_order).

- **Why it is on:** Consistency is good. Use a common convention for this special variable to make your code more readable and idiomatic. Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`unsorted-dunder-slots`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unsorted-dunder-slots/).
- **Example of the allowed form:**

  ```python
  class Dog:
      __slots__ = "breed", "name"
  ```

- **Exception:** If this is intended, add `{"rule":"RUF023","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unsorted-dunder-slots/)

<a id="ruff-ruf024"></a>

### `ruff/RUF024`

Checks for mutable objects passed as a value argument to `dict.fromkeys`.

- **Why it is on:** All values in the dictionary created by the `dict.fromkeys` method refer to the same instance of the provided object. If that object is modified, all values are modified, which can lead to unexpected behavior. For example, if the empty list (`[]`) is provided as the default value, all values in the dictionary will use the same list; as such, appending to any one entry will append to all entries. Instead, use a comprehension to generate a dictionary with distinct instances of the default value. Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`mutable-fromkeys-value`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/mutable-fromkeys-value/).
- **Example of the allowed form:**

  ```python
  cities = {country: [] for country in ["UK", "Poland"]}
  cities["UK"].append("London")
  cities["Poland"].append("Poznan")
  print(cities)  # {'UK': ['London'], 'Poland': ['Poznan']}
  ```

- **Exception:** If this is intended, add `{"rule":"RUF024","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/mutable-fromkeys-value/)

<a id="ruff-ruf026"></a>

### `ruff/RUF026`

Checks for incorrect usages of `default_factory` as a keyword argument when initializing a `defaultdict`.

- **Why it is on:** The `defaultdict` constructor accepts a callable as its first argument. For example, it's common to initialize a `defaultdict` with `int` or `list` via `defaultdict(int)` or `defaultdict(list)`, to create a dictionary that returns `0` or `[]` respectively when a key is missing. The default factory must be provided as a positional argument, as all keyword arguments to `defaultdict` are interpreted as initial entries in the dictionary. For example, `defaultdict(foo=1, bar=2)` will create a dictionary with `{"foo": 1, "bar": 2}` as its initial entries. Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`default-factory-kwarg`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/default-factory-kwarg/).
- **Example of the allowed form:**

  ```python
  defaultdict(int)
  defaultdict(list)
  ```

- **Exception:** If this is intended, add `{"rule":"RUF026","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/default-factory-kwarg/)

<a id="ruff-ruf028"></a>

### `ruff/RUF028`

Checks for formatter suppression comments that are ineffective or incompatible with Ruff's formatter.

- **Why it is on:** Suppression comments that do not actually prevent formatting could cause unintended changes when the formatter is run. Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`invalid-formatter-suppression-comment`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/invalid-formatter-suppression-comment/).
- **Exception:** If this is intended, add `{"rule":"RUF028","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/invalid-formatter-suppression-comment/)

<a id="ruff-ruf030"></a>

### `ruff/RUF030`

Checks for uses of `assert expression, print(message)`.

- **Why it is on:** If an `assert x, y` assertion fails, the Python interpreter raises an `AssertionError`, and the evaluated value of `y` is used as the contents of that assertion error. The `print` function always returns `None`, however, so the evaluated value of a call to `print` will always be `None`. Using a `print` call in this context will therefore output the message to `stdout`, before raising an empty `AssertionError(None)`. Instead, remove the `print` and pass the message directly as the second expression, allowing `stderr` to capture the message in a well-formatted context. Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`assert-with-print-message`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/assert-with-print-message/).
- **Example of the allowed form:**

  ```python
  assert False, "This is a message"
  ```

- **Exception:** If this is intended, add `{"rule":"RUF030","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/assert-with-print-message/)

<a id="ruff-ruf032"></a>

### `ruff/RUF032`

Checks for `Decimal` calls passing a float literal.

- **Why it is on:** Float literals have limited precision that can lead to unexpected results. The `Decimal` class is designed to handle numbers with fixed-point precision, so a string literal should be used instead. Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`decimal-from-float-literal`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/decimal-from-float-literal/).
- **Example of the allowed form:**

  ```python
  num = Decimal("1.2345")
  ```

- **Exception:** If this is intended, add `{"rule":"RUF032","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/decimal-from-float-literal/)

<a id="ruff-ruf033"></a>

### `ruff/RUF033`

Checks for `__post_init__` dataclass methods with parameter defaults.

- **Why it is on:** Adding a default value to a parameter in a `__post_init__` method has no impact on whether the parameter will have a default value in the dataclass's generated `__init__` method. To create an init-only dataclass parameter with a default value, you should use an `InitVar` field in the dataclass's class body and give that `InitVar` field a default value. As the documentation states: Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`post-init-default`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/post-init-default/).
- **Example of the allowed form:**

  ```python
  from dataclasses import InitVar, dataclass


  @dataclass
  class Foo:
      bar: InitVar[int] = 1
      baz: InitVar[int] = 2

      def __post_init__(self, bar: int, baz: int) -> None:
          print(bar, baz)


  foo = Foo()  # Prints '1 2'.
  ```

- **Exception:** If this is intended, add `{"rule":"RUF033","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/post-init-default/)

<a id="ruff-ruf034"></a>

### `ruff/RUF034`

Checks for useless `if`-`else` conditions with identical arms.

- **Why it is on:** Useless `if`-`else` conditions add unnecessary complexity to the code without providing any logical benefit. Assigning the value directly is clearer. Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`useless-if-else`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/useless-if-else/).
- **Example of the allowed form:**

  ```python
  foo = x
  ```

- **Exception:** If this is intended, add `{"rule":"RUF034","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/useless-if-else/)

<a id="ruff-ruf036"></a>

### `ruff/RUF036`

Checks for type annotations where `None` is not at the end of a union.

- **Why it is on:** Type annotation unions are commutative, meaning that the order of the elements does not matter. The `None` literal represents the absence of a value. For readability, it's preferred to write the more informative type expressions first. Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`none-not-at-end-of-union`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/none-not-at-end-of-union/).
- **Example of the allowed form:**

  ```python
  def func(arg: int | None): ...
  ```

- **Exception:** If this is intended, add `{"rule":"RUF036","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/none-not-at-end-of-union/)

<a id="ruff-ruf037"></a>

### `ruff/RUF037`

Checks for use of `collections.deque` with an empty iterable as the first argument.

- **Why it is on:** It's unnecessary to use an empty literal as a deque's iterable, since this is already the default behavior. Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`unnecessary-empty-iterable-within-deque-call`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-empty-iterable-within-deque-call/).
- **Example of the allowed form:**

  ```python
  from collections import deque

  queue = deque()
  queue = deque(maxlen=10)
  ```

- **Exception:** If this is intended, add `{"rule":"RUF037","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-empty-iterable-within-deque-call/)

<a id="ruff-ruf040"></a>

### `ruff/RUF040`

Checks for invalid use of literals in assert message arguments.

- **Why it is on:** An assert message which is a non-string literal was likely intended to be used in a comparison assertion, rather than as a message. Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`invalid-assert-message-literal-argument`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/invalid-assert-message-literal-argument/).
- **Example of the allowed form:**

  ```python
  fruits = ["apples", "plums", "pears"]
  fruits.filter(lambda fruit: fruit.startswith("p"))
  assert len(fruits) == 2
  ```

- **Exception:** If this is intended, add `{"rule":"RUF040","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/invalid-assert-message-literal-argument/)

<a id="ruff-ruf041"></a>

### `ruff/RUF041`

Checks for unnecessary nested `Literal`.

- **Why it is on:** Prefer using a single `Literal`, which is equivalent and more concise. Parameterization of literals by other literals is supported as an ergonomic feature as proposed in PEP 586, to enable patterns such as: Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`unnecessary-nested-literal`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-nested-literal/).
- **Example of the allowed form:**

  ```python
  AllModes = Literal[
      "r", "r+", "w", "w+", "wt", "w+t", "r+", "r+t", "a", "a+", "at", "a+t"
  ]
  ```

- **Exception:** If this is intended, add `{"rule":"RUF041","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-nested-literal/)

<a id="ruff-ruf043"></a>

### `ruff/RUF043`

Checks for non-raw literal string arguments passed to the `match` parameter of `pytest.raises()` where the string contains at least one unescaped regex metacharacter.

- **Why it is on:** The `match` argument is implicitly converted to a regex under the hood. It should be made explicit whether the string is meant to be a regex or a "plain" pattern by prefixing the string with the `r` suffix, escaping the metacharacter(s) in the string using backslashes, or wrapping the entire string in a call to `re.escape()`. Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`pytest-raises-ambiguous-pattern`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/pytest-raises-ambiguous-pattern/).
- **Exception:** If this is intended, add `{"rule":"RUF043","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/pytest-raises-ambiguous-pattern/)

<a id="ruff-ruf046"></a>

### `ruff/RUF046`

Checks for `int` conversions of values that are already integers.

- **Why it is on:** Such a conversion is unnecessary. Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`unnecessary-cast-to-int`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-cast-to-int/).
- **Example of the allowed form:**

  ```python
  len([])
  round(foo)
  ```

- **Exception:** If this is intended, add `{"rule":"RUF046","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-cast-to-int/)

<a id="ruff-ruf048"></a>

### `ruff/RUF048`

Checks for calls of the form `map(int, __version__.split("."))`.

- **Why it is on:** `__version__` does not always contain integral-like elements. See also Version specifiers | Packaging specversion-specifier. Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`map-int-version-parsing`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/map-int-version-parsing/).
- **Example of the allowed form:**

  ```python
  import packaging.version as version

  version.parse(matplotlib.__version__)
  ```

- **Exception:** If this is intended, add `{"rule":"RUF048","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/map-int-version-parsing/)

<a id="ruff-ruf049"></a>

### `ruff/RUF049`

Checks for enum classes which are also decorated with `@dataclass`.

- **Why it is on:** Decorating an enum with `@dataclass()` does not cause any errors at runtime, but may cause erroneous results: Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`dataclass-enum`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/dataclass-enum/).
- **Example of the allowed form:**

  ```python
  from enum import Enum


  class E(Enum): ...
  ```

- **Exception:** If this is intended, add `{"rule":"RUF049","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/dataclass-enum/)

<a id="ruff-ruf051"></a>

### `ruff/RUF051`

Checks for `if key in dictionary: del dictionarykey`.

- **Why it is on:** To remove a key-value pair from a dictionary, it's more concise to use `.pop(..., None)`. Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`if-key-in-dict-del`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/if-key-in-dict-del/).
- **Example of the allowed form:**

  ```python
  dictionary = {}
  dictionary.pop(key, None)
  ```

- **Exception:** If this is intended, add `{"rule":"RUF051","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/if-key-in-dict-del/)

<a id="ruff-ruf053"></a>

### `ruff/RUF053`

Checks for classes that have PEP 695 type parameter lists while also inheriting from `typing.Generic` or `typing_extensions.Generic`.

- **Why it is on:** Such classes cause errors at runtime: Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`class-with-mixed-type-vars`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/class-with-mixed-type-vars/).
- **Example of the allowed form:**

  ```python
  class C[T, U, **P, *Ts]: ...
  ```

- **Exception:** If this is intended, add `{"rule":"RUF053","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/class-with-mixed-type-vars/)

<a id="ruff-ruf057"></a>

### `ruff/RUF057`

Checks for `round()` calls that have no effect on the input.

- **Why it is on:** Rounding a value that's already an integer is unnecessary. It's clearer to use the value directly. Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`unnecessary-round`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-round/).
- **Example of the allowed form:**

  ```python
  a = 1
  ```

- **Exception:** If this is intended, add `{"rule":"RUF057","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unnecessary-round/)

<a id="ruff-ruf058"></a>

### `ruff/RUF058`

Checks for `itertools.starmap` calls where the second argument is a `zip` call.

- **Why it is on:** `zip`-ping iterables only to unpack them later from within `starmap` is unnecessary. For such cases, `map()` should be used instead. Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`starmap-zip`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/starmap-zip/).
- **Example of the allowed form:**

  ```python
  map(func, a, b)
  map(func, a, b, strict=True)  # 3.14+
  ```

- **Exception:** If this is intended, add `{"rule":"RUF058","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/starmap-zip/)

<a id="ruff-ruf059"></a>

### `ruff/RUF059`

Checks for the presence of unused variables in unpacked assignments.

- **Why it is on:** A variable that is defined but never used can confuse readers. If a variable is intentionally defined-but-not-used, it should be prefixed with an underscore, or some other value that adheres to the `lint.dummy-variable-rgx` pattern. Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`unused-unpacked-variable`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unused-unpacked-variable/).
- **Example of the allowed form:**

  ```python
  def foo():
      x, _ = get_pair()
      return x
  ```

- **Exception:** If this is intended, add `{"rule":"RUF059","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unused-unpacked-variable/)

<a id="ruff-ruf060"></a>

### `ruff/RUF060`

Checks for membership tests on empty collections (such as `list`, `tuple`, `set`, or `dict`).

- **Why it is on:** If the collection is always empty, the check is unnecessary and can be removed. Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`in-empty-collection`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/in-empty-collection/).
- **Example of the allowed form:**

  ```python
  print("got it!")
  ```

- **Exception:** If this is intended, add `{"rule":"RUF060","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/in-empty-collection/)

<a id="ruff-ruf061"></a>

### `ruff/RUF061`

Checks for non-context-manager use of `pytest.raises`, `pytest.warns`, and `pytest.deprecated_call`.

- **Why it is on:** The context-manager form is more readable, easier to extend, and supports additional keyword arguments. Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`legacy-form-pytest-raises`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/legacy-form-pytest-raises/).
- **Example of the allowed form:**

  ```python
  import pytest


  with pytest.raises(ValueError) as excinfo:
      int("hello")
  with pytest.warns(UserWarning):
      my_function(arg)
  with pytest.deprecated_call():
      my_deprecated_function(arg1, arg2)
  ```

- **Exception:** If this is intended, add `{"rule":"RUF061","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/legacy-form-pytest-raises/)

<a id="ruff-ruf063"></a>

### `ruff/RUF063`

Checks for uses of `foo.__dict__.get("__annotations__")` or `foo.__dict__"__annotations__"` on Python 3.10+ and Python \< 3.10 when `lint.typing-extensions` is enabled.

- **Why it is on:** Starting with Python 3.14, directly accessing `__annotations__` via `foo.__dict__.get("__annotations__")` or `foo.__dict__"__annotations__"` will only return annotations if the class is defined under `from __future__ import annotations`. Therefore, it is better to use dedicated library functions like `annotationlib.get_annotations` (Python 3.14+), `inspect.get_annotations` (Python 3.10+), or `typing_extensions.get_annotations` (for Python \< 3.10 if [typing-extensions](https://pypi.org/project/typing-extensions/) is available). Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`access-annotations-from-class-dict`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/access-annotations-from-class-dict/).
- **Exception:** If this is intended, add `{"rule":"RUF063","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/access-annotations-from-class-dict/)

<a id="ruff-ruf064"></a>

### `ruff/RUF064`

Checks for standard library functions which take a numeric `mode` argument where a non-octal integer literal is passed.

- **Why it is on:** Numeric modes are made up of one to four octal digits. Converting a non-octal integer to octal may not be the mode the author intended. Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`non-octal-permissions`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/non-octal-permissions/).
- **Example of the allowed form:**

  ```python
  os.chmod("foo", 0o644)
  ```

- **Exception:** If this is intended, add `{"rule":"RUF064","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/non-octal-permissions/)

<a id="ruff-ruf068"></a>

### `ruff/RUF068`

Detects duplicate elements in `__all__` definitions.

- **Why it is on:** Duplicate elements in `__all__` serve no purpose and can indicate copy-paste errors or incomplete refactoring. Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`duplicate-entry-in-dunder-all`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/duplicate-entry-in-dunder-all/).
- **Example of the allowed form:**

  ```python
  __all__ = [
      "DatabaseConnection",
      "Product",
      "User",
  ]
  ```

- **Exception:** If this is intended, add `{"rule":"RUF068","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/duplicate-entry-in-dunder-all/)

<a id="ruff-ruf071"></a>

### `ruff/RUF071`

Checks for uses of `os.path.commonprefix`.

- **Why it is on:** `os.path.commonprefix` performs a character-by-character string comparison rather than comparing path components. This leads to incorrect results when paths share a common string prefix that is not a valid path component. `os.path.commonpath` correctly compares path components. Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`os-path-commonprefix`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/os-path-commonprefix/).
- **Example of the allowed form:**

  ```python
  import os

  # Returns "/usr" — correct common path
  os.path.commonpath(["/usr/lib", "/usr/local/lib"])
  ```

- **Exception:** If this is intended, add `{"rule":"RUF071","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/os-path-commonprefix/)

<a id="ruff-ruf101"></a>

### `ruff/RUF101`

Checks for `noqa` directives that use redirected rule codes.

- **Why it is on:** When one of Ruff's rule codes has been redirected, the implication is that the rule has been deprecated in favor of another rule or code. To keep your codebase consistent and up-to-date, prefer the canonical rule code over the deprecated code. Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`redirected-noqa`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/redirected-noqa/).
- **Example of the allowed form:**

  ```python
  x = eval(command)  # noqa: S307
  ```

- **Exception:** If this is intended, add `{"rule":"RUF101","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/redirected-noqa/)

<a id="ruff-ruf102"></a>

### `ruff/RUF102`

Checks for `noqa` codes that are invalid.

- **Why it is on:** Invalid rule codes serve no purpose and may indicate outdated code suppressions. Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`invalid-rule-code`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/invalid-rule-code/).
- **Example of the allowed form:**

  ```python
  import os
  ```

- **Exception:** If this is intended, add `{"rule":"RUF102","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/invalid-rule-code/)

<a id="ruff-ruf103"></a>

### `ruff/RUF103`

Checks for invalid suppression comments.

- **Why it is on:** Invalid suppression comments are ignored by Ruff, and should either be fixed or removed to avoid confusion. Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`invalid-suppression-comment`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/invalid-suppression-comment/).
- **Example of the allowed form:**

  ```python
  # ruff: disable[E501]
  ```

- **Exception:** If this is intended, add `{"rule":"RUF103","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/invalid-suppression-comment/)

<a id="ruff-ruf104"></a>

### `ruff/RUF104`

Checks for unmatched range suppression comments.

- **Why it is on:** Unmatched range suppression comments can inadvertently suppress violations over larger sections of code than intended, particularly at module scope. Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`unmatched-suppression-comment`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unmatched-suppression-comment/).
- **Example of the allowed form:**

  ```python
  def foo():
      # ruff: disable[E501]
      REALLY_LONG_VALUES = [...]
      # ruff: enable[E501]

      print(REALLY_LONG_VALUES)
  ```

- **Exception:** If this is intended, add `{"rule":"RUF104","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unmatched-suppression-comment/)

<a id="ruff-ruf200"></a>

### `ruff/RUF200`

Checks for any pyproject.toml that does not conform to the schema from the relevant PEPs.

- **Why it is on:** Your project may contain invalid metadata or configuration without you noticing. Selected in the ruff config of the Python preset, with the Ruff-specific rules rules (`invalid-pyproject-toml`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/invalid-pyproject-toml/).
- **Exception:** If this is intended, add `{"rule":"RUF200","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/invalid-pyproject-toml/)

<a id="ruff-s102"></a>

### `ruff/S102`

Checks for uses of the builtin `exec` function.

- **Why it is on:** The `exec()` function is insecure as it allows for arbitrary code execution. Selected in the ruff config of the Python preset, with the flake8-bandit rules (`exec-builtin`).
- **Allowed form:** Parse literals with `ast.literal_eval(text)` and call code by name, `getattr(module, name)()`; do not run strings as code.
- **Exception:** If this is intended, add `{"rule":"S102","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/exec-builtin/)

<a id="ruff-s108"></a>

### `ruff/S108`

Checks for the use of hardcoded temporary file or directory paths.

- **Why it is on:** The use of hardcoded paths for temporary files can be insecure. If an attacker discovers the location of a hardcoded path, they can replace the contents of the file or directory with a malicious payload. Other programs may also read or write contents to these hardcoded paths, causing unexpected behavior. Selected in the ruff config of the Python preset, with the flake8-bandit rules (`hardcoded-temp-file`).
- **Allowed form:** Create temporary files with `tempfile.NamedTemporaryFile`, `tempfile.mkstemp` or `tempfile.TemporaryDirectory`, not a fixed path.
- **Example of the allowed form:**

  ```python
  import tempfile

  with tempfile.NamedTemporaryFile() as file:
      ...
  ```

- **Exception:** If this is intended, add `{"rule":"S108","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/hardcoded-temp-file/)

<a id="ruff-s113"></a>

### `ruff/S113`

Checks for uses of the Python `requests` or `httpx` module that omit the `timeout` parameter.

- **Why it is on:** The `timeout` parameter is used to set the maximum time to wait for a response from the server. By omitting the `timeout` parameter, the program may hang indefinitely while awaiting a response. Selected in the ruff config of the Python preset, with the flake8-bandit rules (`request-without-timeout`).
- **Allowed form:** Pass a timeout in seconds: `requests.get(url, timeout=10)`; an `httpx` call or client keeps its 5 second default unless you pass another number, never `timeout=None`.
- **Example of the allowed form:**

  ```python
  import requests

  requests.get("https://www.example.com/", timeout=10)
  ```

- **Exception:** If this is intended, add `{"rule":"S113","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/request-without-timeout/)

<a id="ruff-s201"></a>

### `ruff/S201`

Checks for uses of `debug=True` in Flask.

- **Why it is on:** Enabling debug mode shows an interactive debugger in the browser if an error occurs, and allows running arbitrary Python code from the browser. This could leak sensitive information, or allow an attacker to run arbitrary code. Selected in the ruff config of the Python preset, with the flake8-bandit rules (`flask-debug-true`).
- **Allowed form:** Leave `debug` off in code and start the debugger through configuration: `flask --debug run`.
- **Example of the allowed form:**

  ```python
  import os

  from flask import Flask

  app = Flask()

  app.run(debug=os.environ["ENV"] == "dev")
  ```

- **Exception:** If this is intended, add `{"rule":"S201","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/flask-debug-true/)

<a id="ruff-s202"></a>

### `ruff/S202`

Checks for uses of `tarfile.extractall`.

- **Why it is on:** Extracting archives from untrusted sources without prior inspection is a security risk, as maliciously crafted archives may contain files that will be written outside of the target directory. For example, the archive could include files with absolute paths (e.g., `/etc/passwd`), or relative paths with parent directory references (e.g., `../etc/passwd`). On Python 3.12 and later, use `filter='data'` to prevent the most dangerous security issues (see: PEP 706). On earlier versions, set the `members` argument to a trusted subset of the archive's members. Selected in the ruff config of the Python preset, with the flake8-bandit rules (`tarfile-unsafe-members`).
- **Allowed form:** Extract with a filter: `tar.extractall(path, filter="data")`.
- **Exception:** If this is intended, add `{"rule":"S202","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/tarfile-unsafe-members/)

<a id="ruff-s301"></a>

### `ruff/S301`

Checks for calls to `pickle` functions or modules that wrap them.

- **Why it is on:** Deserializing untrusted data with `pickle` and other deserialization modules is insecure as it can allow for the creation of arbitrary objects, which can then be used to achieve arbitrary code execution and otherwise unexpected behavior. Avoid deserializing untrusted data with `pickle` and other deserialization modules. Instead, consider safer formats, such as JSON. Selected in the ruff config of the Python preset, with the flake8-bandit rules (`suspicious-pickle-usage`).
- **Allowed form:** Exchange data in a format that cannot run code, such as JSON: `json.loads(text)`, and validate it at the boundary; copy an object with `copy.deepcopy(value)`, not a pickle round trip.
- **Example of the allowed form:**

  ```python
  import json

  with open("foo.json", "rb") as file:
      foo = json.load(file)
  ```

- **Exception:** If this is intended, add `{"rule":"S301","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/suspicious-pickle-usage/)

<a id="ruff-s302"></a>

### `ruff/S302`

Checks for calls to `marshal` functions.

- **Why it is on:** Deserializing untrusted data with `marshal` is insecure, as it can allow for the creation of arbitrary objects, which can then be used to achieve arbitrary code execution and otherwise unexpected behavior. Avoid deserializing untrusted data with `marshal`. Instead, consider safer formats, such as JSON. Selected in the ruff config of the Python preset, with the flake8-bandit rules (`suspicious-marshal-usage`).
- **Allowed form:** Exchange data in a format that cannot run code, such as JSON: `json.loads(text)`, and validate it at the boundary; copy an object with `copy.deepcopy(value)`, not a pickle round trip.
- **Example of the allowed form:**

  ```python
  import json

  with open("foo.json", "rb") as file:
      foo = json.load(file)
  ```

- **Exception:** If this is intended, add `{"rule":"S302","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/suspicious-marshal-usage/)

<a id="ruff-s303"></a>

### `ruff/S303`

Checks for uses of weak or broken cryptographic hash functions.

- **Why it is on:** Weak or broken cryptographic hash functions may be susceptible to collision attacks (where two different inputs produce the same hash) or pre-image attacks (where an attacker can find an input that produces a given hash). This can lead to security vulnerabilities in applications that rely on these hash functions. Avoid using weak or broken cryptographic hash functions in security contexts. Instead, use a known secure hash function such as SHA-256. Selected in the ruff config of the Python preset, with the flake8-bandit rules (`suspicious-insecure-hash-usage`).
- **Allowed form:** Hash with `hashlib.sha256(...)` or stronger; a digest that is no security measure (a cache key, a checksum) passes `usedforsecurity=False`; sign with `hmac.new(key, message, hashlib.sha256)`.
- **Example of the allowed form:**

  ```python
  from cryptography.hazmat.primitives import hashes

  digest = hashes.Hash(hashes.SHA256())
  digest.update(b"Hello, world!")
  digest.finalize()
  ```

- **Exception:** If this is intended, add `{"rule":"S303","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/suspicious-insecure-hash-usage/)

<a id="ruff-s304"></a>

### `ruff/S304`

Checks for uses of weak or broken cryptographic ciphers.

- **Why it is on:** Weak or broken cryptographic ciphers may be susceptible to attacks that allow an attacker to decrypt ciphertext without knowing the key or otherwise compromise the security of the cipher, such as forgeries. Use strong, modern cryptographic ciphers instead of weak or broken ones. Selected in the ruff config of the Python preset, with the flake8-bandit rules (`suspicious-insecure-cipher-usage`).
- **Allowed form:** Encrypt with an authenticated mode from `cryptography`: `AESGCM(key)` or `ChaCha20Poly1305(key)`.
- **Example of the allowed form:**

  ```python
  from cryptography.fernet import Fernet

  fernet = Fernet(key)
  ```

- **Exception:** If this is intended, add `{"rule":"S304","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/suspicious-insecure-cipher-usage/)

<a id="ruff-s305"></a>

### `ruff/S305`

Checks for uses of weak or broken cryptographic cipher modes.

- **Why it is on:** Weak or broken cryptographic ciphers may be susceptible to attacks that allow an attacker to decrypt ciphertext without knowing the key or otherwise compromise the security of the cipher, such as forgeries. Use strong, modern cryptographic ciphers instead of weak or broken ones. Selected in the ruff config of the Python preset, with the flake8-bandit rules (`suspicious-insecure-cipher-mode-usage`).
- **Allowed form:** Encrypt with an authenticated mode from `cryptography`: `AESGCM(key)` or `ChaCha20Poly1305(key)`.
- **Example of the allowed form:**

  ```python
  from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

  algorithm = algorithms.ARC4(key)
  cipher = Cipher(algorithm, mode=modes.CTR(iv))
  encryptor = cipher.encryptor()
  ```

- **Exception:** If this is intended, add `{"rule":"S305","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/suspicious-insecure-cipher-mode-usage/)

<a id="ruff-s306"></a>

### `ruff/S306`

Checks for uses of `tempfile.mktemp`.

- **Why it is on:** `tempfile.mktemp` returns a pathname of a file that does not exist at the time the call is made; then, the caller is responsible for creating the file and subsequently using it. This is insecure because another process could create a file with the same name between the time the function returns and the time the caller creates the file. `tempfile.mktemp` is deprecated in favor of `tempfile.mkstemp` which creates the file when it is called. Consider using `tempfile.mkstemp` instead, either directly or via a context manager such as `tempfile.TemporaryFile`. Selected in the ruff config of the Python preset, with the flake8-bandit rules (`suspicious-mktemp-usage`).
- **Allowed form:** Create temporary files with `tempfile.NamedTemporaryFile`, `tempfile.mkstemp` or `tempfile.TemporaryDirectory`, not a fixed path.
- **Example of the allowed form:**

  ```python
  import tempfile

  with tempfile.TemporaryFile() as file:
      file.write("Hello, world!")
  ```

- **Exception:** If this is intended, add `{"rule":"S306","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/suspicious-mktemp-usage/)

<a id="ruff-s307"></a>

### `ruff/S307`

Checks for uses of the builtin `eval()` function.

- **Why it is on:** The `eval()` function is insecure as it enables arbitrary code execution. If you need to evaluate an expression from a string, consider using `ast.literal_eval()` instead, which will raise an exception if the expression is not a valid Python literal. Selected in the ruff config of the Python preset, with the flake8-bandit rules (`suspicious-eval-usage`).
- **Allowed form:** Parse literals with `ast.literal_eval(text)` and call code by name, `getattr(module, name)()`; do not run strings as code.
- **Example of the allowed form:**

  ```python
  from ast import literal_eval

  x = literal_eval(input("Enter a number: "))
  ```

- **Exception:** If this is intended, add `{"rule":"S307","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/suspicious-eval-usage/)

<a id="ruff-s308"></a>

### `ruff/S308`

Checks for uses of calls to `django.utils.safestring.mark_safe`.

- **Why it is on:** Cross-site scripting (XSS) vulnerabilities allow attackers to execute arbitrary JavaScript. To guard against XSS attacks, Django templates assumes that data is unsafe and automatically escapes malicious strings before rending them. `django.utils.safestring.mark_safe` marks a string as safe for use in HTML templates, bypassing XSS protection. Its usage can be dangerous if the contents of the string are dynamically generated, because it may allow cross-site scripting attacks if the string is not properly escaped. Selected in the ruff config of the Python preset, with the flake8-bandit rules (`suspicious-mark-safe-usage`).
- **Allowed form:** Escape the value: `django.utils.html.format_html("<b>{}</b>", value)` or `markupsafe.escape(value)`; mark only literals as safe.
- **Example of the allowed form:**

  ```python
  from django.utils.html import format_html


  def render_username(username):
      return format_html("<i>{}</i>", username)  # username is escaped.
  ```

- **Exception:** If this is intended, add `{"rule":"S308","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/suspicious-mark-safe-usage/)

<a id="ruff-s312"></a>

### `ruff/S312`

Checks for the use of Telnet-related functions.

- **Why it is on:** Telnet is considered insecure because it does not encrypt data sent over the connection and is vulnerable to numerous attacks. Instead, consider using a more secure protocol such as SSH. Selected in the ruff config of the Python preset, with the flake8-bandit rules (`suspicious-telnet-usage`).
- **Allowed form:** Use SSH or SFTP (`paramiko`), or HTTPS, which encrypt the connection.
- **Exception:** If this is intended, add `{"rule":"S312","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/suspicious-telnet-usage/)

<a id="ruff-s313"></a>

### `ruff/S313`

Checks for uses of insecure XML parsers.

- **Why it is on:** Many XML parsers are vulnerable to XML attacks (such as entity expansion), which cause excessive memory and CPU usage by exploiting recursion. An attacker could use such methods to access unauthorized resources. Consider using the `defusedxml` package when parsing untrusted XML data, to protect against XML attacks. Selected in the ruff config of the Python preset, with the flake8-bandit rules (`suspicious-xmlc-element-tree-usage`).
- **Allowed form:** Parse untrusted XML with `defusedxml` (`from defusedxml import ElementTree`); add `defusedxml` and `types-defusedxml` to the dependencies.
- **Example of the allowed form:**

  ```python
  from defusedxml.cElementTree import parse

  tree = parse("untrusted.xml")
  ```

- **Exception:** If this is intended, add `{"rule":"S313","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/suspicious-xmlc-element-tree-usage/)

<a id="ruff-s314"></a>

### `ruff/S314`

Checks for uses of insecure XML parsers.

- **Why it is on:** Many XML parsers are vulnerable to XML attacks (such as entity expansion), which cause excessive memory and CPU usage by exploiting recursion. An attacker could use such methods to access unauthorized resources. Consider using the `defusedxml` package when parsing untrusted XML data, to protect against XML attacks. Selected in the ruff config of the Python preset, with the flake8-bandit rules (`suspicious-xml-element-tree-usage`).
- **Allowed form:** Parse untrusted XML with `defusedxml` (`from defusedxml import ElementTree`); add `defusedxml` and `types-defusedxml` to the dependencies.
- **Example of the allowed form:**

  ```python
  from defusedxml.ElementTree import parse

  tree = parse("untrusted.xml")
  ```

- **Exception:** If this is intended, add `{"rule":"S314","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/suspicious-xml-element-tree-usage/)

<a id="ruff-s315"></a>

### `ruff/S315`

Checks for uses of insecure XML parsers.

- **Why it is on:** Many XML parsers are vulnerable to XML attacks (such as entity expansion), which cause excessive memory and CPU usage by exploiting recursion. An attacker could use such methods to access unauthorized resources. Consider using the `defusedxml` package when parsing untrusted XML data, to protect against XML attacks. Selected in the ruff config of the Python preset, with the flake8-bandit rules (`suspicious-xml-expat-reader-usage`).
- **Allowed form:** Parse untrusted XML with `defusedxml` (`from defusedxml import ElementTree`); add `defusedxml` and `types-defusedxml` to the dependencies.
- **Example of the allowed form:**

  ```python
  from defusedxml.sax import create_parser

  parser = create_parser()
  ```

- **Exception:** If this is intended, add `{"rule":"S315","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/suspicious-xml-expat-reader-usage/)

<a id="ruff-s316"></a>

### `ruff/S316`

Checks for uses of insecure XML parsers.

- **Why it is on:** Many XML parsers are vulnerable to XML attacks (such as entity expansion), which cause excessive memory and CPU usage by exploiting recursion. An attacker could use such methods to access unauthorized resources. Consider using the `defusedxml` package when parsing untrusted XML data, to protect against XML attacks. Selected in the ruff config of the Python preset, with the flake8-bandit rules (`suspicious-xml-expat-builder-usage`).
- **Allowed form:** Parse untrusted XML with `defusedxml` (`from defusedxml import ElementTree`); add `defusedxml` and `types-defusedxml` to the dependencies.
- **Example of the allowed form:**

  ```python
  from defusedxml.expatbuilder import parse

  tree = parse("untrusted.xml")
  ```

- **Exception:** If this is intended, add `{"rule":"S316","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/suspicious-xml-expat-builder-usage/)

<a id="ruff-s317"></a>

### `ruff/S317`

Checks for uses of insecure XML parsers.

- **Why it is on:** Many XML parsers are vulnerable to XML attacks (such as entity expansion), which cause excessive memory and CPU usage by exploiting recursion. An attacker could use such methods to access unauthorized resources. Consider using the `defusedxml` package when parsing untrusted XML data, to protect against XML attacks. Selected in the ruff config of the Python preset, with the flake8-bandit rules (`suspicious-xml-sax-usage`).
- **Allowed form:** Parse untrusted XML with `defusedxml` (`from defusedxml import ElementTree`); add `defusedxml` and `types-defusedxml` to the dependencies.
- **Example of the allowed form:**

  ```python
  from defusedxml.sax import make_parser

  make_parser()
  ```

- **Exception:** If this is intended, add `{"rule":"S317","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/suspicious-xml-sax-usage/)

<a id="ruff-s318"></a>

### `ruff/S318`

Checks for uses of insecure XML parsers.

- **Why it is on:** Many XML parsers are vulnerable to XML attacks (such as entity expansion), which cause excessive memory and CPU usage by exploiting recursion. An attacker could use such methods to access unauthorized resources. Consider using the `defusedxml` package when parsing untrusted XML data, to protect against XML attacks. Selected in the ruff config of the Python preset, with the flake8-bandit rules (`suspicious-xml-mini-dom-usage`).
- **Allowed form:** Parse untrusted XML with `defusedxml` (`from defusedxml import ElementTree`); add `defusedxml` and `types-defusedxml` to the dependencies.
- **Example of the allowed form:**

  ```python
  from defusedxml.minidom import parse

  content = parse("untrusted.xml")
  ```

- **Exception:** If this is intended, add `{"rule":"S318","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/suspicious-xml-mini-dom-usage/)

<a id="ruff-s319"></a>

### `ruff/S319`

Checks for uses of insecure XML parsers.

- **Why it is on:** Many XML parsers are vulnerable to XML attacks (such as entity expansion), which cause excessive memory and CPU usage by exploiting recursion. An attacker could use such methods to access unauthorized resources. Consider using the `defusedxml` package when parsing untrusted XML data, to protect against XML attacks. Selected in the ruff config of the Python preset, with the flake8-bandit rules (`suspicious-xml-pull-dom-usage`).
- **Allowed form:** Parse untrusted XML with `defusedxml` (`from defusedxml import ElementTree`); add `defusedxml` and `types-defusedxml` to the dependencies.
- **Example of the allowed form:**

  ```python
  from defusedxml.pulldom import parse

  content = parse("untrusted.xml")
  ```

- **Exception:** If this is intended, add `{"rule":"S319","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/suspicious-xml-pull-dom-usage/)

<a id="ruff-s321"></a>

### `ruff/S321`

Checks for the use of FTP-related functions.

- **Why it is on:** FTP is considered insecure as it does not encrypt data sent over the connection and is thus vulnerable to numerous attacks. Instead, consider using FTPS (which secures FTP using SSL/TLS) or SFTP. Selected in the ruff config of the Python preset, with the flake8-bandit rules (`suspicious-ftp-lib-usage`).
- **Allowed form:** Use SSH or SFTP (`paramiko`), or HTTPS, which encrypt the connection.
- **Exception:** If this is intended, add `{"rule":"S321","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/suspicious-ftp-lib-usage/)

<a id="ruff-s323"></a>

### `ruff/S323`

Checks for uses of `ssl._create_unverified_context`.

- **Why it is on:** PEP 476 enabled certificate and hostname validation by default in Python standard library HTTP clients. Previously, Python did not validate certificates by default, which could allow an attacker to perform a "man in the middle" attack by intercepting and modifying traffic between client and server. To support legacy environments, `ssl._create_unverified_context` reverts to the previous behavior that does perform verification. Otherwise, use `ssl.create_default_context` to create a secure context. Selected in the ruff config of the Python preset, with the flake8-bandit rules (`suspicious-unverified-context-usage`).
- **Allowed form:** Use `ssl.create_default_context()` and keep its certificate and hostname checks and its TLS version defaults.
- **Example of the allowed form:**

  ```python
  import ssl

  context = ssl.create_default_context()
  ```

- **Exception:** If this is intended, add `{"rule":"S323","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/suspicious-unverified-context-usage/)

<a id="ruff-s324"></a>

### `ruff/S324`

Checks for uses of weak or broken cryptographic hash functions in `hashlib` and `crypt` libraries.

- **Why it is on:** Weak or broken cryptographic hash functions may be susceptible to collision attacks (where two different inputs produce the same hash) or pre-image attacks (where an attacker can find an input that produces a given hash). This can lead to security vulnerabilities in applications that rely on these hash functions. Avoid using weak or broken cryptographic hash functions in security contexts. Instead, use a known secure hash function such as SHA256. Selected in the ruff config of the Python preset, with the flake8-bandit rules (`hashlib-insecure-hash-function`).
- **Allowed form:** Hash with `hashlib.sha256(...)` or stronger; a digest that is no security measure (a cache key, a checksum) passes `usedforsecurity=False`; sign with `hmac.new(key, message, hashlib.sha256)`.
- **Example of the allowed form:**

  ```python
  import hashlib


  def certificate_is_valid(certificate: bytes, known_hash: str) -> bool:
      hash = hashlib.sha256(certificate).hexdigest()
      return hash == known_hash
  ```

- **Exception:** If this is intended, add `{"rule":"S324","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/hashlib-insecure-hash-function/)

<a id="ruff-s501"></a>

### `ruff/S501`

Checks for HTTPS requests that disable SSL certificate checks.

- **Why it is on:** If SSL certificates are not verified, an attacker could perform a "man in the middle" attack by intercepting and modifying traffic between the client and server. Selected in the ruff config of the Python preset, with the flake8-bandit rules (`request-with-no-cert-validation`).
- **Allowed form:** Keep certificate verification on, the default; for a private CA pass its bundle: `requests.get(url, verify="/path/ca.pem", timeout=10)`.
- **Example of the allowed form:**

  ```python
  import requests

  requests.get("https://www.example.com")  # By default, `verify=True`.
  ```

- **Exception:** If this is intended, add `{"rule":"S501","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/request-with-no-cert-validation/)

<a id="ruff-s502"></a>

### `ruff/S502`

Checks for function calls with parameters that indicate the use of insecure SSL and TLS protocol versions.

- **Why it is on:** Several highly publicized exploitable flaws have been discovered in all versions of SSL and early versions of TLS. The following versions are considered insecure, and should be avoided: - SSL v2 - SSL v3 - TLS v1 - TLS v1.1 This method supports detection on the Python's built-in `ssl` module and the `pyOpenSSL` module. Selected in the ruff config of the Python preset, with the flake8-bandit rules (`ssl-insecure-version`).
- **Allowed form:** Use `ssl.create_default_context()` and keep its certificate and hostname checks and its TLS version defaults.
- **Example of the allowed form:**

  ```python
  import ssl

  ssl.wrap_socket(ssl_version=ssl.PROTOCOL_TLSv1_2)
  ```

- **Exception:** If this is intended, add `{"rule":"S502","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/ssl-insecure-version/)

<a id="ruff-s503"></a>

### `ruff/S503`

Checks for function definitions with default arguments set to insecure SSL and TLS protocol versions.

- **Why it is on:** Several highly publicized exploitable flaws have been discovered in all versions of SSL and early versions of TLS. The following versions are considered insecure, and should be avoided: - SSL v2 - SSL v3 - TLS v1 - TLS v1.1 Selected in the ruff config of the Python preset, with the flake8-bandit rules (`ssl-with-bad-defaults`).
- **Allowed form:** Use `ssl.create_default_context()` and keep its certificate and hostname checks and its TLS version defaults.
- **Example of the allowed form:**

  ```python
  import ssl


  def func(version=ssl.PROTOCOL_TLSv1_2): ...
  ```

- **Exception:** If this is intended, add `{"rule":"S503","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/ssl-with-bad-defaults/)

<a id="ruff-s504"></a>

### `ruff/S504`

Checks for calls to `ssl.wrap_socket()` without an `ssl_version`.

- **Why it is on:** This method is known to provide a default value that maximizes compatibility, but permits use of insecure protocols. Selected in the ruff config of the Python preset, with the flake8-bandit rules (`ssl-with-no-version`).
- **Allowed form:** Use `ssl.create_default_context()` and keep its certificate and hostname checks and its TLS version defaults.
- **Example of the allowed form:**

  ```python
  import ssl

  ssl.wrap_socket(ssl_version=ssl.PROTOCOL_TLSv1_2)
  ```

- **Exception:** If this is intended, add `{"rule":"S504","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/ssl-with-no-version/)

<a id="ruff-s505"></a>

### `ruff/S505`

Checks for uses of cryptographic keys with vulnerable key sizes.

- **Why it is on:** Small keys are easily breakable. For DSA and RSA, keys should be at least 2048 bits long. For EC, keys should be at least 224 bits long. Selected in the ruff config of the Python preset, with the flake8-bandit rules (`weak-cryptographic-key`).
- **Allowed form:** Use keys of at least 2048 bits for RSA and DSA: `rsa.generate_private_key(65537, 3072)`.
- **Example of the allowed form:**

  ```python
  from cryptography.hazmat.primitives.asymmetric import dsa, ec

  dsa.generate_private_key(key_size=4096)
  ec.generate_private_key(curve=ec.SECP384R1())
  ```

- **Exception:** If this is intended, add `{"rule":"S505","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/weak-cryptographic-key/)

<a id="ruff-s506"></a>

### `ruff/S506`

Checks for uses of the `yaml.load` function.

- **Why it is on:** Running the `yaml.load` function over untrusted YAML files is insecure, as `yaml.load` allows for the creation of arbitrary Python objects, which can then be used to execute arbitrary code. Instead, consider using `yaml.safe_load`, which allows for the creation of simple Python objects like integers and lists, but prohibits the creation of more complex objects like functions and classes. Selected in the ruff config of the Python preset, with the flake8-bandit rules (`unsafe-yaml-load`).
- **Allowed form:** Load YAML with `yaml.safe_load(text)`, or `yaml.load(text, Loader=yaml.SafeLoader)` with `SafeLoader` or a subclass of it.
- **Example of the allowed form:**

  ```python
  import yaml

  yaml.safe_load(untrusted_yaml)
  ```

- **Exception:** If this is intended, add `{"rule":"S506","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unsafe-yaml-load/)

<a id="ruff-s507"></a>

### `ruff/S507`

Checks for uses of policies disabling SSH verification in Paramiko.

- **Why it is on:** By default, Paramiko checks the identity of the remote host when establishing an SSH connection. Disabling the verification might lead to the client connecting to a malicious host, without the client knowing. Selected in the ruff config of the Python preset, with the flake8-bandit rules (`ssh-no-host-key-verification`).
- **Allowed form:** Verify the host key: `client.load_system_host_keys()` and `client.set_missing_host_key_policy(paramiko.RejectPolicy())`.
- **Example of the allowed form:**

  ```python
  from paramiko import client

  ssh_client = client.SSHClient()
  ssh_client.set_missing_host_key_policy(client.RejectPolicy)
  ```

- **Exception:** If this is intended, add `{"rule":"S507","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/ssh-no-host-key-verification/)

<a id="ruff-s508"></a>

### `ruff/S508`

Checks for uses of SNMPv1 or SNMPv2.

- **Why it is on:** The SNMPv1 and SNMPv2 protocols are considered insecure as they do not support encryption. Instead, prefer SNMPv3, which supports encryption. Selected in the ruff config of the Python preset, with the flake8-bandit rules (`snmp-insecure-version`).
- **Allowed form:** Use SNMPv3 with authentication and privacy: `UsmUserData(user, authKey, privKey)`.
- **Example of the allowed form:**

  ```python
  from pysnmp.hlapi import CommunityData

  CommunityData("public", mpModel=2)
  ```

- **Exception:** If this is intended, add `{"rule":"S508","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/snmp-insecure-version/)

<a id="ruff-s509"></a>

### `ruff/S509`

Checks for uses of the SNMPv3 protocol without encryption.

- **Why it is on:** Unencrypted SNMPv3 communication can be intercepted and read by unauthorized parties. Instead, enable encryption when using SNMPv3. Selected in the ruff config of the Python preset, with the flake8-bandit rules (`snmp-weak-cryptography`).
- **Allowed form:** Use SNMPv3 with authentication and privacy: `UsmUserData(user, authKey, privKey)`.
- **Example of the allowed form:**

  ```python
  from pysnmp.hlapi import UsmUserData

  UsmUserData("user", "authkey", "privkey")
  ```

- **Exception:** If this is intended, add `{"rule":"S509","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/snmp-weak-cryptography/)

<a id="ruff-s602"></a>

### `ruff/S602`

Check for method calls that initiate a subprocess with a shell.

- **Why it is on:** Starting a subprocess with a shell can allow attackers to execute arbitrary shell commands. Consider starting the process without a shell call and sanitize the input to mitigate the risk of shell injection. Selected in the ruff config of the Python preset, with the flake8-bandit rules (`subprocess-popen-with-shell-equals-true`).
- **Allowed form:** Pass the command as a list and leave `shell=True` out: `subprocess.run(["git", "status"], check=True)`.
- **Example of the allowed form:**

  ```python
  import subprocess

  subprocess.run(["ls", "-l"])
  ```

- **Exception:** If this is intended, add `{"rule":"S602","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/subprocess-popen-with-shell-equals-true/)

<a id="ruff-s604"></a>

### `ruff/S604`

Checks for method calls that set the `shell` parameter to `true` or another truthy value when invoking a subprocess.

- **Why it is on:** Setting the `shell` parameter to `true` or another truthy value when invoking a subprocess can introduce security vulnerabilities, as it allows shell metacharacters and whitespace to be passed to child processes, potentially leading to shell injection attacks. It is recommended to avoid using `shell=True` unless absolutely necessary and, when used, to ensure that all inputs are properly sanitized and quoted to prevent such vulnerabilities. Selected in the ruff config of the Python preset, with the flake8-bandit rules (`call-with-shell-equals-true`).
- **Allowed form:** Pass the command as a list and leave `shell=True` out: `subprocess.run(["git", "status"], check=True)`.
- **Exception:** If this is intended, add `{"rule":"S604","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/call-with-shell-equals-true/)

<a id="ruff-s605"></a>

### `ruff/S605`

Checks for calls that start a process with a shell, providing guidance on whether the usage is safe or not.

- **Why it is on:** Starting a process with a shell can introduce security risks, such as code injection vulnerabilities. It's important to be aware of whether the usage of the shell is safe or not. This rule triggers on functions like `os.system`, `popen`, etc., which start processes with a shell. It evaluates whether the provided command is a literal string or an expression. If the command is a literal string, it's considered safe. If the command is an expression, it's considered (potentially) unsafe. Selected in the ruff config of the Python preset, with the flake8-bandit rules (`start-process-with-a-shell`).
- **Allowed form:** Pass the command as a list and leave `shell=True` out: `subprocess.run(["git", "status"], check=True)`.
- **Exception:** If this is intended, add `{"rule":"S605","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/start-process-with-a-shell/)

<a id="ruff-s609"></a>

### `ruff/S609`

Checks for possible wildcard injections in calls to `subprocess.Popen()`.

- **Why it is on:** Wildcard injections can lead to unexpected behavior if unintended files are matched by the wildcard. Consider using a more specific path instead. Selected in the ruff config of the Python preset, with the flake8-bandit rules (`unix-command-wildcard-injection`).
- **Allowed form:** Expand the files in Python, `sorted(Path(directory).glob("*.log"))`, and pass them as separate list items.
- **Example of the allowed form:**

  ```python
  import subprocess

  subprocess.Popen(["chmod", "777", "main.py"], shell=True)
  ```

- **Exception:** If this is intended, add `{"rule":"S609","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unix-command-wildcard-injection/)

<a id="ruff-s610"></a>

### `ruff/S610`

Checks for uses of Django's `extra` function where one or more arguments passed are not literal expressions.

- **Why it is on:** Django's `extra` function can be used to execute arbitrary SQL queries, which can in turn lead to SQL injection vulnerabilities. Selected in the ruff config of the Python preset, with the flake8-bandit rules (`django-extra`).
- **Allowed form:** Use the ORM query API, or pass the values as parameters: `Model.objects.raw("SELECT ... WHERE id = %s", [value])`.
- **Example of the allowed form:**

  ```python
  from django.contrib.auth.models import User

  # SQL injection is impossible if all arguments are literal expressions:
  User.objects.all().extra(select={"test": "secure"})
  ```

- **Exception:** If this is intended, add `{"rule":"S610","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/django-extra/)

<a id="ruff-s611"></a>

### `ruff/S611`

Checks for uses of Django's `RawSQL` function.

- **Why it is on:** Django's `RawSQL` function can be used to execute arbitrary SQL queries, which can in turn lead to SQL injection vulnerabilities. Selected in the ruff config of the Python preset, with the flake8-bandit rules (`django-raw-sql`).
- **Allowed form:** Use the ORM query API, or pass the values as parameters: `Model.objects.raw("SELECT ... WHERE id = %s", [value])`.
- **Exception:** If this is intended, add `{"rule":"S611","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/django-raw-sql/)

<a id="ruff-s612"></a>

### `ruff/S612`

Checks for insecure `logging.config.listen` calls.

- **Why it is on:** `logging.config.listen` starts a server that listens for logging configuration requests. This is insecure, as parts of the configuration are passed to the built-in `eval` function, which can be used to execute arbitrary code. Selected in the ruff config of the Python preset, with the flake8-bandit rules (`logging-config-insecure-listen`).
- **Allowed form:** Configure logging with `logging.config.dictConfig(...)` and do not open the `listen` socket.
- **Exception:** If this is intended, add `{"rule":"S612","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/logging-config-insecure-listen/)

<a id="ruff-s701"></a>

### `ruff/S701`

Checks for `jinja2` templates that use `autoescape=False`.

- **Why it is on:** `jinja2` templates that use `autoescape=False` are vulnerable to cross-site scripting (XSS) attacks that allow attackers to execute arbitrary JavaScript. By default, `jinja2` sets `autoescape` to `False`, so it is important to set `autoescape=True` or use the `select_autoescape` function to mitigate XSS vulnerabilities. Selected in the ruff config of the Python preset, with the flake8-bandit rules (`jinja2-autoescape-false`).
- **Allowed form:** Render with Jinja2 and escape by default: `jinja2.Environment(autoescape=jinja2.select_autoescape())`.
- **Example of the allowed form:**

  ```python
  import jinja2

  jinja2.Environment(loader=jinja2.FileSystemLoader("."), autoescape=True)
  ```

- **Exception:** If this is intended, add `{"rule":"S701","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/jinja2-autoescape-false/)

<a id="ruff-s702"></a>

### `ruff/S702`

Checks for uses of the `mako` templates.

- **Why it is on:** Mako templates allow HTML and JavaScript rendering by default, and are inherently open to XSS attacks. Ensure variables in all templates are properly escaped via the `h` (HTML) or `x` (XML) filters, depending on context. For example, to HTML escape the variable `data`, use `${ data |h }`. Selected in the ruff config of the Python preset, with the flake8-bandit rules (`mako-templates`).
- **Allowed form:** Render with Jinja2 and escape by default: `jinja2.Environment(autoescape=jinja2.select_autoescape())`.
- **Example of the allowed form:**

  ```python
  from mako.template import Template

  Template("${ data |h }")  # HTML-escaped with the `h` filter.
  ```

- **Exception:** If this is intended, add `{"rule":"S702","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/mako-templates/)

<a id="ruff-s704"></a>

### `ruff/S704`

Checks for non-literal strings being passed to `markupsafe.Markup`markupsafe-markup.

- **Why it is on:** `markupsafe.Markup`markupsafe-markup does not perform any escaping, so passing dynamic content, like f-strings, variables or interpolated strings will potentially lead to XSS vulnerabilities. Instead you should interpolate the `Markup` object. Selected in the ruff config of the Python preset, with the flake8-bandit rules (`unsafe-markup-use`).
- **Allowed form:** Escape the value: `django.utils.html.format_html("<b>{}</b>", value)` or `markupsafe.escape(value)`; mark only literals as safe.
- **Example of the allowed form:**

  ```python
  from markupsafe import Markup

  content = "<script>alert('Hello, world!')</script>"
  html = Markup("<b>{}</b>").format(content)  # Safe
  ```

- **Exception:** If this is intended, add `{"rule":"S704","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/unsafe-markup-use/)

<a id="ruff-sim101"></a>

### `ruff/SIM101`

Checks for multiple `isinstance` calls on the same target.

- **Why it is on:** To check if an object is an instance of any one of multiple types or classes, it is unnecessary to use multiple `isinstance` calls, as the second argument of the `isinstance` built-in function accepts a tuple of types and classes. Using a single `isinstance` call implements the same behavior with more concise code and clearer intent. Selected in the ruff config of the Python preset, with the flake8-simplify rules (`duplicate-isinstance-call`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/duplicate-isinstance-call/).
- **Example of the allowed form:**

  ```python
  if isinstance(obj, (int, float)):
      pass
  ```

- **Exception:** If this is intended, add `{"rule":"SIM101","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/duplicate-isinstance-call/)

<a id="ruff-sim102"></a>

### `ruff/SIM102`

Checks for nested `if` statements that can be collapsed into a single `if` statement.

- **Why it is on:** Nesting `if` statements leads to deeper indentation and makes code harder to read. Instead, combine the conditions into a single `if` statement with an `and` operator. Selected in the ruff config of the Python preset, with the flake8-simplify rules (`collapsible-if`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/collapsible-if/).
- **Example of the allowed form:**

  ```python
  if foo and bar:
      ...
  ```

- **Exception:** If this is intended, add `{"rule":"SIM102","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/collapsible-if/)

<a id="ruff-sim103"></a>

### `ruff/SIM103`

Checks for `if` statements that can be replaced with `bool`.

- **Why it is on:** `if` statements that return `True` for a truthy condition and `False` for a falsy condition can be replaced with boolean casts. Selected in the ruff config of the Python preset, with the flake8-simplify rules (`needless-bool`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/needless-bool/).
- **Example of the allowed form:**

  ```python
  def foo(x: int) -> bool:
      return x > 0
  ```

- **Exception:** If this is intended, add `{"rule":"SIM103","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/needless-bool/)

<a id="ruff-sim107"></a>

### `ruff/SIM107`

Checks for `return` statements in `try`-`except` and `finally` blocks.

- **Why it is on:** The `return` statement in a `finally` block will always be executed, even if an exception is raised in the `try` or `except` block. This can lead to unexpected behavior. Selected in the ruff config of the Python preset, with the flake8-simplify rules (`return-in-try-except-finally`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/return-in-try-except-finally/).
- **Example of the allowed form:**

  ```python
  def squared(n):
      try:
          return_value = n**2
      except Exception:
          return_value = "An exception occurred"
      finally:
          return_value = -1
      return return_value
  ```

- **Exception:** If this is intended, add `{"rule":"SIM107","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/return-in-try-except-finally/)

<a id="ruff-sim108"></a>

### `ruff/SIM108`

Check for `if`-`else`-blocks that can be replaced with a ternary or binary operator.

- **Why it is on:** `if`-`else`-blocks that assign a value to a variable in both branches can be expressed more concisely by using a ternary or binary operator. Selected in the ruff config of the Python preset, with the flake8-simplify rules (`if-else-block-instead-of-if-exp`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/if-else-block-instead-of-if-exp/).
- **Example of the allowed form:**

  ```python
  bar = x if foo else y
  ```

- **Exception:** If this is intended, add `{"rule":"SIM108","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/if-else-block-instead-of-if-exp/)

<a id="ruff-sim109"></a>

### `ruff/SIM109`

Checks for boolean expressions that contain multiple equality comparisons to the same value.

- **Why it is on:** To check if an object is equal to any one of multiple values, it's more concise to use the `in` operator with a tuple of values. Selected in the ruff config of the Python preset, with the flake8-simplify rules (`compare-with-tuple`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/compare-with-tuple/).
- **Example of the allowed form:**

  ```python
  if foo in (x, y):
      ...
  ```

- **Exception:** If this is intended, add `{"rule":"SIM109","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/compare-with-tuple/)

<a id="ruff-sim110"></a>

### `ruff/SIM110`

Checks for `for` loops that can be replaced with a builtin function, like `any` or `all`.

- **Why it is on:** Using a builtin function is more concise and readable. Selected in the ruff config of the Python preset, with the flake8-simplify rules (`reimplemented-builtin`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/reimplemented-builtin/).
- **Example of the allowed form:**

  ```python
  def foo():
      return any(predicate(item) for item in iterable)
  ```

- **Exception:** If this is intended, add `{"rule":"SIM110","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/reimplemented-builtin/)

<a id="ruff-sim112"></a>

### `ruff/SIM112`

Check for environment variables that are not capitalized.

- **Why it is on:** By convention, environment variables should be capitalized. Furthermore, `os.environ` behaves differently across platforms. On Windows, `os.environ` automatically converts environment variable names to uppercase. This means that if you define a lowercase environment variable (e.g., `foo=1`), iterating over `os.environ` will yield `FOO` on Windows, but `foo` on Linux and macOS. This can lead to subtle bugs in cross-platform code if it assumes environment variables preserve their original case. Selected in the ruff config of the Python preset, with the flake8-simplify rules (`uncapitalized-environment-variables`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/uncapitalized-environment-variables/).
- **Example of the allowed form:**

  ```python
  import os

  os.environ["FOO"]
  ```

- **Exception:** If this is intended, add `{"rule":"SIM112","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/uncapitalized-environment-variables/)

<a id="ruff-sim113"></a>

### `ruff/SIM113`

Checks for `for` loops with explicit loop-index variables that can be replaced with `enumerate()`.

- **Why it is on:** When iterating over a sequence, it's often desirable to keep track of the index of each element alongside the element itself. Prefer the `enumerate` builtin over manually incrementing a counter variable within the loop, as `enumerate` is more concise and idiomatic. Selected in the ruff config of the Python preset, with the flake8-simplify rules (`enumerate-for-loop`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/enumerate-for-loop/).
- **Example of the allowed form:**

  ```python
  fruits = ["apple", "banana", "cherry"]
  for i, fruit in enumerate(fruits):
      print(f"{i + 1}. {fruit}")
  ```

- **Exception:** If this is intended, add `{"rule":"SIM113","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/enumerate-for-loop/)

<a id="ruff-sim114"></a>

### `ruff/SIM114`

Checks for `if` branches with identical arm bodies.

- **Why it is on:** If multiple arms of an `if` statement have the same body, using `or` better signals the intent of the statement. Selected in the ruff config of the Python preset, with the flake8-simplify rules (`if-with-same-arms`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/if-with-same-arms/).
- **Example of the allowed form:**

  ```python
  if x == 1 or x == 2:
      print("Hello")
  ```

- **Exception:** If this is intended, add `{"rule":"SIM114","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/if-with-same-arms/)

<a id="ruff-sim115"></a>

### `ruff/SIM115`

Checks for cases where files are opened (e.g., using the builtin `open()` function) without using a context manager.

- **Why it is on:** If a file is opened without a context manager, it is not guaranteed that the file will be closed (e.g., if an exception is raised), which can cause resource leaks. The rule detects a wide array of IO calls where context managers could be used, such as `open`, `pathlib.Path(...).open()`, `tempfile.TemporaryFile()` or`tarfile.TarFile(...).gzopen()`. Selected in the ruff config of the Python preset, with the flake8-simplify rules (`open-file-with-context-handler`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/open-file-with-context-handler/).
- **Example of the allowed form:**

  ```python
  with open("foo.txt") as file:
      ...
  ```

- **Exception:** If this is intended, add `{"rule":"SIM115","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/open-file-with-context-handler/)

<a id="ruff-sim116"></a>

### `ruff/SIM116`

Checks for three or more consecutive if-statements with direct returns.

- **Why it is on:** These can be simplified by using a dictionary Selected in the ruff config of the Python preset, with the flake8-simplify rules (`if-else-block-instead-of-dict-lookup`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/if-else-block-instead-of-dict-lookup/).
- **Example of the allowed form:**

  ```python
  def find_phrase(x):
      phrases = {1: "Hello", 2: "Goodbye", 3: "Good morning"}
      return phrases.get(x, "Goodnight")
  ```

- **Exception:** If this is intended, add `{"rule":"SIM116","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/if-else-block-instead-of-dict-lookup/)

<a id="ruff-sim117"></a>

### `ruff/SIM117`

Checks for the unnecessary nesting of multiple consecutive context managers.

- **Why it is on:** In Python 3, a single `with` block can include multiple context managers. Combining multiple context managers into a single `with` statement will minimize the indentation depth of the code, making it more readable. Selected in the ruff config of the Python preset, with the flake8-simplify rules (`multiple-with-statements`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/multiple-with-statements/).
- **Example of the allowed form:**

  ```python
  with A() as a, B() as b:
      pass
  ```

- **Exception:** If this is intended, add `{"rule":"SIM117","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/multiple-with-statements/)

<a id="ruff-sim118"></a>

### `ruff/SIM118`

Checks for key-existence checks against `dict.keys()` calls.

- **Why it is on:** When checking for the existence of a key in a given dictionary, using `key in dict` is more readable and efficient than `key in dict.keys()`, while having the same semantics. Selected in the ruff config of the Python preset, with the flake8-simplify rules (`in-dict-keys`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/in-dict-keys/).
- **Example of the allowed form:**

  ```python
  key in foo
  ```

- **Exception:** If this is intended, add `{"rule":"SIM118","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/in-dict-keys/)

<a id="ruff-sim201"></a>

### `ruff/SIM201`

Checks for negated `==` operators.

- **Why it is on:** Negated `==` operators are less readable than `!=` operators. When testing for non-equality, it is more common to use `!=` than `==`. Selected in the ruff config of the Python preset, with the flake8-simplify rules (`negate-equal-op`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/negate-equal-op/).
- **Example of the allowed form:**

  ```python
  a != b
  ```

- **Exception:** If this is intended, add `{"rule":"SIM201","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/negate-equal-op/)

<a id="ruff-sim202"></a>

### `ruff/SIM202`

Checks for negated `!=` operators.

- **Why it is on:** Negated `!=` operators are less readable than `==` operators, as they avoid a double negation. Selected in the ruff config of the Python preset, with the flake8-simplify rules (`negate-not-equal-op`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/negate-not-equal-op/).
- **Example of the allowed form:**

  ```python
  a == b
  ```

- **Exception:** If this is intended, add `{"rule":"SIM202","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/negate-not-equal-op/)

<a id="ruff-sim208"></a>

### `ruff/SIM208`

Checks for double negations (i.e., multiple `not` operators).

- **Why it is on:** A double negation is redundant and less readable than omitting the `not` operators entirely. Selected in the ruff config of the Python preset, with the flake8-simplify rules (`double-negation`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/double-negation/).
- **Example of the allowed form:**

  ```python
  a
  ```

- **Exception:** If this is intended, add `{"rule":"SIM208","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/double-negation/)

<a id="ruff-sim210"></a>

### `ruff/SIM210`

Checks for `if` expressions that can be replaced with `bool()` calls.

- **Why it is on:** `if` expressions that evaluate to `True` for a truthy condition an `False` for a falsey condition can be replaced with `bool()` calls, which are more concise and readable. Selected in the ruff config of the Python preset, with the flake8-simplify rules (`if-expr-with-true-false`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/if-expr-with-true-false/).
- **Example of the allowed form:**

  ```python
  bool(a)
  ```

- **Exception:** If this is intended, add `{"rule":"SIM210","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/if-expr-with-true-false/)

<a id="ruff-sim211"></a>

### `ruff/SIM211`

Checks for `if` expressions that can be replaced by negating a given condition.

- **Why it is on:** `if` expressions that evaluate to `False` for a truthy condition and `True` for a falsey condition can be replaced with `not` operators, which are more concise and readable. Selected in the ruff config of the Python preset, with the flake8-simplify rules (`if-expr-with-false-true`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/if-expr-with-false-true/).
- **Example of the allowed form:**

  ```python
  not a
  ```

- **Exception:** If this is intended, add `{"rule":"SIM211","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/if-expr-with-false-true/)

<a id="ruff-sim212"></a>

### `ruff/SIM212`

Checks for `if` expressions that check against a negated condition.

- **Why it is on:** `if` expressions that check against a negated condition are more difficult to read than `if` expressions that check against the condition directly. Selected in the ruff config of the Python preset, with the flake8-simplify rules (`if-expr-with-twisted-arms`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/if-expr-with-twisted-arms/).
- **Example of the allowed form:**

  ```python
  a if a else b
  ```

- **Exception:** If this is intended, add `{"rule":"SIM212","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/if-expr-with-twisted-arms/)

<a id="ruff-sim220"></a>

### `ruff/SIM220`

Checks for `and` expressions that include both an expression and its negation.

- **Why it is on:** An `and` expression that includes both an expression and its negation will always evaluate to `False`. Selected in the ruff config of the Python preset, with the flake8-simplify rules (`expr-and-not-expr`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/expr-and-not-expr/).
- **Exception:** If this is intended, add `{"rule":"SIM220","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/expr-and-not-expr/)

<a id="ruff-sim221"></a>

### `ruff/SIM221`

Checks for `or` expressions that include both an expression and its negation.

- **Why it is on:** An `or` expression that includes both an expression and its negation will always evaluate to `True`. Selected in the ruff config of the Python preset, with the flake8-simplify rules (`expr-or-not-expr`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/expr-or-not-expr/).
- **Exception:** If this is intended, add `{"rule":"SIM221","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/expr-or-not-expr/)

<a id="ruff-sim222"></a>

### `ruff/SIM222`

Checks for `or` expressions that contain truthy values.

- **Why it is on:** If the expression is used as a condition, it can be replaced in-full with `True`. In other cases, the expression can be short-circuited to the first truthy value. Selected in the ruff config of the Python preset, with the flake8-simplify rules (`expr-or-true`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/expr-or-true/).
- **Example of the allowed form:**

  ```python
  if True:
      pass

  a = x or [1]
  ```

- **Exception:** If this is intended, add `{"rule":"SIM222","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/expr-or-true/)

<a id="ruff-sim223"></a>

### `ruff/SIM223`

Checks for `and` expressions that contain falsey values.

- **Why it is on:** If the expression is used as a condition, it can be replaced in-full with `False`. In other cases, the expression can be short-circuited to the first falsey value. Selected in the ruff config of the Python preset, with the flake8-simplify rules (`expr-and-false`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/expr-and-false/).
- **Example of the allowed form:**

  ```python
  if False:
      pass

  a = x and []
  ```

- **Exception:** If this is intended, add `{"rule":"SIM223","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/expr-and-false/)

<a id="ruff-sim300"></a>

### `ruff/SIM300`

Checks for conditions that position a constant on the left-hand side of the comparison operator, rather than the right-hand side.

- **Why it is on:** These conditions (sometimes referred to as "Yoda conditions") are less readable than conditions that place the variable on the left-hand side of the comparison operator. In some languages, Yoda conditions are used to prevent accidental assignment in conditions (i.e., accidental uses of the `=` operator, instead of the `==` operator). However, Python does not allow assignments in conditions unless using the `:=` operator, so Yoda conditions provide no benefit in this regard. Selected in the ruff config of the Python preset, with the flake8-simplify rules (`yoda-conditions`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/yoda-conditions/).
- **Example of the allowed form:**

  ```python
  if foo == "Foo":
      ...
  ```

- **Exception:** If this is intended, add `{"rule":"SIM300","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/yoda-conditions/)

<a id="ruff-sim401"></a>

### `ruff/SIM401`

Checks for `if` statements that can be replaced with `dict.get` calls.

- **Why it is on:** `dict.get()` calls can be used to replace `if` statements that assign a value to a variable in both branches, falling back to a default value if the key is not found. When possible, using `dict.get` is more concise and more idiomatic. Under [preview mode](https://docs.astral.sh/ruff/preview), this rule will also suggest replacing `if`-`else` expressions with `dict.get` calls. Selected in the ruff config of the Python preset, with the flake8-simplify rules (`if-else-block-instead-of-dict-get`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/if-else-block-instead-of-dict-get/).
- **Example of the allowed form:**

  ```python
  foo = {}
  value = foo.get("bar", 0)
  ```

- **Exception:** If this is intended, add `{"rule":"SIM401","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/if-else-block-instead-of-dict-get/)

<a id="ruff-sim905"></a>

### `ruff/SIM905`

Checks for static `str.split` calls that can be replaced with list literals.

- **Why it is on:** List literals are more readable and do not require the overhead of calling `str.split`. Selected in the ruff config of the Python preset, with the flake8-simplify rules (`split-static-string`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/split-static-string/).
- **Example of the allowed form:**

  ```python
  ["a", "b", "c", "d"]
  ```

- **Exception:** If this is intended, add `{"rule":"SIM905","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/split-static-string/)

<a id="ruff-sim910"></a>

### `ruff/SIM910`

Checks for `dict.get()` calls that pass `None` as the default value.

- **Why it is on:** `None` is the default value for `dict.get()`, so it is redundant to pass it explicitly. Selected in the ruff config of the Python preset, with the flake8-simplify rules (`dict-get-with-none-default`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/dict-get-with-none-default/).
- **Example of the allowed form:**

  ```python
  ages = {"Tom": 23, "Maria": 23, "Dog": 11}
  age = ages.get("Cat")
  ```

- **Exception:** If this is intended, add `{"rule":"SIM910","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/dict-get-with-none-default/)

<a id="ruff-sim911"></a>

### `ruff/SIM911`

Checks for use of `zip()` to iterate over keys and values of a dictionary at once.

- **Why it is on:** The `dict` type provides an `.items()` method which is faster and more readable. Selected in the ruff config of the Python preset, with the flake8-simplify rules (`zip-dict-keys-and-values`).
- **Allowed form:** See the tool's documentation: [Ruff rule documentation](https://docs.astral.sh/ruff/rules/zip-dict-keys-and-values/).
- **Example of the allowed form:**

  ```python
  flag_stars = {"USA": 50, "Slovenia": 3, "Panama": 2, "Australia": 6}

  for country, stars in flag_stars.items():
      print(f"{country}'s flag has {stars} stars.")
  ```

- **Exception:** If this is intended, add `{"rule":"SIM911","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/zip-dict-keys-and-values/)

<a id="ruff-t201"></a>

### `ruff/T201`

Checks for `print` statements.

- **Why it is on:** `print` statements used for debugging should be omitted from production code. They can lead the accidental inclusion of sensitive information in logs, and are not configurable by clients, unlike `logging` statements. `print` statements used to produce output as a part of a command-line interface program are not typically a problem. Selected in the ruff config of the Python preset, with the flake8-print rules (`print`).
- **Allowed form:** Use `logging`: `logger = logging.getLogger(__name__)`, then `logger.info(...)`.
- **Exception:** If this is intended, add `{"rule":"T201","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/print/)

<a id="ruff-t203"></a>

### `ruff/T203`

Checks for `pprint` statements.

- **Why it is on:** Like `print` statements, `pprint` statements used for debugging should be omitted from production code. They can lead the accidental inclusion of sensitive information in logs, and are not configurable by clients, unlike `logging` statements. `pprint` statements used to produce output as a part of a command-line interface program are not typically a problem. Selected in the ruff config of the Python preset, with the flake8-print rules (`p-print`).
- **Allowed form:** Use `logging`: `logger = logging.getLogger(__name__)`, then `logger.info(...)`.
- **Example of the allowed form:**

  ```python
  def merge_dicts(dict_a, dict_b):
      dict_c = {**dict_a, **dict_b}
      return dict_c
  ```

- **Exception:** If this is intended, add `{"rule":"T203","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/p-print/)

<a id="ruff-try002"></a>

### `ruff/TRY002`

Checks for code that raises `Exception` or `BaseException` directly.

- **Why it is on:** Handling such exceptions requires the use of `except Exception` or `except BaseException`. These will capture almost any raised exception, including failed assertions, division by zero, and more. Prefer to raise your own exception, or a more specific built-in exception, so that you can avoid over-capturing exceptions that you don't intend to handle. Selected in the ruff config of the Python preset, with the tryceratops rules (`raise-vanilla-class`).
- **Allowed form:** Raise a specific exception: a built-in such as `ValueError`, or a subclass named for the failure (`class OrderNotFoundError(Exception)`).
- **Example of the allowed form:**

  ```python
  def main_function():
      if not cond:
          raise CustomException()


  def consumer_func():
      try:
          do_step()
          prepare()
          main_function()
      except CustomException:
          logger.error("Main function failed")
      except Exception:
          logger.error("Oops")
  ```

- **Exception:** If this is intended, add `{"rule":"TRY002","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/raise-vanilla-class/)

<a id="ruff-try004"></a>

### `ruff/TRY004`

Checks for type checks that do not raise `TypeError`.

- **Why it is on:** The Python documentation states that `TypeError` should be raised upon encountering an inappropriate type. Selected in the ruff config of the Python preset, with the tryceratops rules (`type-check-without-type-error`).
- **Allowed form:** Raise `TypeError` when the check is about the type of a value.
- **Example of the allowed form:**

  ```python
  def foo(n: int):
      if isinstance(n, int):
          pass
      else:
          raise TypeError("n must be an integer")
  ```

- **Exception:** If this is intended, add `{"rule":"TRY004","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/type-check-without-type-error/)

<a id="ruff-try201"></a>

### `ruff/TRY201`

Checks for needless exception names in `raise` statements.

- **Why it is on:** It's redundant to specify the exception name in a `raise` statement if the exception is being re-raised. Selected in the ruff config of the Python preset, with the tryceratops rules (`verbose-raise`).
- **Allowed form:** Re-raise with a bare `raise`, which keeps the traceback.
- **Example of the allowed form:**

  ```python
  def foo():
      try:
          ...
      except ValueError:
          raise
  ```

- **Exception:** If this is intended, add `{"rule":"TRY201","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/verbose-raise/)

<a id="ruff-try203"></a>

### `ruff/TRY203`

Checks for immediate uses of `raise` within exception handlers.

- **Why it is on:** Capturing an exception, only to immediately reraise it, has no effect. Instead, remove the error-handling code and let the exception propagate upwards without the unnecessary `try`-`except` block. Selected in the ruff config of the Python preset, with the tryceratops rules (`useless-try-except`).
- **Allowed form:** Remove the `try`; a handler that only re-raises changes nothing.
- **Example of the allowed form:**

  ```python
  def foo():
      bar()
  ```

- **Exception:** If this is intended, add `{"rule":"TRY203","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/useless-try-except/)

<a id="ruff-try400"></a>

### `ruff/TRY400`

Checks for uses of `logging.error` instead of `logging.exception` when logging an exception.

- **Why it is on:** `logging.exception` logs the exception and the traceback, while `logging.error` only logs the exception. The former is more appropriate when logging an exception, as the traceback is often useful for debugging. Selected in the ruff config of the Python preset, with the tryceratops rules (`error-instead-of-exception`).
- **Allowed form:** Inside an `except` block call `logger.exception(...)`, which logs the traceback, or `logger.warning(...)` for an error the code expects and handles.
- **Example of the allowed form:**

  ```python
  import logging


  def func():
      try:
          raise NotImplementedError
      except NotImplementedError:
          logging.exception("Exception occurred")
  ```

- **Exception:** If this is intended, add `{"rule":"TRY400","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/error-instead-of-exception/)

<a id="ruff-try401"></a>

### `ruff/TRY401`

Checks for excessive logging of exception objects.

- **Why it is on:** When logging exceptions via `logging.exception`, the exception object is logged automatically. Including the exception object in the log message is redundant and can lead to excessive logging. Selected in the ruff config of the Python preset, with the tryceratops rules (`verbose-log-message`).
- **Allowed form:** Leave the exception out of the message; `logger.exception("Could not load %s", name)` already logs it.
- **Example of the allowed form:**

  ```python
  try:
      ...
  except ValueError:
      logger.exception("Found an error")
  ```

- **Exception:** If this is intended, add `{"rule":"TRY401","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/verbose-log-message/)

<a id="ruff-up031"></a>

### `ruff/UP031`

Checks for `printf`-style string formatting, and offers to replace it with `str.format` calls.

- **Why it is on:** `printf`-style string formatting has a number of quirks, and leads to less readable code than using `str.format` calls or f-strings. In general, prefer the newer `str.format` and f-strings constructs over `printf`-style string formatting. Selected in the ruff config of the Python preset, with the pyupgrade rules (`printf-string-formatting`).
- **Allowed form:** Use an f-string: `f"Hello, {name}"`.
- **Example of the allowed form:**

  ```python
  "{}, {}".format("Hello", "World")  # "Hello, World"
  ```

- **Exception:** If this is intended, add `{"rule":"UP031","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/printf-string-formatting/)

<a id="ruff-up032"></a>

### `ruff/UP032`

Checks for `str.format` calls that can be replaced with f-strings.

- **Why it is on:** f-strings are more readable and generally preferred over `str.format` calls. Selected in the ruff config of the Python preset, with the pyupgrade rules (`f-string`).
- **Allowed form:** Use an f-string: `f"Hello, {name}"`.
- **Example of the allowed form:**

  ```python
  f"{foo}"
  ```

- **Exception:** If this is intended, add `{"rule":"UP032","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Ruff rule documentation](https://docs.astral.sh/ruff/rules/f-string/)
