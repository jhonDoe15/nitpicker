import { RULES_TOOL } from './tool.mjs';

const CONSTRUCTS = {
  if: ['an `if` branch or conditional expression', 'Give each outcome its own test'],
  for: ['a `for` loop', 'Give each case its own test'],
  subTest: ['a `subTest` loop', 'Give each case its own test'],
  while: ['a `while` loop', 'Give each case its own test'],
  match: ['a `match` statement', 'Give each outcome its own test'],
  comprehension: ['a comprehension', 'Give each case its own test'],
  boolean: ['an `and` or `or` expression', 'Give each outcome its own test'],
  except: ['an `except` handler', undefined],
};
const ONE_CASE_PER_TEST =
  'with `@pytest.mark.parametrize` and assert unconditionally; a loop may build the data, then one `assert` checks it.';
const EXCEPT_ALLOWED =
  'Let an unexpected error fail the test, or assert the failure with `with pytest.raises(SpecificError) as info:` and check `info.value` after the block.';
const SUBTEST_ALLOWED =
  ' A `unittest` suite without `pytest` accepts `subTest` through the exception.';
const SUBJECT = /^(.*): (\w+)$/u;

function parts(subject = '') {
  const match = SUBJECT.exec(subject);
  return match === null ? [subject, 'if'] : [match[1], match[2]];
}

function conditionalDescription(subject) {
  const [name, kind] = parts(subject);
  return `Test \`${name}\` asserts inside ${CONSTRUCTS[kind]?.[0] ?? 'a branch'}`;
}

function conditionalAllowed(subject) {
  const [, kind] = parts(subject);
  const [, lead] = CONSTRUCTS[kind] ?? CONSTRUCTS.if;
  if (lead === undefined) {
    return EXCEPT_ALLOWED;
  }
  return `${lead} ${ONE_CASE_PER_TEST}${kind === 'subTest' ? SUBTEST_ALLOWED : ''}`;
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
