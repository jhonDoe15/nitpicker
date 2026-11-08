export const PYLINT_WARNING_HINTS = [
  {
    tool: 'ruff',
    rules: ['PLW0108'],
    allowed:
      'Pass the function itself: `key=str` in place of `key=lambda x: str(x)`. A lambda that must look a name up at call time takes an exception.',
  },
  {
    tool: 'ruff',
    rules: ['PLW0120'],
    allowed: 'Remove the `else` and dedent its body; a loop `else` only matters with a `break`.',
  },
  {
    tool: 'ruff',
    rules: ['PLW0127', 'PLW0128'],
    allowed:
      'Assign each name once per statement, to the value you meant, and use `_` for a discarded value.',
  },
  {
    tool: 'ruff',
    rules: ['PLW0129'],
    allowed: 'Assert a condition and put the message after the comma: `assert ready, "not ready"`.',
  },
  {
    tool: 'ruff',
    rules: ['PLW0131'],
    allowed:
      'Use a plain assignment (`total = compute()`); keep `:=` inside a condition or comprehension.',
  },
  {
    tool: 'ruff',
    rules: ['PLW0133'],
    allowed: 'Raise the exception: `raise ValueError(...)`.',
  },
  {
    tool: 'ruff',
    rules: ['PLW0177'],
    allowed: 'Test with `math.isnan(value)` (`numpy.isnan` for arrays).',
  },
  {
    tool: 'ruff',
    rules: ['PLW0211'],
    allowed:
      'Drop `self` or `cls` from the static method, or make it an instance method or a `@classmethod`.',
  },
  {
    tool: 'ruff',
    rules: ['PLW0245'],
    allowed: 'Call `super()` with parentheses: `super().__init__()`.',
  },
  {
    tool: 'ruff',
    rules: ['PLW0406'],
    allowed: "Remove the self-import and use the module's names directly.",
  },
  {
    tool: 'ruff',
    rules: ['PLW0604'],
    allowed: 'Remove the module-level `global`; module names are already global.',
  },
  {
    tool: 'ruff',
    rules: ['PLW0642'],
    allowed: 'Bind a new name instead of reassigning `self` or `cls`.',
  },
  {
    tool: 'ruff',
    rules: ['PLW1501'],
    allowed: 'Pass a valid mode: `path.open("r")`, `"w"`, `"a"` or `"rb"`.',
  },
  {
    tool: 'ruff',
    rules: ['PLW1507'],
    allowed:
      'Copy the environment with `os.environ.copy()`, in the composition root (`settings.py`).',
  },
  {
    tool: 'ruff',
    rules: ['PLW1508'],
    allowed:
      'Pass a `str` default and convert after, in the composition root (`settings.py`): `int(os.getenv("PORT", "8080"))`.',
  },
  {
    tool: 'ruff',
    rules: ['PLW1509'],
    allowed: 'Pass `start_new_session=True` (or `process_group=0`) in place of `preexec_fn`.',
  },
  {
    tool: 'ruff',
    rules: ['PLW1510'],
    allowed:
      'Pass `check=True` to raise on process failure, or pass `check=False` and handle `returncode`.',
  },
  {
    tool: 'ruff',
    rules: ['PLW2101'],
    allowed:
      'Create the lock once and share it: `self._lock = threading.Lock()`, then `with self._lock:`.',
  },
  {
    tool: 'ruff',
    rules: ['PLW2901'],
    allowed: 'Bind the changed value to a new name: `for line in lines: stripped = line.strip()`.',
  },
  {
    tool: 'ruff',
    rules: ['PLW3301'],
    allowed: 'Call one `max` or `min` with all the arguments: `max(a, b, c)`.',
  },
];
