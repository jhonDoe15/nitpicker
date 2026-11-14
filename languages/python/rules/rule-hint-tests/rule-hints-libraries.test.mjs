import { describe, expect, it } from 'vitest';
import { exceptionRoute } from '../../../../shared/exceptions/rule-names.mjs';
import { describeRuleFinding, withHint } from '../rule-hints.mjs';
import { route, sample } from '../test-support/hint-samples.mjs';

describe('hints follow the libraries of the project', () => {
  const advice = (rule, libraries, tool = 'ruff', subject) =>
    withHint({ ...sample({ tool, rule }), subject }, libraries).message;
  const PROGRAM_OUTPUT =
    'For program output, take a `TextIO` parameter and write with `out.write(...)` or `print(..., file=out)`; the entry point passes `sys.stdout`.';
  const expected = (rule, allowed) => `The base message. ${allowed} ${route(rule)}`;

  it.each([
    [
      'structlog',
      'Keep the message constant and pass the data as key-value pairs: `log.info("items_loaded", count=count)`.',
    ],
    [
      'loguru',
      'Pass the values as arguments, not a formatted string: `logger.info("Loaded {} items", count)`.',
    ],
    [
      'logging',
      'Pass the values as arguments, not a formatted string: `logger.info("Loaded %s items", count)`.',
    ],
  ])('name the %s form for a formatted log message', (logging, allowed) => {
    expect(advice('G004', { logging })).toBe(expected('G004', allowed));
  });

  it.each([
    [
      'structlog',
      'Use structlog: `log = structlog.get_logger()`, then `log.info("event_name", key=value)`.',
    ],
    ['loguru', 'Use loguru: `from loguru import logger`, then `logger.info(...)`.'],
  ])('send a print to %s', (logging, allowed) => {
    expect(advice('T201', { logging })).toBe(expected('T201', `${allowed} ${PROGRAM_OUTPUT}`));
  });

  it.each([
    ['msgspec', 'msgspec (`msgspec.json.decode(raw, type=Model)`)'],
    ['cattrs', 'cattrs (`cattrs.structure(data, Model)`)'],
    ['marshmallow', 'marshmallow (`Schema().load(data)`)'],
    ['pydantic', 'pydantic (`Model.model_validate(data)`)'],
  ])('send a hand-written guard to %s', (validator, form) => {
    const allowed = `Parse untrusted input once at the boundary with ${form} in an \`adapters/\` package, not with \`isinstance\` checks or a \`TypeGuard\`.`;

    expect(advice('handwritten-boundary-guard', { validator }, 'python-rules')).toBe(
      expected('handwritten-boundary-guard', allowed),
    );
  });

  it('write the pytest decorators and parametrize calls the way the project does', () => {
    const pytestStyle = {
      'fixture-parentheses': true,
      'parametrize-names-type': 'csv',
      'parametrize-values-type': 'tuple',
      'parametrize-values-row-type': 'list',
    };

    expect(advice('PT001', { pytestStyle })).toBe(
      expected(
        'PT001',
        'Write the decorator with parentheses, as the rest of the project does: `@pytest.fixture()`, `@pytest.mark.slow()`.',
      ),
    );
    expect(advice('PT006', { pytestStyle })).toBe(
      expected(
        'PT006',
        'Pass the names as one comma-separated string: `@pytest.mark.parametrize("a,b", [(1, 2)])`.',
      ),
    );
    expect(advice('PT007', { pytestStyle })).toBe(
      expected(
        'PT007',
        'Pass the values as a tuple of lists: `([1, 2], [3, 4])`, or a tuple for one name.',
      ),
    );
    expect(advice('PT007', {})).toBe(
      expected(
        'PT007',
        'Pass the values as a list of tuples: `[(1, 2), (3, 4)]`, or a list for one name.',
      ),
    );
  });

  it.each([
    [
      'pytest.mark.xfail',
      'Give the reason and the expected error: `@pytest.mark.xfail(reason="bug 123", raises=ZeroDivisionError, strict=True)`; or fix or delete the test.',
    ],
    [
      'unittest.skip',
      'Skip on a real condition and give the reason: `@unittest.skipUnless(HAS_DATABASE, "needs the staging database")`, or `self.skipTest("...")` inside the condition; or fix or delete the test.',
    ],
    [
      'return in test_a',
      'Skip on a real condition: `@pytest.mark.skipif(sys.platform == "win32", reason="posix only")`, or `if not has_gpu(): pytest.skip("needs a GPU")` (`self.skipTest("...")` in unittest); or fix or delete the test.',
    ],
  ])('word a skipped test by the form %s', (subject, allowed) => {
    expect(advice('skipped-test-without-reason', {}, 'python-rules', subject)).toBe(
      expected('skipped-test-without-reason', allowed),
    );
  });

  it.each([
    [
      'pytest.mark.skip',
      '`pytest.mark.skip` switches a test off for good',
      'Delete the test or make it run. ',
    ],
    [
      'pytest.skip()',
      '`pytest.skip()` switches a test off for good',
      'Delete the test or make it run. ',
    ],
    [
      'pytest.mark.skipif(literal)',
      '`pytest.mark.skipif(...)` has a literal condition',
      'A literal condition switches the test off for good or never applies. Delete the test or make it run; a real condition such as `sys.platform == "win32"` is allowed.',
    ],
    [
      'pytest.mark.xfail',
      '`pytest.mark.xfail` lets a test fail without failing the build',
      'Add `strict=True` so a pass fails the build (or set `xfail_strict = true` in the pytest configuration), or fix or delete the test.',
    ],
    [
      'pytest.mark.xfail(run=False)',
      '`pytest.mark.xfail(run=False)` never runs the test',
      'Delete the test or make it run. ',
    ],
  ])('word a switched-off test by the form %s', (subject, description, allowed) => {
    expect(describeRuleFinding('switched-off-test', subject)).toBe(description);
    expect(advice('switched-off-test', {}, 'python-rules', subject)).toContain(allowed);
  });

  it.each([
    [
      'TestOrders.test_total: for',
      'a `for` loop',
      'Give each case its own test with `@pytest.mark.parametrize`',
    ],
    [
      'test_total: while',
      'a `while` loop',
      'Give each case its own test with `@pytest.mark.parametrize`',
    ],
    [
      'test_total: if',
      'an `if` branch or conditional expression',
      'Give each outcome its own test',
    ],
    ['test_total: match', 'a `match` statement', 'Give each outcome its own test'],
    ['test_total: comprehension', 'a comprehension', 'Give each case its own test'],
    ['test_total: subTest', 'a `subTest` loop', 'Give each case its own test'],
    ['test_total: except', 'an `except` handler', 'with pytest.raises(SpecificError) as info:'],
    [
      'test_total: suppress',
      'a block that swallows assertion errors',
      'suppress only the error you expect',
    ],
    ['test_total: boolean', 'an `and` or `or` expression', 'not `assert not g() or f()`'],
    [
      'TestA.test_a: for (unittest)',
      'a `for` loop',
      'Write each case as a separate test method and assert unconditionally',
    ],
    [
      'TestA.test_a: subTest (unittest)',
      'a `subTest` loop',
      'a suite that keeps `subTest` over other collections takes the exception.',
    ],
    [
      'TestA.test_a: if (unittest)',
      'an `if` branch or conditional expression',
      'Write each outcome as a separate test method',
    ],
  ])('word a conditional assertion by the form %s', (subject, construct, allowed) => {
    const name = subject.split(': ')[0];

    expect(describeRuleFinding('conditional-assertion-in-test', subject)).toBe(
      `Test \`${name}\` asserts inside ${construct}`,
    );
    expect(advice('conditional-assertion-in-test', {}, 'python-rules', subject)).toContain(allowed);
  });

  it.each([
    'TestA.test_a: for (unittest)',
    'TestA.test_a: if (unittest)',
    'TestA.test_a: subTest (unittest)',
  ])('never suggest parametrize to a unittest case: %s', (subject) => {
    expect(advice('conditional-assertion-in-test', {}, 'python-rules', subject)).not.toContain(
      'parametrize',
    );
  });

  it('name the default validation library when none is declared', () => {
    expect(advice('pydantic-boundary', undefined, 'python-rules')).toBe(
      expected(
        'pydantic-boundary',
        'Use pydantic only in an `adapters/` package to parse untrusted input (`Model.model_validate(data)`), and pass frozen dataclasses on from there.',
      ),
    );
  });

  it('name every declared validation library and the call of the first', () => {
    expect(
      advice('pydantic-boundary', { validators: ['marshmallow', 'msgspec'] }, 'python-rules'),
    ).toBe(
      expected(
        'pydantic-boundary',
        'Use marshmallow or msgspec only in an `adapters/` package to parse untrusted input (`Schema().load(data)`), and pass frozen dataclasses on from there.',
      ),
    );
  });

  it.each([
    ['torch.load', 'torch.load(path, weights_only=True)'],
    ['numpy.load', 'allow_pickle=False'],
    ['ruamel.yaml.YAML', 'YAML(typ="safe")'],
    ['yaml.full_load', 'yaml.safe_load(text)'],
    ['joblib.load', 'skops.io.load'],
    ['cloudpickle.loads', 'json.loads(text)'],
    ['keras.models.load_model', '`safe_mode=True`'],
    ['lxml.etree.XMLParser', 'defusedxml.lxml'],
  ])('name the safe loader for %s', (subject, form) => {
    expect(advice('unsafe-deserialization', {}, 'python-rules', subject)).toContain(form);
  });

  it.each([
    [
      undefined,
      'Keep the traceback: `logger.exception("message")` or `logger.error("message", exc_info=True)`; the exception as an argument drops it. Re-raising after the log also passes.',
    ],
    [
      'structlog',
      'Keep the traceback: `logger.exception("event")` or `logger.error("event", exc_info=True)`; the exception as a field drops it. Re-raising after the log also passes.',
    ],
    [
      'loguru',
      'Keep the traceback: `logger.exception("message")` or `logger.opt(exception=True).error("message")`; the exception as an argument drops it. Re-raising after the log also passes.',
    ],
  ])(
    'tell a caught error log to keep the traceback the way the %s logger does',
    (logging, allowed) => {
      expect(advice('catch-log-without-exception', { logging }, 'python-rules')).toBe(
        expected('catch-log-without-exception', allowed),
      );
    },
  );

  it('tell domain code to raise instead of logging a caught error', () => {
    const rule = 'catch-log-without-exception';
    const finding = { ...sample({ tool: 'python-rules', rule }), path: 'shop/domain/orders.py' };

    expect(withHint({ ...finding, subject: 'logger.error(...)' }).message).toBe(
      `The base message. Domain code does not log: re-raise the error with its cause (\`raise DomainError(...) from error\`) or return a failure, and let the caller in \`adapters/\` or the composition root log it with its traceback. ${exceptionRoute({ rule, path: 'shop/domain/orders.py', key: 'python.exceptions' })}`,
    );
  });

  it('describe the rules for caught logs and silent tests by their subject', () => {
    expect(describeRuleFinding('catch-log-without-exception', 'logger.error(...)')).toBe(
      '`logger.error(...)` logs a caught error without its traceback',
    );
    expect(describeRuleFinding('copied-constant-in-test', 'MAX_ITEMS from shop.limits')).toBe(
      'This literal copies MAX_ITEMS from shop.limits: when the constant changes, the test keeps checking the old value or stops testing the case it was written for',
    );
    expect(
      advice('copied-constant-in-test', undefined, 'python-rules', 'MAX_ITEMS from shop.limits'),
    ).toBe(
      expected(
        'copied-constant-in-test',
        'Use `MAX_ITEMS` (or an expression on it, such as `MAX_ITEMS + 1`). If the value is a contract the test pins on purpose, assert it next to the constant (`assert MAX_ITEMS == <value>`).',
      ),
    );
    expect(describeRuleFinding('test-without-assertion', 'TestOrders.test_total')).toBe(
      'Test `TestOrders.test_total` has no assertion',
    );
    expect(advice('test-without-assertion', undefined, 'python-rules')).toBe(
      expected(
        'test-without-assertion',
        'Assert the outcome: `assert result == expected`, `with pytest.raises(SomeError):`, or call one of the assertion helpers the project tests use.',
      ),
    );
  });

  it.each([
    [
      'cur.execute',
      'asyncpg',
      'WHERE id = $1", user_id)',
      `f"\${n}" for n in range(1, len(ids) + 1)`,
    ],
    ['cur.execute', 'sqlite', 'WHERE id = ?", (user_id,))', '", ".join(["?"] * len(ids))'],
    ['cur.execute', 'format', 'WHERE id = %s", (user_id,))', '", ".join(["%s"] * len(ids))'],
    ['cur.execute', 'named', 'WHERE id = :id", {"id": user_id})', 'f":id_{n}"'],
    ['conn.fetchrow', 'format', 'WHERE id = $1", user_id)', `f"\${n}"`],
    ['db.fetch_all', 'format', 'WHERE id = :id", {"id": user_id})', 'f":id_{n}"'],
  ])('name the placeholders for %s on %s', (subject, database, call, list) => {
    const message = advice('sql-string-formatting', { database }, 'python-rules', subject);

    expect(message).toContain(call);
    expect(message).toContain(list);
  });
});
