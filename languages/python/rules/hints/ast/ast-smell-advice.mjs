const UNCOLLECTED_ADVICE = [
  [
    '(norecursedirs)',
    'Move the tests out of the directory `norecursedirs` skips, or remove that directory from `norecursedirs`.',
  ],
  [
    '(testpaths)',
    'Add its folder to `testpaths` in the pytest configuration, or move the tests into a folder listed there.',
  ],
  [
    '(--ignore)',
    'Remove the `--ignore` or `--ignore-glob` option that hides the file, or delete the tests.',
  ],
  [
    '(collect_ignore)',
    'Remove the `collect_ignore` entry in `conftest.py` that hides the file, or delete the tests.',
  ],
  [
    '(--deselect)',
    'Remove the `--deselect` option so the test runs, or skip it on a real condition with `@pytest.mark.skipif(sys.platform == "win32", reason="...")`; delete a test you no longer want.',
  ],
  [
    '(-k)',
    'Remove the `-k` expression in `addopts` that hides the test, or skip it on a real condition with `@pytest.mark.skipif(sys.platform == "win32", reason="...")`.',
  ],
  [
    '(-m)',
    'Remove the `-m` marker expression in `addopts` that hides the test, or skip it on a real condition with `@pytest.mark.skipif(sys.platform == "win32", reason="...")`.',
  ],
  [
    '(python_classes)',
    'Name the class the way `python_classes` collects it (`Test*` by default), or derive it from `unittest.TestCase`.',
  ],
  [
    '(__init__)',
    'Remove the `__init__`: pytest does not collect a test class that has one. Build the state in a fixture.',
  ],
  ['(unittest)', 'Name the file `test*.py` so `python -m unittest discover` finds it.'],
];

export function uncollectedAllowed(subject = '') {
  const advice = UNCOLLECTED_ADVICE.find(([marker]) => subject.endsWith(marker));
  return (
    advice?.[1] ??
    'Name the file so pytest collects it (`test_*.py` or `*_test.py`), or add its pattern to `python_files` in the pytest configuration.'
  );
}

export const FAN_OUT_SEPARATOR = '\u001f';

function fanOutParts(subject = '') {
  const [combinator = '', collection = '<collection>', operation = '<call>', via = '', kind = ''] =
    subject.split(FAN_OUT_SEPARATOR);
  return { combinator, collection, operation, via, kind };
}

export function fanOutDescription(subject) {
  const { combinator, collection, operation, via, kind } = fanOutParts(subject);
  const verb = kind === 'message' ? 'publishes through' : 'calls';
  const through = via === '' ? '' : ` (which ${verb} \`${via}\`)`;
  return `\`${combinator}\` starts \`${operation}\`${through} for every element of \`${collection}\` at once`;
}

export function fanOutAllowed(subject) {
  const { kind } = fanOutParts(subject);
  const target = kind === 'message' ? "the broker's" : "the remote service's";
  return `A large collection exhausts ${target} connections or rate limit. Hold one \`asyncio.Semaphore(8)\` created outside the tasks with \`async with limit:\` around each call, gather fixed-size slices (\`items[i : i + 20]\`), or make one batch call when the API has one.`;
}
