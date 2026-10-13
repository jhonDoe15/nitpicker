import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readPythonStructureFindings, STRUCTURE_REPORT } from '../adapters/python-structure.mjs';

const script = path.resolve(import.meta.dirname, 'structure_metrics.py');
const directories = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

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

function metricsOf(files) {
  const directory = mkdtempSync(path.join(tmpdir(), 'nitpicker-structure-metrics-'));
  directories.push(directory);
  for (const [file, content] of Object.entries(files)) {
    writeFileSync(path.join(directory, file), content);
  }
  const listing = path.join(directory, 'listing.txt');
  writeFileSync(listing, Object.keys(files).join('\n'));
  const output = path.join(directory, 'metrics.json');
  const result = spawnSync('python3', [script, output, directory, listing], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(result.stderr);
  }
  return JSON.parse(readFileSync(output, 'utf8'));
}

const functionsOf = (source) => metricsOf({ 'sample.py': `${source.join('\n')}\n` });
const field = (source, name) => functionsOf(source).map((entry) => entry[name]);

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
      metrics.map(({ name, start, definition, bodyStart }) => [name, start, definition, bodyStart]),
    ).toEqual([
      ['decorated', 1, 2, 3],
      ['inline', 7, 7, 7],
    ]);
  });

  it('skips a file that does not parse, or that is too deep for the parser', () => {
    const metrics = metricsOf({
      'broken.py': 'def (:\n',
      'deep.py': `X = ${Array.from({ length: 60_000 }, () => '1').join(' + ')}\n`,
      'ok.py': 'def f():\n    return 1\n',
    });

    expect(metrics.map(({ file, name }) => `${file} ${name}`)).toEqual(['ok.py f']);
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
    const directory = mkdtempSync(path.join(tmpdir(), 'nitpicker-structure-findings-'));
    directories.push(directory);
    writeFileSync(path.join(directory, 'sample.py'), `${source.join('\n')}\n`);
    writeFileSync(path.join(directory, 'listing.txt'), 'sample.py');
    const output = path.join(directory, STRUCTURE_REPORT);
    const result = spawnSync(
      'python3',
      [script, output, directory, path.join(directory, 'listing.txt')],
      { encoding: 'utf8' },
    );
    if (result.status !== 0) {
      throw new Error(result.stderr);
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

describe('complexity', () => {
  const complexityOf = (...body) =>
    field(['def f(a, b, c):', ...body.map((line) => `    ${line}`)], 'complexity')[0];

  it('is 1 for a function without a decision', () => {
    expect(complexityOf('return a')).toBe(1);
  });

  it('counts each if and elif, but not else', () => {
    expect(
      complexityOf(
        'if a:',
        '    return 1',
        'elif b:',
        '    return 2',
        'elif c:',
        '    return 3',
        'else:',
        '    return 4',
      ),
    ).toBe(4);
  });

  it('counts each loop and except handler, but not the else of a loop or a try, nor finally', () => {
    expect(complexityOf('for x in a:', '    pass', 'else:', '    pass')).toBe(2);
    expect(complexityOf('while a:', '    pass', 'else:', '    pass')).toBe(2);
    expect(
      complexityOf(
        'try:',
        '    pass',
        'except ValueError:',
        '    pass',
        'except (KeyError, TypeError):',
        '    pass',
        'else:',
        '    pass',
        'finally:',
        '    pass',
      ),
    ).toBe(3);
  });

  it('counts an async for loop and the loop of an async comprehension', () => {
    expect(
      field(
        [
          'async def f(a):',
          '    async for x in a:',
          '        pass',
          '    return [y async for y in a]',
        ],
        'complexity',
      ),
    ).toEqual([3]);
  });

  it('counts each extra operand of and and or', () => {
    expect(complexityOf('return a and b')).toBe(2);
    expect(complexityOf('return a and b and c')).toBe(3);
    expect(complexityOf('return a and b or c')).toBe(3);
    expect(complexityOf('return (a or b) and (b or c)')).toBe(4);
  });

  it('counts a conditional expression, and an if with a boolean operator twice', () => {
    expect(complexityOf('return a if b else c')).toBe(2);
    expect(complexityOf('if a and b:', '    return 1')).toBe(3);
  });

  it('counts the loop and each condition of a comprehension, in a lambda too', () => {
    expect(complexityOf('return [x for x in a if x if b]')).toBe(4);
    expect(complexityOf('return {x: y for x in a for y in b}')).toBe(3);
    expect(complexityOf('return (x for x in a)')).toBe(2);
    expect(complexityOf('return lambda x: x if a else b')).toBe(2);
  });

  it('counts each case of a match but a wildcard without a guard, like default in a switch', () => {
    expect(
      complexityOf(
        'match a:',
        '    case 1:',
        '        pass',
        '    case 2 | 3:',
        '        pass',
        '    case _:',
        '        pass',
      ),
    ).toBe(3);
    expect(
      complexityOf(
        'match a:',
        '    case 1:',
        '        pass',
        '    case x if x > b:',
        '        pass',
        '    case _ if c:',
        '        pass',
      ),
    ).toBe(4);
  });

  it('leaves nested functions and classes to their own entries', () => {
    const metrics = functionsOf([
      'def outer(a):',
      '    def inner(b):',
      '        if b:',
      '            return 1',
      '        return 0',
      '',
      '    class Local:',
      '        def method(self, c):',
      '            return c and a',
      '',
      '    return inner(a) if a else Local',
    ]);

    expect(metrics.map(({ name, complexity }) => [name, complexity])).toEqual([
      ['outer', 2],
      ['outer.inner', 2],
      ['outer.Local.method', 2],
    ]);
  });
});
