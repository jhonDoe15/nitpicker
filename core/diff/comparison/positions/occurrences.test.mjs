import { describe, expect, it } from 'vitest';
import { isPythonTouchedRule } from '../../../../languages/python/rules/touched-rules.mjs';
import { parseChangedLines } from '../../git/patches/changed-lines.mjs';
import { compareFindings } from '../compare.mjs';
import { EDITED_LINE_SENTENCE } from './touched-lines.mjs';

const ROUTE =
  'If this is intended, add {"rule":"T201"} to "python.exceptions" in nitpicker.config.json.';

function ruff(rule, subject, lines) {
  return lines.map((line, index) => ({
    tool: 'ruff',
    rule,
    path: 'src/mod.py',
    identity: `fp:nitpicker/subject=${subject}${index === 0 ? '' : `#${String(index + 1)}`}`,
    message: `${subject}. ${ROUTE}`,
    classification: 'enforceable',
    location: { line },
  }));
}

function touched(hunks, sources) {
  const diff = ['diff --git a/src/mod.py b/src/mod.py', '--- a/src/mod.py', '+++ b/src/mod.py'];
  return {
    changedLines: parseChangedLines(
      [...diff, ...hunks.flat()].join('\n'),
      '.',
      () => new Map([['src/mod.py', sources]]),
    ),
    isStrictRule: isPythonTouchedRule,
  };
}

const lineOf = (findings) => findings.map(({ location }) => location.line);

describe('findings that share a message in one file', () => {
  it('reports the magic number of an added function, not a legacy one further down', () => {
    const result = compareFindings({
      baseFindings: ruff('PLR2004', 'Magic value 3', [2, 6]),
      headFindings: ruff('PLR2004', 'Magic value 3', [2, 6, 12]),
      touchedCode: touched([
        ['@@ -4,0 +5,6 @@', '+def check(x):', '+    if x == 3:', '+        raise Error("three")'],
        ['+    return x', '+', '+'],
      ]),
    });

    expect(lineOf(result.newFindings)).toEqual([6]);
    expect(lineOf(result.unchangedFindings)).toEqual([2, 12]);
    expect(result.resolvedFindings).toEqual([]);
  });

  it('reports one new print when a second one is added above a legacy print', () => {
    const result = compareFindings({
      baseFindings: ruff('T201', '`print` found', [2, 7]),
      headFindings: ruff('T201', '`print` found', [2, 3, 8]),
      touchedCode: touched([['@@ -1,0 +2 @@', '+    print("new")']]),
    });

    expect(lineOf(result.newFindings)).toEqual([2]);
    expect(result.newFindings[0].message).toBe(`\`print\` found. ${ROUTE}`);
    expect(lineOf(result.unchangedFindings)).toEqual([3, 8]);
  });

  it('pairs the remaining occurrences by nearest line when their lines changed', () => {
    const result = compareFindings({
      baseFindings: ruff('B006', 'Mutable default', [3, 30]),
      headFindings: ruff('B006', 'Mutable default', [3, 20, 31]),
      touchedCode: touched([
        ['@@ -19,0 +20 @@', '+def g(c=[]):'],
        ['@@ -30 +31 @@', '-def f(a=[]):', '+def f(b=[]):'],
      ]),
    });

    expect(lineOf(result.newFindings)).toEqual([20]);
    expect(lineOf(result.unchangedFindings)).toEqual([3, 31]);
  });

  it('pairs findings numbered across functions when a function with the same line goes in between', () => {
    const inFunctions = (lines, symbols) =>
      ruff('BLE001', 'Blind except', lines).map((finding, index) => ({
        ...finding,
        symbol: symbols[index],
      }));
    const result = compareFindings({
      baseFindings: inFunctions([3, 10], ['first', 'second']),
      headFindings: inFunctions([3, 10, 17], ['first', 'middle', 'second']),
      touchedCode: touched([['@@ -7,0 +8,7 @@', '+def middle():', '+    try:']]),
    });

    expect(result.newFindings.map(({ symbol }) => symbol)).toEqual(['middle']);
  });

  it('pairs by position without touched-code information', () => {
    const result = compareFindings({
      baseFindings: ruff('T201', '`print` found', [5, 9]),
      headFindings: ruff('T201', '`print` found', [1, 5, 9]),
    });

    expect(lineOf(result.newFindings)).toEqual([1]);
  });
});

describe('a legacy finding on a line the change edits', () => {
  it('says it is new because the line was edited, before the exception route', () => {
    const result = compareFindings({
      baseFindings: ruff('T201', '`print` found', [2]),
      headFindings: ruff('T201', '`print` found', [2]),
      touchedCode: touched([['@@ -2 +2 @@', '-    print("start")', '+    print("start", items)']]),
    });

    expect(result.newFindings.map(({ message }) => message)).toEqual([
      `\`print\` found. ${EDITED_LINE_SENTENCE} ${ROUTE}`,
    ]);
  });

  it('stays unchanged when the change only reformats the line', () => {
    const result = compareFindings({
      baseFindings: ruff('T201', '`print` found', [2]),
      headFindings: ruff('T201', '`print` found', [2]),
      touchedCode: touched([['@@ -2 +2 @@', "-    print( 'start' )", '+    print("start")']], {
        base: "def run():\n    print( 'start' )\n",
        head: 'def run():\n    print("start")\n',
      }),
    });

    expect(result.newFindings).toEqual([]);
  });
});

describe('findings that share a message on deleted, moved and added lines', () => {
  it('reports a print in new code as new when an identical legacy print was deleted elsewhere', () => {
    const result = compareFindings({
      baseFindings: ruff('T201', '`print` found', [2]),
      headFindings: ruff('T201', '`print` found', [6]),
      touchedCode: touched(
        [
          ['@@ -1,4 +0,0 @@', '-def old(items):', '-    print("debug", items)', '-', '-'],
          ['@@ -6,0 +3,4 @@', '+', '+', '+def brand_new(items):', '+    print("debug", items)'],
        ],
        {
          base: 'def old(items):\n    print("debug", items)\n\n\ndef keep():\n    return 1\n',
          head: 'def keep():\n    return 1\n\n\ndef brand_new(items):\n    print("debug", items)\n',
        },
      ),
    });

    expect(lineOf(result.newFindings)).toEqual([6]);
  });

  it('does not say an added line was edited', () => {
    const result = compareFindings({
      baseFindings: ruff('T201', '`print` found', [2]),
      headFindings: ruff('T201', '`print` found', [2]),
      touchedCode: touched(
        [['@@ -2 +2 @@', '-    print("a", first, second)', '+    print(other)']],
        {
          base: 'def run():\n    print("a", first, second)\n',
          head: 'def run():\n    print(other)\n',
        },
      ),
    });

    expect(result.newFindings.map(({ message }) => message)).toEqual([`\`print\` found. ${ROUTE}`]);
  });

  it('pairs very many findings in line order, whatever order the analyzer listed them in', () => {
    const lines = (count) => Array.from({ length: count }, (_, index) => index + 1);
    const pair = (heads) =>
      compareFindings({
        baseFindings: ruff('T201', '`print` found', lines(500)),
        headFindings: heads,
      });
    const heads = ruff('T201', '`print` found', lines(600));

    expect(lineOf(pair(heads).newFindings)).toEqual(lines(600).slice(500));
    expect(lineOf(pair(heads.toReversed()).newFindings).toSorted((a, b) => a - b)).toEqual(
      lines(600).slice(500),
    );
  });
});
