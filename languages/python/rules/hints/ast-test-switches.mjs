import { RULES_TOOL } from './tool.mjs';

const CONSTRUCTS = {
  if: 'an `if` branch or conditional expression',
  for: 'a `for` loop',
  subTest: 'a `subTest` loop',
  while: 'a `while` loop',
  match: 'a `match` statement',
  comprehension: 'a comprehension',
  boolean: 'an `and` or `or` expression',
  except: 'an `except` handler',
  suppress: 'a block that swallows assertion errors',
};
const OUTCOMES = new Set(['if', 'match']);
const PYTEST_CASES =
  'with `@pytest.mark.parametrize` and assert unconditionally; a loop may build the data, then one `assert` checks it.';
const UNITTEST_CASES =
  'as a separate test method and assert unconditionally; a loop may build the data, then one `assert` checks it.';
const EXCEPT_ALLOWED =
  'Let an unexpected error fail the test, or assert the failure with `with pytest.raises(SpecificError) as info:` and check `info.value` after the block.';
const SUPPRESS_ALLOWED =
  'Keep the assertion outside the block so a failed assertion fails the test: suppress only the error you expect (`contextlib.suppress(KeyError)`) and assert after the block.';
const BOOLEAN_ALLOWED =
  'Give each outcome its own test and assert unconditionally: write `assert f()` in the test where `g()` holds, not `assert not g() or f()` or `g() and self.assertTrue(f())`.';
const SUBTEST_ALLOWED = ' A suite that keeps `subTest` takes the exception.';
const SUBJECT = /^(.*): (\w+)( \(unittest\))?$/u;

function parts(subject = '') {
  const match = SUBJECT.exec(subject);
  return match === null ? [subject, 'if', false] : [match[1], match[2], match[3] !== undefined];
}

function conditionalDescription(subject) {
  const [name, kind] = parts(subject);
  return `Test \`${name}\` asserts inside ${CONSTRUCTS[kind] ?? 'a branch'}`;
}

function conditionalAllowed(subject) {
  const [, kind, unittest] = parts(subject);
  if (kind === 'except') {
    return EXCEPT_ALLOWED;
  }
  if (kind === 'suppress') {
    return SUPPRESS_ALLOWED;
  }
  if (kind === 'boolean') {
    return BOOLEAN_ALLOWED;
  }
  const unit = OUTCOMES.has(kind) ? 'outcome' : 'case';
  const form = unittest ? UNITTEST_CASES : PYTEST_CASES;
  const lead = unittest ? `Write each ${unit}` : `Give each ${unit} its own test`;
  return `${lead} ${form}${kind === 'subTest' ? SUBTEST_ALLOWED : ''}`;
}

const REAL_CONDITION =
  'A skip on a real condition is allowed: `@pytest.mark.skipif(sys.platform == "win32", reason="posix only")`, `pytest.importorskip("numpy")` or `@unittest.skipUnless(HAS_DATABASE, "needs the database")`.';

function switchedOffDescription(subject = '') {
  if (subject.endsWith('(literal)')) {
    return `\`${subject.replace('(literal)', '(...)')}\` has a literal condition`;
  }
  if (subject === 'pytest.mark.xfail') {
    return `\`${subject}\` lets a test fail without failing the build`;
  }
  if (subject === 'pytest.mark.xfail(run=False)') {
    return `\`${subject}\` never runs the test`;
  }
  return `\`${subject}\` switches a test off for good`;
}

function switchedOffAllowed(subject = '') {
  if (subject.endsWith('(literal)')) {
    return 'A literal condition switches the test off for good or never applies. Delete the test or make it run; a real condition such as `sys.platform == "win32"` is allowed.';
  }
  if (subject === 'pytest.mark.xfail') {
    return 'Add `strict=True` so a pass fails the build (or set `xfail_strict = true` in the pytest configuration), or fix or delete the test.';
  }
  return `Delete the test or make it run. ${REAL_CONDITION}`;
}

export const TEST_SWITCH_HINTS = [
  {
    tool: RULES_TOOL,
    rules: ['conditional-assertion-in-test'],
    describe: conditionalDescription,
    allowed: conditionalAllowed,
  },
  {
    tool: RULES_TOOL,
    rules: ['switched-off-test'],
    describe: switchedOffDescription,
    allowed: switchedOffAllowed,
  },
];
