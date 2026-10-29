import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { acceptedDigest } from '../../../../core/command/test-support/accepted-digest.mjs';
import {
  LEGACY_WEAKER,
  PRICING,
  PRICING_FULL_TEST,
  PRICING_TEST,
  PRICING_WITH_UNUSED,
} from './test-support/python-preset-data.mjs';
import {
  commitBranch,
  fixture,
  fixtureRepository,
  gate,
  initializeRepository,
  installPackages,
  pythonE2eEnabled,
  removeRepositories,
  repository,
  write,
} from './test-support/python-e2e-support.mjs';

const MUTMUT_LISTED_CONFIG =
  '{ "preset": "python", "tools": { "mutmut": { "precedence": ["project", "nitpicker"] } } }\n';
const MUTMUT_LISTED = 'tools.mutmut.precedence: not set -> ["project","nitpicker"]';

const ACCEPTED = {
  CI: 'true',
  NITPICKER_ACCEPT_POLICY_CHANGE: acceptedDigest([MUTMUT_LISTED], {
    'nitpicker.config.json': MUTMUT_LISTED_CONFIG,
  }),
};
const SHRUNK = `${readFileSync(path.join(fixture, 'pyproject.toml'), 'utf8')}\n[tool.mutmut]\ndo_not_mutate = ["src/*"]\n`;
const OWN_KEY = `${readFileSync(path.join(fixture, 'pyproject.toml'), 'utf8')}\n[tool.mutmut]\nmax_stack_depth = 8\n`;
const PRODUCTION_FILES = ['__init__', 'greeter', 'legacy', 'pricing', 'wide'].map(
  (name) => `src/demo/${name}.py`,
);
const mutantFindings = (result) =>
  result
    .json('new-findings.json')
    .filter(({ tool, rule }) => tool === 'mutmut' && rule !== 'mutation-summary');

