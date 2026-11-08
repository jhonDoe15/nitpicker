import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { RUFF_CONFIG } from '../adapters/configuration/python-ruff-config.mjs';
import { route, sample } from './test-support/hint-samples.mjs';
import { ruleCases } from './test-support/python-rule-cases.mjs';
import {
  applyRuleHints,
  describeRuleFinding,
  hintFor,
  RULE_HINTS,
  withHint,
} from './rule-hints.mjs';

const RULE_CASES = ruleCases();

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

describe('every selected pitfall rule', () => {
  const PITFALL = /^(?:ASYNC|DTZ|LOG|PLE|PLW|T10)\d+$/u;
  const { lint } = createRequire(import.meta.url)('smol-toml').parse(
    readFileSync(RUFF_CONFIG, 'utf8'),
  );

  it.each(lint.select.filter((code) => PITFALL.test(code)))(
    '%s has its own allowed form',
    (rule) => {
      expect(hintFor(sample({ tool: 'ruff', rule }))?.rules).toContain(rule);
    },
  );
});

describe('every message names the allowed form', () => {
  it.each(RULE_CASES.map((testCase) => [testCase.name, testCase]))('%s', (_name, testCase) => {
    const { message } = withHint(sample(testCase));

    expect(message.toLowerCase()).toContain(testCase.mention.toLowerCase());
  });

  it.each(RULE_CASES.filter((testCase) => hintFor(sample(testCase)).exception === undefined))(
    'tells how to add an exception for $tool $rule',
    (testCase) => {
      expect(withHint(sample(testCase)).message.endsWith(route(testCase.rule))).toBe(true);
    },
  );

  it('sends unused-option to the top-level exceptions, in the wording every preset shares', () => {
    const { message } = withHint(
      sample({ tool: 'python-rules', rule: 'unused-option', data: { scope: 'private' } }),
    );

    expect(message).toBe(
      'Option total.rate is never set. Remove it, or set it from a real call (tests do not count). If this is intended, add {"rule":"unused-option","paths":["src/a.py"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
    );
  });

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
      allowedForm:
        'Use `logging`: `logger = logging.getLogger(__name__)`, then `logger.info(...)`.',
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

    expect(applyRuleHints([finding])).toEqual([
      {
        ...finding,
        message: expect.any(String),
        allowedForm: 'Fix the type; inline ignores are banned.',
      },
    ]);
  });

  it('describe a custom rule finding by its subject', () => {
    expect(describeRuleFinding('frozen-dataclass', 'Order')).toBe('Dataclass Order is not frozen');
  });
});
