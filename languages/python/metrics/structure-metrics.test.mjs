import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  readPythonStructureFindings,
  STRUCTURE_REPORT,
} from '../adapters/analysis/python-structure.mjs';
import { createMetrics, pythonUsable, script } from './python-helpers.mjs';

const { directory: scratchDirectory, cleanup, field, functionsOf, metricsOf } = createMetrics();

afterEach(cleanup);

const SAMPLE_SOURCE = [
  'import functools',
  '',
  '',
  'class Service:',
  '    def method(self, a, b, c):',
  '        return a',
  '',
  '    @staticmethod',
  '    def static(a, b, c, d):',
  '        return a',
  '',
  '    @classmethod',
  '    def build(cls, a):',
  '        def inner(x):',
  '            if x:',
  '                return 1',
  '            return 2',
  '',
  '        return inner(a)',
  '',
  '    @functools.cache',
  '    async def fetch(self, *args, key=None, **kwargs):',
  '        """Docstring is not a statement."""',
  '        try:',
  '            await self.method(1, 2, 3)',
  '        except ValueError:',
  '            pass',
  '        finally:',
  '            key = 1',
  '        with open("f") as handle:',
  '            return lambda q: q if handle else key',
  '',
  '',
  'def chain(x):',
  '    if x == 1:',
  '        return 1',
  '    elif x == 2:',
  '        return 2',
  '    elif x == 3:',
  '        return 3',
  '    return 0',
  '',
  '',
  'def loops(items):',
  '    for item in items:',
  '        while item:',
  '            item -= 1',
  '            if item:',
  '                break',
  '    match items:',
  '        case []:',
  '            return 0',
  '        case _:',
  '            return 1',
  '',
  '',
  'def positional(a, /, b, *, c):',
  '    pass',
  '',
].join('\n');

