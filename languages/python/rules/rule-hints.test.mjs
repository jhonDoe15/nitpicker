import { readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { exceptionRoute } from '../../../shared/exceptions/rule-names.mjs';
import { RULE_CASES } from './test-support/python-rule-cases.mjs';
import {
  applyRuleHints,
  describeRuleFinding,
  hintFor,
  RULE_HINTS,
  withHint,
} from './rule-hints.mjs';

const route = (rule) => exceptionRoute({ rule, path: 'src/a.py', key: 'python.exceptions' });

const sample = ({ tool, rule }) => ({
  tool,
  rule,
  path: 'src/a.py',
  identity: 'x',
  message: 'The base message.',
  classification: 'enforceable',
});

describe('every banned form has a banned and an allowed fixture', () => {
  const pythonFiles = (fixture, side) =>
    readdirSync(path.join(import.meta.dirname, 'fixtures', fixture, side), {
      recursive: true,
    }).filter((file) => file.endsWith('.py'));

  it.each(RULE_CASES.map((testCase) => [testCase.name, testCase]))('%s', (_name, testCase) => {
    expect(pythonFiles(testCase.fixture, 'banned').length).toBeGreaterThan(0);
    expect(pythonFiles(testCase.fixture, 'allowed').length).toBeGreaterThan(0);
  });

  it('covers every rule that has a hint', () => {
    const uncovered = RULE_HINTS.filter(
      (hint) => !RULE_CASES.some((testCase) => hintFor(sample(testCase)) === hint),
    );

    expect(uncovered).toEqual([]);
  });
});

describe('every message names the allowed form', () => {
  it.each(RULE_CASES.map((testCase) => [testCase.name, testCase]))('%s', (_name, testCase) => {
    const { message } = withHint(sample(testCase));

    expect(message.toLowerCase()).toContain(testCase.mention.toLowerCase());
  });

  it.each(RULE_CASES.filter((testCase) => hintFor(sample(testCase)).exception !== false))(
    'tells how to add an exception for $tool $rule',
    (testCase) => {
      expect(withHint(sample(testCase)).message.endsWith(route(testCase.rule))).toBe(true);
    },
  );

  it('sends a suppression comment to the exception of no-inline-suppression itself', () => {
    const { message } = withHint(sample({ tool: 'python-rules', rule: 'no-inline-suppression' }));

    expect(message).toBe(
      'The base message. Remove the comment and fix the code. If this is intended, add {"rule":"no-inline-suppression","paths":["src/a.py"],"reason":"..."} to "python.exceptions" in nitpicker.config.json.',
    );
  });

  it.each([
    ['mypy', 'import-not-found'],
    ['mypy', 'import-untyped'],
    ['pyright', 'reportMissingImports'],
    ['pyright', 'reportMissingModuleSource'],
    ['basedpyright', 'reportMissingImports'],
    ['basedpyright', 'reportMissingModuleSource'],
  ])('sends the missing import %s %s to installing the package', (tool, rule) => {
    expect(withHint(sample({ tool, rule })).message).toBe(
      `The base message. Install the package, or its \`types-\` stubs, in the project environment. ${route(rule)}`,
    );
  });

  it('sends an unused ignore comment to deleting it', () => {
    expect(withHint(sample({ tool: 'mypy', rule: 'unused-ignore' })).message).toBe(
      'The base message. Delete the comment.',
    );
  });

  it.each([
    ['ruff', 'E722'],
    ['ruff', 'BLE001'],
  ])('tells a test to use pytest.raises for %s %s', (tool, rule) => {
    expect(withHint(sample({ tool, rule })).message).toBe(
      `The base message. Catch the specific exception and handle it, or re-raise it with its cause (\`raise DomainError(...) from error\`); \`contextlib.suppress(SpecificError)\` ignores one expected error. In a test, use \`pytest.raises(SpecificError)\` (\`self.assertRaises\` in unittest). ${route(rule)}`,
    );
  });

  it('keeps the type error boilerplate short', () => {
    expect(withHint(sample({ tool: 'mypy', rule: 'return-value' })).message).toBe(
      `The base message. Fix the type; inline ignores are banned. ${route('return-value')}`,
    );
  });
});

describe('hints', () => {
  it('end the tool message and add the allowed form and the exception route', () => {
    expect(withHint(sample({ tool: 'ruff', rule: 'T201' }))).toEqual({
      ...sample({ tool: 'ruff', rule: 'T201' }),
      message:
        'The base message. Use `logging`: `logger = logging.getLogger(__name__)`, then `logger.info(...)`. If this is intended, add {"rule":"T201","paths":["src/a.py"],"reason":"..."} to "python.exceptions" in nitpicker.config.json.',
    });
  });

  it('do not double a final period', () => {
    expect(
      withHint({ ...sample({ tool: 'ruff', rule: 'T201' }), message: 'Found' }).message,
    ).toMatch(/^Found\. Use/);
  });

  it('match a rule family by its prefix, and nothing else', () => {
    expect(hintFor(sample({ tool: 'ruff', rule: 'PTH123' }))).toBe(
      hintFor(sample({ tool: 'ruff', rule: 'PTH118' })),
    );
    expect(hintFor(sample({ tool: 'ruff', rule: 'PTH123' }))).toBeDefined();
    expect(hintFor(sample({ tool: 'ruff', rule: 'PT009' }))).toBeUndefined();
    expect(hintFor(sample({ tool: 'ruff', rule: 'F401' }))).toBeUndefined();
  });

  it('match a rule by its whole id', () => {
    expect(hintFor(sample({ tool: 'ruff', rule: 'T2' }))).toBeUndefined();
    expect(hintFor(sample({ tool: 'ruff', rule: 'T203' }))).toBeDefined();
  });

  it('are per tool: a rule id of another tool is not matched', () => {
    expect(hintFor(sample({ tool: 'ruff', rule: 'frozen-dataclass' }))).toBeUndefined();
    expect(hintFor(sample({ tool: 'python-rules', rule: 'T201' }))).toBeUndefined();
  });

  it('cover every rule of the type checkers', () => {
    expect(hintFor(sample({ tool: 'mypy', rule: 'anything' }))).toBeDefined();
    expect(hintFor(sample({ tool: 'pyright', rule: 'reportAnything' }))).toBeDefined();
    expect(hintFor(sample({ tool: 'basedpyright', rule: 'reportAny' }))).toBeDefined();
  });

  it('leave findings of other tools and descriptive findings untouched', () => {
    const coverage = sample({ tool: 'coverage', rule: 'line-coverage' });
    const note = { ...sample({ tool: 'ruff', rule: 'F401' }), classification: 'descriptive' };

    expect(applyRuleHints([coverage, note])).toEqual([coverage, note]);
  });

  it.each([
    ['ruff', 'F401'],
    ['ruff', 'SIM102'],
    ['ruff', 'invalid-syntax'],
  ])('end a %s %s finding without an allowed form with the exception route', (tool, rule) => {
    expect(hintFor(sample({ tool, rule }))).toBeUndefined();
    expect(withHint(sample({ tool, rule })).message).toBe(`The base message. ${route(rule)}`);
  });

  it.each([
    ['coverage-py', 'changed-branch-coverage'],
    ['mutmut', 'mutant-survived'],
  ])('leave a %s %s finding to the shared exception route', (tool, rule) => {
    const finding = sample({ tool, rule });

    expect(withHint(finding)).toEqual(finding);
  });

  it('keep every other field of the finding', () => {
    const finding = sample({ tool: 'mypy', rule: 'return-value' });

    expect(applyRuleHints([finding])).toEqual([{ ...finding, message: expect.any(String) }]);
  });

  it('describe a custom rule finding by its subject', () => {
    expect(describeRuleFinding('frozen-dataclass', 'Order')).toBe('Dataclass Order is not frozen');
  });
});

describe('hints follow the libraries of the project', () => {
  const advice = (rule, libraries, tool = 'ruff', subject) =>
    withHint({ ...sample({ tool, rule }), subject }, libraries).message;
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
    expect(advice('T201', { logging })).toBe(expected('T201', allowed));
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
      'Give the reason: `@unittest.skip("needs the staging database")`, `self.skipTest("...")`; or fix or delete the test.',
    ],
    [
      'return in test_a',
      'Skip visibly: `@pytest.mark.skipif(sys.platform == "win32", reason="posix only")` or `pytest.skip("...")` (`self.skipTest("...")` in unittest).',
    ],
  ])('word a skipped test by the form %s', (subject, allowed) => {
    expect(advice('skipped-test-without-reason', {}, 'python-rules', subject)).toBe(
      expected('skipped-test-without-reason', allowed),
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

  it('describe the rules for caught logs and silent tests by their subject', () => {
    expect(describeRuleFinding('catch-log-without-exception', 'logger.error(...)')).toBe(
      '`logger.error(...)` logs a caught error without its traceback',
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
      'f"${n}" for n in range(1, len(ids) + 1)',
    ],
    ['cur.execute', 'sqlite', 'WHERE id = ?", (user_id,))', '", ".join(["?"] * len(ids))'],
    ['cur.execute', 'format', 'WHERE id = %s", (user_id,))', '", ".join(["%s"] * len(ids))'],
    ['cur.execute', 'named', 'WHERE id = :id", {"id": user_id})', 'f":id_{n}"'],
    ['conn.fetchrow', 'format', 'WHERE id = $1", user_id)', 'f"${n}"'],
    ['db.fetch_all', 'format', 'WHERE id = :id", {"id": user_id})', 'f":id_{n}"'],
  ])('name the placeholders for %s on %s', (subject, database, call, list) => {
    const message = advice('sql-string-formatting', { database }, 'python-rules', subject);

    expect(message).toContain(call);
    expect(message).toContain(list);
  });
});

describe('type laundering messages', () => {
  const cast = (subject, libraries) =>
    withHint(
      { ...sample({ tool: 'python-rules', rule: 'type-cast' }), subject, message: 'x' },
      libraries,
    ).message;

  it('names the parse at the boundary only for a container target', () => {
    expect(cast('cast(str) in convert')).toBe(
      `x. Narrow the value with \`isinstance\` or \`match\`, or give it the correct type at its source. ${route('type-cast')}`,
    );
    expect(cast('cast(dict[str, int])')).toContain(
      'Parse untrusted input once in `adapters/` with',
    );
  });

  it('keeps the allowed form of an explicit Any to one sentence', () => {
    const { message } = withHint({
      ...sample({ tool: 'python-rules', rule: 'explicit-any' }),
      subject: 'f(a)',
    });

    expect(message).toBe(
      `The base message. Write the concrete type, a \`Protocol\`, a \`TypeVar\`, a \`ParamSpec\` or \`object\` (\`dict[str, object]\`, \`Callable[..., object]\`). ${route('explicit-any')}`,
    );
  });
});
