import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { functionBlocks, ingestMutmut, statusOfExitCode } from './mutmut.mjs';

const recorded = JSON.parse(
  readFileSync(path.join(import.meta.dirname, 'fixtures/mutmut-run.json'), 'utf8'),
);

function variants(name, original, mutated) {
  const body = (suffix, text) => text.replace('def f', `def ${name}__mutmut_${suffix}`);
  return [
    body('orig', original),
    ...mutated.map((text, index) => body(String(index + 1), text)),
  ].join('\n\n');
}

function fileOf({ source = 'def f(a, b):\n    return a + b\n', mutants = [], codes }) {
  const name = 'x_f';
  const mutated = variants(name, source, mutants);
  return {
    path: 'src/m.py',
    exitCodes: Object.fromEntries(
      codes.map((code, index) => [`m.${name}__mutmut_${index + 1}`, code]),
    ),
    mutated,
    original: source,
  };
}

function ingest(files) {
  return ingestMutmut({ files }).findings.filter(({ rule }) => rule !== 'mutation-summary');
}

describe('mutmut run data ingester', () => {
  it('turns the recorded run of a small project into findings without line numbers in the identity', () => {
    const { findings } = ingestMutmut(recorded);

    const survivors = findings.filter(({ rule }) => rule === 'mutant-survived');
    expect(survivors.map(({ identity }) => identity)).toEqual([
      'total|0→1#1',
      'total|>→>=#1',
      'total|100→101#1',
      'total|result - discount→None#1',
      'total|-→+#1',
    ]);
    expect(survivors[0]).toEqual({
      tool: 'mutmut',
      rule: 'mutant-survived',
      path: 'src/shop/pricing.py',
      identity: 'total|0→1#1',
      message:
        'Survived number: replacing `0` with `1` fails no test. Add an assertion that would. If no input can tell the two apart, simplify the code so this mutant disappears.',
      allowedForm:
        'Add an assertion that would. If no input can tell the two apart, simplify the code so this mutant disappears.',
      classification: 'enforceable',
      symbol: 'total',
      location: { line: 6 },
    });
  });

  it('reports mutants no test reaches with the method or function they are in', () => {
    const { findings } = ingestMutmut(recorded);

    const uncovered = findings.filter(({ rule }) => rule === 'mutant-nocoverage');
    expect(new Set(uncovered.map(({ symbol }) => symbol))).toEqual(
      new Set(['Cart.label', 'fetch', 'never_called']),
    );
    expect(uncovered.every(({ classification }) => classification === 'enforceable')).toBe(true);
    expect(uncovered.find(({ identity }) => identity === 'fetch|1→2#1')).toEqual({
      tool: 'mutmut',
      rule: 'mutant-nocoverage',
      path: 'src/shop/pricing.py',
      identity: 'fetch|1→2#1',
      message: 'NoCoverage number: no test runs this code. Add a test that reaches it.',
      allowedForm: 'Add a test that reaches it.',
      classification: 'enforceable',
      symbol: 'fetch',
      location: { line: 39 },
    });
  });

  it('does not report killed mutants', () => {
    const { findings } = ingestMutmut(recorded);

    expect(findings.filter(({ symbol }) => ['Cart.add', 'Cart.helper'].includes(symbol))).toEqual(
      [],
    );
  });

  it('names a mutation by its text so that adding code above does not change it', () => {
    const base = fileOf({
      mutants: ['def f(a, b):\n    return a - b\n'],
      codes: [0],
    });
    const renumbered = {
      ...base,
      exitCodes: { 'm.x_f__mutmut_1': 1, 'm.x_f__mutmut_2': 0 },
      mutated: variants('x_f', base.original, [
        'def f(a, b):\n    return a * b\n',
        'def f(a, b):\n    return a - b\n',
      ]),
    };

    expect(ingest([base]).map(({ identity }) => identity)).toEqual(['f|+→-#1']);
    expect(ingest([renumbered]).map(({ identity }) => identity)).toEqual(['f|+→-#1']);
  });

  it('counts mutations that read the same within a function by their order', () => {
    const source = 'def f(a, b, c):\n    return a + b + c\n';
    const file = fileOf({
      source,
      mutants: [
        'def f(a, b, c):\n    return a - b + c\n',
        'def f(a, b, c):\n    return a + b - c\n',
      ],
      codes: [0, 0],
    });

    const findings = ingest([file]);

    expect(findings.map(({ identity }) => identity)).toEqual(['f|+→-#1', 'f|+→-#2']);
    expect(findings.map(({ location }) => location.line)).toEqual([2, 2]);
  });

  it('numbers each status on its own, so a mutant that is now killed leaves the others in place', () => {
    const source = 'def f(a, b, c):\n    return a + b + c\n';
    const file = fileOf({
      source,
      mutants: [
        'def f(a, b, c):\n    return a - b + c\n',
        'def f(a, b, c):\n    return a + b - c\n',
      ],
      codes: [1, 0],
    });

    expect(ingest([file]).map(({ identity }) => identity)).toEqual(['f|+→-#1']);
  });

  it('numbers same-named functions in different modules independently', () => {
    const mutants = ['def f(a, b):\n    return a - b\n'];
    const billing = { ...fileOf({ mutants, codes: [0] }), path: 'src/billing.py' };
    const identities = (ordersCode) =>
      ingest([{ ...fileOf({ mutants, codes: [ordersCode] }), path: 'src/orders.py' }, billing])
        .filter(({ path: filePath }) => filePath === 'src/billing.py')
        .map(({ identity }) => identity);

    expect(identities(0)).toEqual(['f|+→-#1']);
    expect(identities(1)).toEqual(identities(0));
  });

  it.each([
    [0, 'Survived'],
    [1, 'Killed'],
    [3, 'Killed'],
    [5, 'NoCoverage'],
    [33, 'NoCoverage'],
    [34, 'Ignored'],
    [2, 'Ignored'],
    [null, 'Ignored'],
    [36, 'Timeout'],
    [-24, 'Timeout'],
    [24, 'Timeout'],
    [152, 'Timeout'],
    [255, 'Timeout'],
    [37, 'CompileError'],
    [35, 'RuntimeError'],
    [-11, 'RuntimeError'],
    [-9, 'RuntimeError'],
    [77, 'RuntimeError'],
  ])('maps mutmut exit code %s to %s', (code, status) => {
    expect(statusOfExitCode(code)).toBe(status);
  });

  it('reports the statuses that are not survived or uncovered as descriptive', () => {
    const file = fileOf({
      mutants: ['def f(a, b):\n    return a - b\n', 'def f(a, b):\n    return a * b\n'],
      codes: [36, 37],
    });

    expect(ingest([file])).toEqual([
      {
        tool: 'mutmut',
        rule: 'mutant-timeout',
        path: 'src/m.py',
        identity: 'f|+→-#1',
        message: 'Timeout operator',
        classification: 'descriptive',
        symbol: 'f',
        location: { line: 2 },
      },
      {
        tool: 'mutmut',
        rule: 'mutant-compileerror',
        path: 'src/m.py',
        identity: 'f|+→*#1',
        message: 'CompileError operator',
        classification: 'descriptive',
        symbol: 'f',
        location: { line: 2 },
      },
    ]);
  });

  it('describes a mutation it cannot find in the generated code by its function alone', () => {
    const file = { ...fileOf({ codes: [0] }), mutated: 'def other():\n    pass\n' };

    expect(ingest([file])).toEqual([
      {
        tool: 'mutmut',
        rule: 'mutant-survived',
        path: 'src/m.py',
        identity: 'f|?→?#1',
        message:
          'Survived mutation: no test fails when this code changes. Add an assertion that would. If no input can tell the two apart, simplify the code so this mutant disappears.',
        allowedForm:
          'Add an assertion that would. If no input can tell the two apart, simplify the code so this mutant disappears.',
        classification: 'enforceable',
        symbol: 'f',
      },
    ]);
    expect(ingest([file])[0]).not.toHaveProperty('location');
  });

  it('ignores a key that is not a mutated function', () => {
    const file = fileOf({ mutants: ['def f(a, b):\n    return a - b\n'], codes: [0] });
    file.exitCodes['m.something_else'] = 0;

    expect(ingest([file])).toHaveLength(1);
  });

  it('leaves out the line when the original source is not available or does not match', () => {
    const file = fileOf({ mutants: ['def f(a, b):\n    return a - b\n'], codes: [0] });

    expect(ingest([{ ...file, original: undefined }])[0]).not.toHaveProperty('location');
    expect(ingest([{ ...file, original: 'def g():\n    pass\n' }])[0]).not.toHaveProperty(
      'location',
    );
  });

  it('finds the line of a change below the function header and in multi-line signatures', () => {
    const source = 'import os\n\n\ndef f(\n    a,\n    b,\n):\n    x = 1\n    return a + b\n';
    const mutatedSource = [
      `def x_f__mutmut_orig(\n    a,\n    b,\n):\n    x = 1\n    return a + b`,
      `def x_f__mutmut_1(\n    a,\n    b,\n):\n    x = 1\n    return a - b`,
    ].join('\n\n\n');

    const [finding] = ingest([
      {
        path: 'src/m.py',
        exitCodes: { 'm.x_f__mutmut_1': 0 },
        mutated: mutatedSource,
        original: source,
      },
    ]);

    expect(finding.identity).toBe('f|+→-#1');
    expect(finding.location).toEqual({ line: 9 });
  });

  it('counts the mutants of every status, killed ones included, as descriptive metrics', () => {
    const { findings } = ingestMutmut(recorded);

    expect(findings.filter(({ rule }) => rule === 'mutation-summary')).toEqual([
      ...[
        ['Survived', 5],
        ['Killed', 12],
        ['NoCoverage', 17],
      ].map(([status, value]) => ({
        tool: 'mutmut',
        rule: 'mutation-summary',
        path: '.',
        identity: `status:${status}`,
        message: `${status} mutants`,
        classification: 'descriptive',
        metric: { name: status, value },
      })),
    ]);
  });

  it('fails when mutmut wrote results but none has a name it can read', () => {
    const file = fileOf({ mutants: ['def f(a, b):\n    return a - b\n'], codes: [0] });
    file.exitCodes = { 'm.f__mutmut_1': 0, 'm.f__mutmut_2': 1 };

    expect(() => ingestMutmut({ files: [file] })).toThrow(
      'mutmut wrote 2 results whose names are not in the form nitpicker reads (for example m.f__mutmut_1): this mutmut version is not supported (nitpicker reads the run data of mutmut 3.x)',
    );
  });

  it('accepts a run with no results at all', () => {
    const file = { ...fileOf({ codes: [] }), exitCodes: {} };

    expect(ingestMutmut({ files: [file] }).findings).toEqual([]);
  });

  it('rejects data that is not a list of files', () => {
    expect(() => ingestMutmut({})).toThrow('mutmut run data must contain a files array');
    expect(() => ingestMutmut(undefined)).toThrow('mutmut run data must contain a files array');
  });

  it('uses the tool name it is given', () => {
    const file = fileOf({ mutants: ['def f(a, b):\n    return a - b\n'], codes: [0] });

    expect(ingestMutmut({ files: [file] }, { tool: 'custom' }).findings[0].tool).toBe('custom');
  });

  it('labels mutations by what changed', () => {
    const source = "def f(a):\n    return a + 1 if a else 'x'\n";
    const change = (text) => `def f(a):\n    return ${text}\n`;
    const file = fileOf({
      source,
      mutants: [
        change("a - 1 if a else 'x'"),
        change("a + 2 if a else 'x'"),
        change("a + 1 if a else 'XXxXX'"),
        change("a + 1 if not a else 'x'"),
      ],
      codes: [0, 0, 0, 0],
    });

    expect(ingest([file]).map(({ message }) => message.split(':')[0])).toEqual([
      'Survived operator',
      'Survived number',
      'Survived string',
      'Survived expression',
    ]);
  });

  it('leaves out the mutants of an assert_never the type checker proves unreachable', () => {
    const match = (...arms) =>
      ['def f(a):', '    match a:', '        case 1:', '            return 1', ...arms, ''].join(
        '\n',
      );
    const never = ['        case _:', '            assert_never(a)'];
    const two = ['        case 2:', '            return 2'];
    const file = fileOf({
      source: match(...two, ...never),
      mutants: [
        match(...two),
        match(...two, '        case _:', '            assert_never(None)'),
        match(...never),
      ],
      codes: [0, 0, 0],
    });

    expect(ingest([file]).map(({ location }) => location)).toEqual([{ line: 5 }]);
  });

  it.each([
    [
      'an arm with another statement',
      ['    match a:', '        case _:', '            assert_never(a)', '            return 0'],
      ['    match a:', '        case _:', '            assert_never(a)', '            return 1'],
      5,
    ],
    [
      'an arm with an argument that is not a name',
      ['    match a:', '        case _:', '            assert_never(g(a))'],
      ['    match a:', '        case _:', '            assert_never(g(None))'],
      4,
    ],
    [
      'an else branch',
      ['    if a:', '        return 1', '    else:', '        assert_never(a)'],
      ['    if a:', '        return 1', '    else:', '        assert_never(None)'],
      5,
    ],
    [
      'a conditional expression',
      ['    assert_never(a) if a > 100 else print(a)'],
      ['    assert_never(a) if a >= 100 else print(a)'],
      2,
    ],
  ])('keeps the mutants of an assert_never in %s', (_, body, mutatedBody, line) => {
    const lines = (rows) => ['def f(a):', ...rows, ''].join('\n');
    const file = fileOf({ source: lines(body), mutants: [lines(mutatedBody)], codes: [0] });

    expect(ingest([file]).map(({ location }) => location)).toEqual([{ line }]);
  });
});

describe('generated function blocks', () => {
  it('splits a file at the definitions, including methods, async functions and wrapped signatures', () => {
    const source = [
      'class A:',
      '    def m(self):',
      '        return 1',
      '',
      '    async def n(',
      '        self,',
      '    ):',
      '        return 2',
      '',
      'def top():',
      '    return 3',
      '',
      '',
      "x = 'after'",
    ].join('\n');

    const blocks = functionBlocks(source);

    expect([...blocks.keys()]).toEqual(['m', 'n', 'top']);
    expect(blocks.get('m')).toEqual(['    def m(self):', '        return 1']);
    expect(blocks.get('n')).toEqual([
      '    async def n(',
      '        self,',
      '    ):',
      '        return 2',
    ]);
    expect(blocks.get('top')).toEqual(['def top():', '    return 3']);
  });

  it('reads Windows line endings', () => {
    expect(functionBlocks('def a():\r\n    return 1\r\n').get('a')).toEqual([
      'def a():',
      '    return 1',
    ]);
  });
});
