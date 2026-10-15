import path from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  GREETER_HI_TEST,
  NO_MUTATION,
  SAMPLE_SOURCE,
  SAME_NAME_SOURCES,
} from './python-preset-data.mjs';
import {
  command,
  commitBranch,
  fixtureRepository,
  gate,
  pythonE2eEnabled,
  removeRepositories,
  repository,
  write,
} from './python-e2e-support.mjs';

describe.skipIf(!pythonE2eEnabled)(
  'Python preset tool errors, structure and CRAP end to end',
  () => {
    let project;
    beforeAll(() => {
      project = fixtureRepository(['coverage', 'mutmut', 'pytest', 'mypy']);
      commitBranch(project, 'failing-tests', {
        'tests/test_greeter.py': GREETER_HI_TEST,
      });
      commitBranch(project, 'broken-environment', {
        'nitpicker.config.json': '{ "preset": "python", "python": { "environment": "nowhere" } }\n',
      });
    });
    afterAll(removeRepositories);
    it('reports failing tests on head as a tool error with exit 2, never a throw', () => {
      const result = gate(project, 'failing-tests');

      expect(result.exitCode, result.text).toBe(2);
      expect(result.json('tool-errors.json')).toEqual([
        {
          tool: 'python',
          snapshot: 'head',
          rule: 'tests-failed',
          path: '.',
          message: expect.stringMatching(
            new RegExp(
              [
                '^coverage run exited 1 in the virtualenv environment:\\n',
                "[\\s\\S]*assert 'Hello, Ada!' == 'Hi, Ada!'[\\s\\S]*1 faile",
                'd, 2 passed in [\\d.]+s$',
              ].join(''),
              '',
            ),
          ),
        },
      ]);
    });
    it('reports a missing environment as a tool error', () => {
      const result = gate(project, 'broken-environment');

      expect(result.exitCode, result.text).toBe(2);
      const message = `No Python environment at ${path.join(project, 'nowhere')} (${path.join(project, 'nowhere/bin')} does not exist): create it, or set "python.environment"`;
      expect(
        result.json('tool-errors.json').sort((left, right) => left.tool.localeCompare(right.tool)),
      ).toEqual([
        { tool: 'mutation', snapshot: 'head', message },
        { tool: 'python', snapshot: 'head', message },
      ]);
    });
    describe('function structure and CRAP', () => {
      beforeAll(() => {
        commitBranch(project, 'nested-and-wide', {
          ...NO_MUTATION,
          'src/demo/nested.py':
            'def classify(rows, skip, stop, default):\n    for row in rows:\n        for cell in row:\n            if cell:\n                return cell\n    return None\n',
          'tests/test_nested.py':
            'from demo.nested import classify\n\n\ndef test_classify():\n    assert classify([[0, 5]], 0, 0, 0) == 5\n    assert classify([[0]], 0, 0, 0) is None\n',
        });
        commitBranch(project, 'legacy-edited', {
          ...NO_MUTATION,
          'src/demo/wide.py': 'def wide(a, b, c, d):\n    return a + b + c + d + 1\n',
        });
        commitBranch(project, 'legacy-grown', {
          ...NO_MUTATION,
          'src/demo/wide.py': 'def wide(a, b, c, d, e):\n    return a + b + c + d + e\n',
        });
        commitBranch(project, 'untested-complex', {
          ...NO_MUTATION,
          ...SAME_NAME_SOURCES,
          'src/demo/branchy.py':
            'def pick(a, b, c):\n    if a:\n        return 1\n    if b:\n        return 2\n    if c:\n        return 3\n    return 4\n',
        });
      });
      const enforceable = (result) =>
        result
          .json('new-findings.json')
          .filter(
            ({ classification, tool }) =>
              classification === 'enforceable' && ['structure', 'crap'].includes(tool),
          );
      it('fails a new function over the structure limits with the same rules as TypeScript and Java', () => {
        const result = gate(project, 'nested-and-wide');

        expect(result.exitCode, result.text).toBe(1);
        expect(
          enforceable(result).map(({ tool, rule, symbol }) => `${tool} ${rule} ${symbol}`),
        ).toEqual([
          'structure function-control-nesting-limit classify',
          'structure function-parameters-limit classify',
        ]);
      });
      it('keeps a touched legacy function that is still over the limit, and fails it when it grows', () => {
        expect(gate(project, 'legacy-edited').exitCode).toBe(0);

        const grown = gate(project, 'legacy-grown');

        expect(grown.exitCode, grown.text).toBe(1);
        expect(enforceable(grown)).toEqual([
          {
            tool: 'structure',
            rule: 'function-parameters-limit',
            path: 'src/demo/wide.py',
            symbol: 'wide',
            identity: expect.any(String),
            message:
              'wide grew from 4 to 5 parameters (limit 3). Group related parameters into one object instead of adding another.',
            classification: 'enforceable',
            location: { line: 1 },
            ratchet: {
              key: 'function:wide:occurrence:1:parameters',
              value: 5,
              worseMessage:
                'wide grew from {base} to 5 parameters (limit 3). Group related parameters into one object instead of adding another.',
              heldMessage:
                'wide: 5 parameters (limit 3), allowed because base was {base}; any increase fails.',
            },
          },
        ]);
      });
      it('fails a new untested branchy function on its CRAP score, and scores tested same-named definitions from their own lines', () => {
        const result = gate(project, 'untested-complex');

        expect(result.exitCode, result.text).toBe(1);
        expect(enforceable(result)).toEqual([
          {
            tool: 'crap',
            rule: 'crap-score-limit',
            path: 'src/demo/branchy.py',
            symbol: 'pick',
            identity: expect.any(String),
            message:
              'pick has CRAP 20.00; score must be below 9. Test its uncovered branches, or split a branchy part into its own function.',
            classification: 'enforceable',
            location: { line: 1 },
            ratchet: {
              key: 'function:pick:crap',
              value: 20,
              worseMessage:
                'pick CRAP rose from {base} to 20 (limit 9). Put new code in a new function and cover it with tests.',
              heldMessage:
                'pick: CRAP 20.00 (limit 9), allowed because base was {base}; any increase fails.',
            },
          },
        ]);
      });
    });
  },
);
describe.skipIf(!pythonE2eEnabled)('Python structure metrics script', () => {
  const script = path.resolve(
    new URL('../', import.meta.url).pathname,
    '../metrics/structure_metrics.py',
  );
  function metricsOf(files) {
    const directory = repository();
    write(directory, files);
    const listing = path.join(directory, 'listing.txt');
    writeFileSync(listing, Object.keys(files).join('\n'));
    const output = path.join(directory, 'metrics.json');
    command(directory, 'python3', [script, output, directory, listing]);
    return JSON.parse(readFileSync(output, 'utf8'));
  }
  it('counts lines, statements, control nesting and parameters the way the shared limits mean them', () => {
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
      ]),
    ).toEqual([
      ['Service.method', 5, 6, 2, 1, 0, 3],
      ['Service.static', 8, 10, 3, 1, 0, 4],
      ['Service.build', 12, 19, 8, 2, 0, 1],
      ['Service.build.inner', 14, 17, 4, 3, 1, 1],
      ['Service.fetch', 21, 31, 10, 6, 1, 3],
      ['chain', 34, 41, 8, 7, 3, 1],
      ['loops', 44, 54, 11, 8, 3, 1],
      ['positional', 57, 58, 2, 1, 0, 3],
    ]);
    expect(metrics.every(({ file }) => file === 'sample.py')).toBe(true);
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
