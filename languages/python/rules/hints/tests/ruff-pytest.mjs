const PYTEST_WARNING_MATCH =
  'Match the message: `with pytest.warns(UserWarning, match="deprecated"):`, or name a more specific warning class.';

function styleOf(libraries) {
  return libraries?.pytestStyle ?? {};
}

function decoratorParentheses(option) {
  return (_subject, libraries) => {
    const withParentheses = styleOf(libraries)[option] === true;
    return withParentheses
      ? 'Write the decorator with parentheses, as the rest of the project does: `@pytest.fixture()`, `@pytest.mark.slow()`.'
      : 'Write the decorator without parentheses: `@pytest.fixture`, `@pytest.mark.slow`.';
  };
}

const NAMES_FORMS = {
  csv: 'Pass the names as one comma-separated string: `@pytest.mark.parametrize("a,b", [(1, 2)])`.',
  list: 'Pass the names as a list: `@pytest.mark.parametrize(["a", "b"], [(1, 2)])`.',
  tuple: 'Pass the names as a tuple: `@pytest.mark.parametrize(("a", "b"), [(1, 2)])`.',
};

function parametrizeNames(_subject, libraries) {
  return NAMES_FORMS[styleOf(libraries)['parametrize-names-type'] ?? 'tuple'];
}

function parametrizeValues(_subject, libraries) {
  const style = styleOf(libraries);
  const values = style['parametrize-values-type'] ?? 'list';
  const row = style['parametrize-values-row-type'] ?? 'tuple';
  const [open, close] = row === 'tuple' ? ['(', ')'] : ['[', ']'];
  const [outerOpen, outerClose] = values === 'list' ? ['[', ']'] : ['(', ')'];
  const rows = `${outerOpen}${open}1, 2${close}, ${open}3, 4${close}${outerClose}`;
  return `Pass the values as a ${values} of ${row}s: \`${rows}\`, or a ${values} for one name.`;
}

export const PYTEST_HINTS = [
  {
    tool: 'ruff',
    rules: ['PT001'],
    allowed: decoratorParentheses('fixture-parentheses'),
  },
  {
    tool: 'ruff',
    rules: ['PT023'],
    allowed: decoratorParentheses('mark-parentheses'),
  },
  {
    tool: 'ruff',
    rules: ['PT002'],
    allowed: 'Pass the fixture options by keyword: `@pytest.fixture(scope="session")`.',
  },
  {
    tool: 'ruff',
    rules: ['PT003'],
    allowed: 'Drop `scope="function"`; it is the default scope of a fixture.',
  },
  {
    tool: 'ruff',
    rules: ['PT006'],
    allowed: parametrizeNames,
  },
  {
    tool: 'ruff',
    rules: ['PT007'],
    allowed: parametrizeValues,
  },
  {
    tool: 'ruff',
    rules: ['PT008'],
    allowed: 'Patch with `return_value=...`, or `mocker.patch(target, new=...)`, not a lambda.',
  },
  {
    tool: 'ruff',
    rules: ['PT010'],
    allowed: 'Name the expected exception: `with pytest.raises(ValueError, match="invalid"):`.',
  },
  {
    tool: 'ruff',
    rules: ['PT011'],
    allowed:
      'Match the message: `with pytest.raises(ValueError, match="invalid"):`, or raise a more specific exception.',
  },
  {
    tool: 'ruff',
    rules: ['PT012'],
    allowed:
      'Keep one statement in the `pytest.raises` block, the call that raises; build the arguments before it.',
  },
  {
    tool: 'ruff',
    rules: ['PT013'],
    allowed: 'Import pytest as a module: `import pytest`, then `pytest.raises(...)`.',
  },
  {
    tool: 'ruff',
    rules: ['PT014'],
    allowed: 'List each parametrize case once.',
  },
  {
    tool: 'ruff',
    rules: ['PT015', 'PT016'],
    allowed: 'Fail with a message: `pytest.fail("the reason")`.',
  },
  {
    tool: 'ruff',
    rules: ['PT017'],
    allowed:
      'Assert on the exception with `with pytest.raises(ValueError) as caught:`, then `assert "x" in str(caught.value)`.',
  },
  {
    tool: 'ruff',
    rules: ['PT018'],
    allowed: 'Split the assertion in two: `assert a` and `assert b`, one condition each.',
  },
  {
    tool: 'ruff',
    rules: ['PT019'],
    allowed:
      'Use `@pytest.mark.usefixtures("name")` for a fixture whose value the test does not use.',
  },
  {
    tool: 'ruff',
    rules: ['PT020'],
    allowed: 'Declare the fixture with `@pytest.fixture`; `yield_fixture` is deprecated.',
  },
  {
    tool: 'ruff',
    rules: ['PT021'],
    allowed: 'Clean up after a `yield` in the fixture instead of `request.addfinalizer`.',
  },
  {
    tool: 'ruff',
    rules: ['PT022'],
    allowed: 'Use `return` in a fixture that has no teardown.',
  },
  {
    tool: 'ruff',
    rules: ['PT024'],
    allowed: 'Remove `@pytest.mark.asyncio` from the fixture; the fixture decorator is enough.',
  },
  {
    tool: 'ruff',
    rules: ['PT025'],
    allowed:
      'Request the fixtures as parameters of the fixture; `usefixtures` has no effect on a fixture.',
  },
  {
    tool: 'ruff',
    rules: ['PT026'],
    allowed: 'Name the fixtures: `@pytest.mark.usefixtures("database")`, or remove the mark.',
  },
  {
    tool: 'ruff',
    rules: ['PT028'],
    allowed:
      'Remove the default value from the test parameter; parametrize or a fixture supplies it.',
  },
  { tool: 'ruff', rules: ['PT030'], allowed: PYTEST_WARNING_MATCH },
  {
    tool: 'ruff',
    rules: ['PT031'],
    allowed:
      'Keep one statement in the `pytest.warns` block, the call that warns; build the arguments before it.',
  },
];