describe.skipIf(!pythonUsable())('with python3 3.10 or newer on the PATH', () => {
  describe('the structure metrics script', () => {
    it('counts lines, statements, control nesting, parameters and complexity the way the shared limits mean them', () => {
      const metrics = metricsOf({ 'sample.py': SAMPLE_SOURCE });

      expect(
        metrics.map((entry) => [
          entry.name,
          entry.start,
          entry.end,
          entry.lines,
          entry.statements,
          entry.maxControlNesting,
          entry.parameters,
          entry.complexity,
        ]),
      ).toEqual([
        ['Service.method', 5, 6, 2, 1, 0, 3, 1],
        ['Service.static', 8, 10, 3, 1, 0, 4, 1],
        ['Service.build', 12, 19, 8, 2, 0, 1, 1],
        ['Service.build.inner', 14, 17, 4, 3, 1, 1, 2],
        ['Service.fetch', 21, 31, 10, 6, 1, 3, 3],
        ['chain', 34, 41, 8, 7, 1, 1, 4],
        ['loops', 44, 54, 11, 8, 3, 1, 5],
        ['positional', 57, 58, 2, 1, 0, 3, 1],
      ]);
      expect(metrics.every(({ file }) => file === 'sample.py')).toBe(true);
    });

    it('reports the def line and the first body line apart from the first decorator line', () => {
      const metrics = functionsOf([
        '@decorator',
        'def decorated(a):',
        '    """Doc."""',
        '    return a',
        '',
        '',
        'def inline(a): return a',
      ]);

      expect(
        metrics.map(({ name, start, definition, bodyStart }) => [
          name,
          start,
          definition,
          bodyStart,
        ]),
      ).toEqual([
        ['decorated', 1, 2, 3],
        ['inline', 7, 7, 7],
      ]);
    });

    it('survives a function with more elif branches than the interpreter has recursion levels', () => {
      const branches = Array.from({ length: 1500 }, (_, index) => [
        `    elif x == ${String(index + 2)}:`,
        `        return ${String(index + 2)}`,
      ]).flat();

      expect(
        functionsOf(['def dispatch(x):', '    if x == 1:', '        return 1', ...branches]).map(
          ({ name, maxControlNesting, complexity }) => [name, maxControlNesting, complexity],
        ),
      ).toEqual([['dispatch', 1, 1502]]);
    });

    it('flags an overload, however its decorator is written', () => {
      const metrics = functionsOf([
        '@overload',
        'def a(x: int) -> int: ...',
        '',
        '',
        '@typing.overload',
        'def a(',
        '    x: str,',
        ') -> str: ...',
        '',
        '',
        '@t.overload',
        'def a(x: bytes) -> bytes:',
        '    ...',
        '',
        '',
        '@functools.cache',
        'def a(x):',
        '    return x',
      ]);

      expect(metrics.map(({ overload }) => overload)).toEqual([true, true, true, false]);
    });

    it('skips a file that does not parse, which ruff reports as a syntax error', () => {
      const metrics = metricsOf({
        'broken.py': 'def (:\n',
        'ok.py': 'def f():\n    return 1\n',
      });

      expect(metrics.map(({ file, name }) => `${file} ${name}`)).toEqual(['ok.py f']);
    });

    it('fails with a clear message on a file too deeply nested for the parser instead of skipping it', () => {
      const directory = scratchDirectory();
      writeFileSync(
        path.join(directory, 'deep.py'),
        `X = ${Array.from({ length: 60_000 }, () => '1').join(' + ')}\n`,
      );
      writeFileSync(path.join(directory, 'listing.txt'), 'deep.py');

      const result = spawnSync(
        'python3',
        [
          script,
          path.join(directory, STRUCTURE_REPORT),
          directory,
          path.join(directory, 'listing.txt'),
        ],
        { encoding: 'utf8' },
      );

      expect([result.status, result.stderr]).toEqual([
        1,
        'structure_metrics: deep.py is too deeply nested for the Python parser (RecursionError), so its functions cannot be measured: split the very long expression or data literal into smaller parts\n',
      ]);
    });

    it('does not count the docstring as a line, so documenting a long function does not grow it', () => {
      const body = ['    a = 1', '    return a'];
      const lines = (...head) =>
        metricsOf({ 'doc.py': ['def f():', ...head, ...body, ''].join('\n') })[0].lines;

      expect(lines()).toBe(3);
      expect(lines('    """Doc."""')).toBe(3);
      expect(lines('    """Doc.', '', '    More.', '    """')).toBe(3);
    });
  });

  describe('control nesting', () => {
    it('counts a flat if, elif and else chain as one level', () => {
      expect(
        field(
          [
            'def f(x):',
            '    if x == 1:',
            '        return 1',
            '    elif x == 2:',
            '        return 2',
            '    elif x == 3:',
            '        return 3',
            '    elif x == 4:',
            '        return 4',
            '    else:',
            '        return 5',
          ],
          'maxControlNesting',
        ),
      ).toEqual([1]);
    });

    it('counts an if inside the body of an elif one level deeper than the chain', () => {
      expect(
        field(
          [
            'def f(x, y):',
            '    if x == 1:',
            '        return 1',
            '    elif x == 2:',
            '        if y:',
            '            return 2',
            '        return 3',
            '    return 0',
          ],
          'maxControlNesting',
        ),
      ).toEqual([2]);
    });

    it('counts an elif chain inside a branch of another chain as a second level only', () => {
      expect(
        field(
          [
            'def f(x, y):',
            '    if x:',
            '        if y == 1:',
            '            return 1',
            '        elif y == 2:',
            '            return 2',
            '        elif y == 3:',
            '            return 3',
            '    return 0',
          ],
          'maxControlNesting',
        ),
      ).toEqual([2]);
    });

    it('counts an if inside an else block as nested, as an else block is in Java and TypeScript', () => {
      expect(
        field(
          [
            'def f(x, y):',
            '    if x:',
            '        return 1',
            '    else:',
            '        if y:',
            '            return 2',
            '    return 0',
          ],
          'maxControlNesting',
        ),
      ).toEqual([2]);
    });

    it('counts a match as one level, whatever its number of cases, and a statement in a case below it', () => {
      const cases = [
        '    match x:',
        '        case 1:',
        '            return 1',
        '        case 2:',
        '            return 2',
        '        case _:',
        '            return 3',
      ];

      expect(field(['def flat(x):', ...cases], 'maxControlNesting')).toEqual([1]);
      expect(
        field(
          [
            'def nested(x, y):',
            '    match x:',
            '        case 1:',
            '            if y:',
            '                return 1',
            '        case 2:',
            '            return 2',
            '    return 0',
          ],
          'maxControlNesting',
        ),
      ).toEqual([2]);
      expect(
        field(
          [
            'def chained(x, y):',
            '    match x:',
            '        case 1:',
            '            if y == 1:',
            '                return 1',
            '            elif y == 2:',
            '                return 2',
            '    return 0',
          ],
          'maxControlNesting',
        ),
      ).toEqual([2]);
    });

    it('counts for, while and except like if', () => {
      expect(
        field(
          [
            'def f(items):',
            '    for item in items:',
            '        try:',
            '            item()',
            '        except ValueError:',
            '            while item:',
            '                item = None',
          ],
          'maxControlNesting',
        ),
      ).toEqual([3]);
    });
  });

  describe('the structure findings of the report', () => {
    function findingsOf(source) {
      const directory = scratchDirectory('nitpicker-structure-findings-');
      writeFileSync(path.join(directory, 'sample.py'), `${source.join('\n')}\n`);
      writeFileSync(path.join(directory, 'listing.txt'), 'sample.py');
      const output = path.join(directory, STRUCTURE_REPORT);
      const result = spawnSync(
        'python3',
        [script, output, directory, path.join(directory, 'listing.txt')],
        { encoding: 'utf8' },
      );
      if (result.status !== 0) {
        throw result.error ?? new Error(result.stderr);
      }
      return readPythonStructureFindings(directory, directory).map(({ rule, symbol, message }) => ({
        rule,
        symbol,
        message,
      }));
    }

    it('does not fail a loop around a long if, elif and else chain', () => {
      expect(
        findingsOf([
          'def flat(items):',
          '    for item in items:',
          '        if item == 1:',
          '            return 1',
          '        elif item == 2:',
          '            return 2',
          '        elif item == 3:',
          '            return 3',
          '        elif item == 4:',
          '            return 4',
          '        else:',
          '            return 5',
        ]),
      ).toEqual([]);
    });

    it('fails an if nested in the body of an elif below a loop, and names the elif rule', () => {
      expect(
        findingsOf([
          'def deep(items, flag):',
          '    for item in items:',
          '        if item == 1:',
          '            return 1',
          '        elif item == 2:',
          '            if flag:',
          '                return 2',
        ]),
      ).toEqual([
        {
          rule: 'function-control-nesting-limit',
          symbol: 'deep',
          message:
            'deep nests control flow 3 deep (limit 2). Return early instead of nesting. An if/elif chain counts as one level; use match, a dict lookup or a helper function for what nests inside a branch.',
        },
      ]);
    });
  });
});
