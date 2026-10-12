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
  return ingestMutmut({ files }).findings;
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
    expect(uncovered.find(({ identity }) => identity === 'fetch|1→2#1')).toEqual(
      expect.objectContaining({
        message: 'NoCoverage number: no test runs this code. Add a test that reaches it.',
        location: { line: 39 },
      }),
    );
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
      expect.objectContaining({
        rule: 'mutant-timeout',
        classification: 'descriptive',
        message: 'Timeout operator',
      }),
      expect.objectContaining({ rule: 'mutant-compileerror', classification: 'descriptive' }),
    ]);
  });

  it('describes a mutation it cannot find in the generated code by its function alone', () => {
    const file = { ...fileOf({ codes: [0] }), mutated: 'def other():\n    pass\n' };

    expect(ingest([file])).toEqual([
      expect.objectContaining({
        identity: 'f|?→?#1',
        message: expect.stringContaining('Survived mutation: no test fails when this code changes'),
      }),
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
