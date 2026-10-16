import { readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { exceptionEntryText, exceptionSentence } from '../../../shared/exceptions/sentence.mjs';
import { RULE_CASES } from './test-support/python-rule-cases.mjs';
import {
  applyRuleHints,
  describeRuleFinding,
  hintFor,
  RULE_HINTS,
  withHint,
} from './rule-hints.mjs';

const routeFor = (rule) => exceptionSentence(exceptionEntryText({ rule, path: 'src/a.py' }));

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
      expect(withHint(sample(testCase)).message.endsWith(` ${routeFor(testCase.rule)}`)).toBe(true);
    },
  );

  it('sends a suppression comment to the exception of no-inline-suppression itself', () => {
    const { message } = withHint(sample({ tool: 'python-rules', rule: 'no-inline-suppression' }));

    expect(message).toBe(
      'The base message. Remove the comment and fix the code. If a reviewer agrees this is intended, add {"rule":"no-inline-suppression","paths":["src/a.py"],"reason":"<why this is intended>"} to "exceptions" in nitpicker.config.json.',
    );
  });

  it.each([
    ['mypy', 'import-not-found'],
    ['mypy', 'import-untyped'],
    ['pyright', 'reportMissingImports'],
    ['pyright', 'reportMissingModuleSource'],
  ])('sends the missing import %s %s to installing the package', (tool, rule) => {
    expect(withHint(sample({ tool, rule })).message).toBe(
      `The base message. Install the package, or its \`types-\` stubs, in the project environment. ${routeFor(rule)}`,
    );
  });

  it('sends an unused ignore comment to deleting it', () => {
    expect(withHint(sample({ tool: 'mypy', rule: 'unused-ignore' })).message).toBe(
      'The base message. Delete the comment.',
    );
  });

  it('keeps the type error boilerplate short', () => {
    expect(withHint(sample({ tool: 'mypy', rule: 'return-value' })).message).toBe(
      `The base message. Fix the type; inline ignores are banned. ${routeFor('return-value')}`,
    );
  });
});

describe('hints', () => {
  it('end the tool message and add the allowed form and the exception route', () => {
    expect(withHint(sample({ tool: 'ruff', rule: 'T201' }))).toEqual({
      ...sample({ tool: 'ruff', rule: 'T201' }),
      message:
        'The base message. Use `logging`: `logger = logging.getLogger(__name__)`, then `logger.info(...)`. If a reviewer agrees this is intended, add {"rule":"T201","paths":["src/a.py"],"reason":"<why this is intended>"} to "exceptions" in nitpicker.config.json.',
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
    expect(withHint(sample({ tool, rule })).message).toBe(`The base message. ${routeFor(rule)}`);
  });

  it('keep every other field of the finding', () => {
    const finding = sample({ tool: 'mypy', rule: 'return-value' });

    expect(applyRuleHints([finding])).toEqual([{ ...finding, message: expect.any(String) }]);
  });

  it('describe a custom rule finding by its subject', () => {
    expect(describeRuleFinding('frozen-dataclass', 'Order')).toBe('Dataclass Order is not frozen');
  });
});