describe.skipIf(!pythonE2eEnabled)('Python preset mutation gates end to end', () => {
  let project;
  beforeAll(() => {
    project = fixtureRepository(['coverage', 'mutmut', 'pytest', 'mypy']);
    commitBranch(project, 'weaker-source', { 'src/demo/legacy.py': LEGACY_WEAKER });
    commitBranch(project, 'survivors', {
      'src/demo/pricing.py': PRICING_WITH_UNUSED,
      'tests/test_pricing.py': PRICING_TEST,
    });
    const pricing = {
      'src/demo/pricing.py': PRICING_WITH_UNUSED,
      'tests/test_pricing.py': PRICING_TEST,
      'pyproject.toml': SHRUNK,
    };
    commitBranch(project, 'shrunk', pricing);
    commitBranch(project, 'shrunk-listed', {
      ...pricing,
      'nitpicker.config.json': MUTMUT_LISTED_CONFIG,
    });
    commitBranch(project, 'listed-key', {
      ...pricing,
      'pyproject.toml': OWN_KEY,
      'nitpicker.config.json': MUTMUT_LISTED_CONFIG,
    });
    commitBranch(project, 'killed', {
      'src/demo/pricing.py': PRICING,
      'tests/test_pricing.py': PRICING_FULL_TEST,
    });
  });
  afterAll(removeRepositories);
  it('fails new surviving and uncovered mutants but not the legacy survivors of the base', () => {
    const result = gate(project, 'survivors');

    expect(result.exitCode, result.text).toBe(1);
    const mutants = result
      .json('new-findings.json')
      .filter(({ tool, rule }) => tool === 'mutmut' && rule !== 'mutation-summary');
    expect(new Set(mutants.map(({ rule }) => rule))).toEqual(
      new Set(['mutant-survived', 'mutant-nocoverage']),
    );
    expect(new Set(mutants.map(({ path: file }) => file))).toEqual(
      new Set(['src/demo/pricing.py']),
    );
    expect(mutants.find(({ rule }) => rule === 'mutant-survived')).toEqual({
      tool: 'mutmut',
      rule: 'mutant-survived',
      path: 'src/demo/pricing.py',
      identity: 'discount|-→+#1',
      message:
        'Survived operator: replacing `-` with `+` fails no test. Add an assertion that would. If no input can tell the two apart, simplify the code so this mutant disappears. If this is intended, add {"rule":"mutant-survived","paths":["src/demo/pricing.py"],"function":"discount","reason":"..."} to "exceptions" in nitpicker.config.json.',
      allowedForm:
        'Add an assertion that would. If no input can tell the two apart, simplify the code so this mutant disappears.',
      exception: {
        rule: 'mutant-survived',
        paths: ['src/demo/pricing.py'],
        function: 'discount',
        reason: '...',
      },
      exceptionList: 'exceptions',
      classification: 'enforceable',
      symbol: 'discount',
      location: { line: 2 },
    });
  });
  it('keeps mutating the files a do_not_mutate of the project config would skip, and reports them as ignored', () => {
    const result = gate(project, 'shrunk');
    const findings = mutantFindings(result);
    const mutated = findings.filter(({ rule }) => rule !== 'mutant-ignored');
    const ignored = findings.filter(({ rule }) => rule === 'mutant-ignored');

    expect(result.exitCode, result.text).toBe(1);
    expect(new Set(mutated.map(({ path: file }) => file))).toEqual(
      new Set(['src/demo/pricing.py']),
    );
    expect(new Set(ignored.map(({ path: file }) => file))).toEqual(new Set(PRODUCTION_FILES));
  });
  it('still reports the do_not_mutate of the project config as ignored code once a person accepts listing the project', () => {
    const result = gate(project, 'shrunk-listed', { environment: ACCEPTED });
    const findings = mutantFindings(result);

    expect(result.exitCode, result.text).toBe(1);
    expect(new Set(findings.map(({ rule }) => rule))).toEqual(new Set(['mutant-ignored']));
    expect(new Set(findings.map(({ path: file }) => file))).toEqual(new Set(PRODUCTION_FILES));
  });
  it('takes the other keys of the project config once a person accepts listing the project', () => {
    const result = gate(project, 'listed-key', { environment: ACCEPTED });
    const findings = mutantFindings(result);

    expect(result.exitCode, result.text).toBe(1);
    expect(new Set(findings.map(({ rule }) => rule))).toEqual(
      new Set(['mutant-survived', 'mutant-nocoverage']),
    );
    expect(new Set(findings.map(({ path: file }) => file))).toEqual(
      new Set(['src/demo/pricing.py']),
    );
  });
  it('passes new code whose mutants are all killed', () => {
    const result = gate(project, 'killed');

    expect(result.exitCode, result.text).toBe(0);
    expect(
      result
        .json('new-findings.json')
        .filter(({ tool, rule }) => tool === 'mutmut' && rule !== 'mutation-summary'),
    ).toEqual([]);
  });
  it('reuses the base mutants for a source-only change and still fails a new survivor', () => {
    const result = gate(project, 'weaker-source');

    expect(result.exitCode, result.text).toBe(1);
    expect(
      result
        .json('new-findings.json')
        .filter(({ classification }) => classification === 'enforceable')
        .map(({ tool, rule, symbol }) => `${tool} ${rule} ${symbol}`),
    ).toEqual(['mutmut mutant-survived value']);
  });
});
describe.skipIf(!pythonE2eEnabled)(
  'Python preset on a project whose mutmut configuration nitpicker writes, with xdist and an excluded Python 2 file',
  () => {
    let callers;
    afterAll(removeRepositories);
    beforeAll(() => {
      callers = repository();
      write(callers, {
        'nitpicker.config.json': '{ "preset": "python", "exclude": ["calc/legacy.py"] }\n',
        '.gitignore': '.venv/\n__pycache__/\n',
        'pyproject.toml':
          '[project]\nname = "calc"\nversion = "0.1.0"\n\n[tool.pytest.ini_options]\naddopts = "-n 2"\n',
        'calc/__init__.py': '',
        'calc/helper.py': 'def f(x):\n    return x + 2\n',
        'calc/core.py':
          'from calc.helper import f\n\n\ndef g(x):\n    return 1 if f(x) > 3 else 0\n',
        'calc/legacy.py': 'print "old"\n',
        'tests/test_core.py':
          'from calc.core import g\n\n\ndef test_low():\n    assert g(1) == 0\n\n\ndef test_high():\n    assert g(2) == 1\n',
      });
      initializeRepository(callers, 'base');
      installPackages(callers, ['coverage', 'mutmut', 'pytest', 'pytest-xdist']);
      commitBranch(callers, 'unrelated', { 'calc/extra.py': 'EXTRA = 1\n' });
      commitBranch(callers, 'callee', {
        'calc/helper.py': 'def f(x):\n    return x + 3 if x >= 2 else x + 1\n',
      });
    });
    it('runs mutmut despite xdist in the addopts and never mutates the excluded file', () => {
      const result = gate(callers, 'unrelated');

      expect(result.exitCode, result.text).toBe(0);
      expect(result.json('summary.json').overallStatus).toBe('completed');
    });
    it('does not reuse the results of an unchanged caller whose callee changed', () => {
      const result = gate(callers, 'callee');

      expect(result.exitCode, result.text).toBe(1);
      const survivors = result
        .json('new-findings.json')
        .filter(({ rule }) => rule === 'mutant-survived');
      expect(survivors.map(({ path: file, identity }) => `${file} ${identity}`).sort()).toEqual(
        [
          'calc/core.py g|>→>=#1',
          'calc/core.py g|3→4#1',
          'calc/helper.py f|+→-#1',
          'calc/helper.py f|1→2#1',
          'calc/helper.py f|3→4#1',
        ].sort(),
      );
    });
  },
);
