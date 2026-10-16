import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NO_MUTATION, VIOLATION, SAME_NAME_SOURCES } from './test-support/python-preset-data.mjs';
import {
  commitBranch,
  fixture,
  fixtureRepository,
  gate,
  pythonE2eEnabled,
  removeRepositories,
} from './test-support/python-e2e-support.mjs';

describe.skipIf(!pythonE2eEnabled)(
  'Python preset tool errors, structure and CRAP end to end',
  () => {
    let project;
    beforeAll(() => {
      project = fixtureRepository(['coverage', 'mutmut', 'pytest', 'mypy']);
      commitBranch(project, 'failing-tests', {
        'pyproject.toml': `${readFileSync(path.join(fixture, 'pyproject.toml'), 'utf8')}\n[tool.pytest.ini_options]\naddopts = "-x"\n`,
        'tests/test_more.py':
          'def test_one():\n    assert 1 == 2\n\n\ndef test_two():\n    assert 2 == 3\n',
        'src/demo/bad.py': VIOLATION,
      });
      commitBranch(project, 'project-shape', {
        ...NO_MUTATION,
        'tests/test_slow.py': 'import time\n\n\ndef test_waits():\n    time.sleep(5.2)\n',
        'src/demo/cyc_a.py': 'from demo import cyc_b\n\n\ndef a():\n    return cyc_b.b()\n',
        'src/demo/cyc_b.py':
          'from demo import cyc_a\n\n\ndef b():\n    return 1\n\n\ndef c():\n    return cyc_a.a()\n',
        'src/demo/report.py':
          'import coverage\n\n\ndef version():\n    return coverage.__version__\n',
      });
      commitBranch(project, 'broken-environment', {
        'nitpicker.config.json': '{ "preset": "python", "python": { "environment": "nowhere" } }\n',
      });
    });
    afterAll(removeRepositories);
    it('keeps every other finding when tests fail, runs all tests despite -x, and mutates against the passing modules', () => {
      const result = gate(project, 'failing-tests');

      expect(result.exitCode, result.text).toBe(1);
      expect(result.json('tool-errors.json')).toEqual([
        {
          tool: 'tests',
          snapshot: 'head',
          rule: 'tests-failed',
          path: '.',
          message: [
            'Tests fail in the head snapshot. Make each failing test pass:',
            '  tests/test_more.py::test_one',
            '  tests/test_more.py::test_two',
            'The static analyzers ran as usual; coverage and CRAP come from the tests that ran.',
            'Mutation testing (mutmut) leaves out the test modules tests/test_more.py.',
          ].join('\n'),
        },
      ]);
      expect(
        result
          .json('new-findings.json')
          .filter(({ path: file }) => file === 'src/demo/bad.py')
          .map(({ tool }) => tool),
      ).toContain('ruff');
    });
    it('reports a slow new test, an import cycle and a dev-only package in production code', () => {
      const result = gate(project, 'project-shape');

      expect(result.exitCode, result.text).toBe(1);
      const shape = result
        .json('new-findings.json')
        .filter(({ rule }) =>
          ['slow-test', 'no-production-cycles', 'no-dev-dependency-in-production'].includes(rule),
        )
        .map(({ tool, rule, path: file }) => `${tool} ${rule} ${file}`);
      expect(shape).toEqual([
        'coupling no-production-cycles src/demo/cyc_a.py',
        'coupling no-production-cycles src/demo/cyc_b.py',
        'dependencies no-dev-dependency-in-production src/demo/report.py',
        'test-runtime slow-test tests/test_slow.py',
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
