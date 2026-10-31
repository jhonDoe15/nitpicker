import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { hash } from '../../../../../shared/rules/finding-helpers.mjs';
import { withCanonicalRules } from '../../../../../shared/exceptions/validation.mjs';
import { validateConfig } from '../../../../../core/configuration/validate.mjs';
import { applyPythonExceptions } from '../../configuration/python-exceptions.mjs';
import { applyRuleHints } from '../../../rules/rule-hints.mjs';
import { readTestRuntimeFindings, scanTestStrings } from './python-test-runtime.mjs';
import {
  absolute,
  analyze,
  categories,
  fixture,
  messageOf,
  other,
  OPTIONS,
  plain,
  scanned,
  SERVICE,
  typeOnly,
} from './test-support/runtime-data.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function temporaryRoot() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-python-runtime-')));
  roots.push(root);
  return root;
}

describe('tests that run no production code', () => {
  it('reports a test that imports nothing from production', () => {
    const report = analyze({
      others: [other('tests/test_a.py')],
      imports: { 'tests/test_a.py': [plain('os'), absolute('pathlib', 'Path')] },
    });

    expect(report.findings.map(({ test, category }) => [test, category])).toEqual([
      ['tests/test_a.py', 'no-production-runtime'],
    ]);
    expect(report.summary).toEqual({
      discoveredTests: 1,
      analyzedTests: 1,
      excludedTests: 0,
      findings: 1,
      categories: { 'no-production-runtime': 1 },
    });
  });

  it('reports a test whose only link is an import under TYPE_CHECKING', () => {
    const report = analyze({
      others: [other('tests/test_a.py')],
      imports: { 'tests/test_a.py': [typeOnly(absolute('app.service', 'Service'))] },
    });

    expect(report.findings).toEqual([
      {
        test: 'tests/test_a.py',
        category: 'type-only-production-dependency',
        directProductionModules: [],
        runtimeProductionModules: [],
        typeOnlyProductionModules: ['src/app/service.py'],
        subprocessBridges: [],
      },
    ]);
  });

  it('accepts a test that also imports production at runtime', () => {
    const report = analyze({
      others: [other('tests/test_a.py')],
      imports: {
        'tests/test_a.py': [
          typeOnly(absolute('app.service', 'Service')),
          absolute('app.client', 'Client'),
        ],
      },
    });

    expect(report.findings).toEqual([]);
  });

  it('does not judge conftest.py, helpers, or files pytest does not collect', () => {
    const report = analyze({
      others: [
        other('tests/conftest.py'),
        other('tests/helpers.py'),
        other('tests/checks.py'),
        other('scripts/build.py', 'other'),
        other('tests/test_a.py'),
      ],
      imports: {
        'tests/conftest.py': [],
        'tests/helpers.py': [],
        'tests/checks.py': [],
        'scripts/build.py': [],
        'tests/test_a.py': [],
      },
    });

    expect(report.findings.map(({ test }) => test)).toEqual(['tests/test_a.py']);
    expect(report.summary.discoveredTests).toBe(1);
  });

  it('judges the files the project configures pytest to collect', () => {
    const report = analyze({
      others: [other('tests/test_a.py'), other('tests/check_a.py')],
      imports: { 'tests/test_a.py': [], 'tests/check_a.py': [] },
      options: { ...OPTIONS, pythonFiles: ['check_*.py'] },
    });

    expect(report.tests.map(({ test }) => test)).toEqual(['tests/check_a.py']);
  });

  it('judges unittest and Django files named test*.py', () => {
    const others = [other('tests/testing.py'), other('tests/helpers.py')];
    const imports = { 'tests/testing.py': [], 'tests/helpers.py': [] };

    expect(analyze({ others, imports, runner: 'pytest' }).tests).toEqual([]);
    expect(analyze({ others, imports, runner: 'unittest' }).tests.map(({ test }) => test)).toEqual([
      'tests/testing.py',
    ]);
  });

  it('leaves out end-to-end tests and files that could not be parsed', () => {
    const report = analyze({
      others: [
        other('tests/e2e/test_cli.py'),
        other('tests/contract/test_api.py'),
        other('tests/test_broken.py'),
        other('tests/test_a.py'),
      ],
      imports: {
        'tests/e2e/test_cli.py': [],
        'tests/contract/test_api.py': [],
        'tests/test_a.py': [],
      },
    });

    expect(report.tests.map(({ test }) => test)).toEqual(['tests/test_a.py']);
    expect(report.exclusions).toEqual([
      'tests/contract/test_api.py',
      'tests/e2e/test_cli.py',
      'tests/test_broken.py',
    ]);
  });

  it.each([
    'tests/E2E/test_a.py',
    'tests/end_to_end/test_a.py',
    'tests/EndToEnd/test_a.py',
    'tests/contracts/test_a.py',
    'tests/e2eTest/test_a.py',
    'tests/endToEndTest/test_a.py',
    'tests/contractTest/test_a.py',
  ])('leaves out %s as an end-to-end or contract test', (file) => {
    const report = analyze({ others: [other(file)], imports: { [file]: [] } });

    expect(report.tests).toEqual([]);
    expect(report.exclusions).toEqual([file]);
  });

  it('keeps a test whose file name, not its folder, mentions e2e', () => {
    const report = analyze({
      others: [other('tests/test_e2e_flags.py')],
      imports: { 'tests/test_e2e_flags.py': [] },
    });

    expect(report.findings).toHaveLength(1);
  });

  it('never judges an __init__.py, even when pytest collects every .py file', () => {
    const report = analyze({
      others: [other('tests/__init__.py', 'other'), other('tests/test_a.py')],
      imports: { 'tests/__init__.py': [], 'tests/test_a.py': [] },
      options: { ...OPTIONS, pythonFiles: ['*.py'] },
    });

    expect(report.tests.map(({ test }) => test)).toEqual(['tests/test_a.py']);
  });
});

describe('the Django framework bridge', () => {
  const django = { ...OPTIONS, django: true };

  it('counts a test that imports django.test, directly or through a helper', () => {
    const report = analyze({
      others: [
        other('shop/tests/test_view.py'),
        other('shop/tests/test_api.py'),
        other('shop/tests/test_helper.py'),
        other('shop/tests/base.py'),
      ],
      imports: {
        'shop/tests/test_view.py': [absolute('django.test', 'TestCase')],
        'shop/tests/test_api.py': [absolute('shop.tests.base', 'Base')],
        'shop/tests/test_helper.py': [plain('os')],
        'shop/tests/base.py': [absolute('rest_framework', 'test')],
      },
      options: django,
    });

    expect(categories(report)).toEqual({
      'shop/tests/test_view.py': 'framework-production-runtime',
      'shop/tests/test_api.py': 'framework-production-runtime',
      'shop/tests/test_helper.py': 'no-production-runtime',
    });
    expect(report.tests.map(({ subprocessBridges }) => subprocessBridges)).toEqual([
      ['rest_framework.test'],
      [],
      ['django.test'],
    ]);
  });

  it('counts django.test imported by a conftest.py only when the test uses a fixture there', () => {
    const others = [other('conftest.py'), other('tests/test_a.py')];
    const imports = { 'conftest.py': [plain('rest_framework.test')], 'tests/test_a.py': [] };
    const conftest = scanned({ fixtures: [fixture('api')] });
    const analyzed = (requests) =>
      categories(
        analyze({
          others,
          imports,
          literals: { 'conftest.py': conftest, 'tests/test_a.py': scanned({ requests }) },
          options: django,
        }),
      );

    expect(analyzed(['api'])).toEqual({ 'tests/test_a.py': 'framework-production-runtime' });
    expect(analyzed([])).toEqual({ 'tests/test_a.py': 'no-production-runtime' });
  });

  it('gives a type-only import of django.test no bridge', () => {
    const report = analyze({
      others: [other('tests/test_a.py')],
      imports: { 'tests/test_a.py': [typeOnly(absolute('django.test', 'Client'))] },
      options: django,
    });

    expect(categories(report)).toEqual({ 'tests/test_a.py': 'no-production-runtime' });
  });

  it('gives no bridge outside a Django project', () => {
    const report = analyze({
      others: [other('tests/test_a.py')],
      imports: { 'tests/test_a.py': [absolute('django.test', 'TestCase')] },
    });

    expect(categories(report)).toEqual({ 'tests/test_a.py': 'no-production-runtime' });
  });
});

function reportRootWith({ imports, literals }) {
  const projectRoot = temporaryRoot();
  const reportRoot = temporaryRoot();
  mkdirSync(path.join(projectRoot, 'tests'));
  writeFileSync(path.join(projectRoot, 'tests/test_a.py'), 'def test_a():\n    pass\n');
  writeFileSync(path.join(reportRoot, 'imports.json'), JSON.stringify(imports));
  if (literals !== undefined) {
    writeFileSync(path.join(reportRoot, 'string-literals.json'), JSON.stringify(literals));
  }
  return { projectRoot, reportRoot };
}

const REPORT_IMPORTS = {
  modules: [SERVICE],
  others: [other('tests/test_a.py')],
  imports: { 'tests/test_a.py': [] },
};

describe('the findings', () => {
  it('has the shape of every preset and a digest of the test text', () => {
    const { projectRoot, reportRoot } = reportRootWith({ imports: REPORT_IMPORTS });

    const findings = readTestRuntimeFindings({ reportRoot, projectRoot, runner: 'pytest' });

    const enforceable = findings.filter(({ classification }) => classification === 'enforceable');
    expect(enforceable).toEqual([
      {
        tool: 'test-runtime',
        rule: 'no-production-runtime',
        path: 'tests/test_a.py',
        identity: `test:tests/test_a.py:source:${hash('def test_a():\n    pass\n')}`,
        message: messageOf('no-production-runtime'),
        classification: 'enforceable',
      },
    ]);
    expect(findings.filter(({ rule }) => rule === 'category-count')).toHaveLength(1);
  });

  it('changes the identity when the test text changes', () => {
    const first = reportRootWith({ imports: REPORT_IMPORTS });
    const second = reportRootWith({ imports: REPORT_IMPORTS });
    writeFileSync(
      path.join(second.projectRoot, 'tests/test_a.py'),
      'def test_a():\n    assert 1\n',
    );
    const identity = ({ reportRoot, projectRoot }) =>
      readTestRuntimeFindings({ reportRoot, projectRoot, runner: 'pytest' }).find(
        ({ classification }) => classification === 'enforceable',
      ).identity;

    expect(identity(first)).not.toBe(identity(second));
  });

  it('reports nothing for a project without tests', () => {
    const { projectRoot, reportRoot } = reportRootWith({
      imports: { modules: [SERVICE], others: [], imports: {} },
    });

    expect(readTestRuntimeFindings({ reportRoot, projectRoot, runner: 'pytest' })).toEqual([]);
  });

  it('reads the string literals the scan wrote', () => {
    const { projectRoot, reportRoot } = reportRootWith({
      imports: REPORT_IMPORTS,
      literals: { 'tests/test_a.py': { strings: ['app.service'], plugins: [] } },
    });

    const findings = readTestRuntimeFindings({ reportRoot, projectRoot, runner: 'pytest' });

    expect(findings.filter(({ classification }) => classification === 'enforceable')).toEqual([]);
  });
});

function finding() {
  const { projectRoot, reportRoot } = reportRootWith({ imports: REPORT_IMPORTS });
  const [found] = readTestRuntimeFindings({ reportRoot, projectRoot, runner: 'pytest' }).filter(
    ({ classification }) => classification === 'enforceable',
  );
  return found;
}

function lifted(entry) {
  const config = withCanonicalRules({
    preset: 'python',
    python: { exceptions: [{ ...entry, reason: 'The suite checks the schema only.' }] },
  });
  validateConfig(config);
  return applyPythonExceptions([finding()], config.python.exceptions);
}

describe('exceptions', () => {
  it('lifts the finding for the paths of an entry, bare or as printed', () => {
    expect(lifted({ rule: 'no-production-runtime', paths: ['tests/**'] })).toEqual([]);
    expect(lifted({ rule: 'test-runtime/no-production-runtime', paths: ['tests/**'] })).toEqual([]);
  });

  it('keeps the finding for other paths', () => {
    expect(lifted({ rule: 'no-production-runtime', paths: ['other/**'] })).toHaveLength(1);
  });

  it('prints the entry that lifts a finding', () => {
    const [hinted] = applyRuleHints([finding()]);

    expect(hinted.message).toBe(
      `${messageOf('no-production-runtime')}. If this is intended, add {"rule":"no-production-runtime","paths":["tests/test_a.py"],"reason":"..."} to "python.exceptions" in nitpicker.config.json.`,
    );
  });
});

describe('scanning the string literals', () => {
  function scanWith(imports) {
    const { projectRoot, reportRoot } = reportRootWith({ imports });
    const calls = [];
    const run = (context, command, options) => {
      calls.push({
        command,
        options,
        request: JSON.parse(readFileSync(command.at(-1), 'utf8')),
      });
      return { stdout: '{"tests/test_a.py":{"strings":["app.service"],"plugins":[]}}' };
    };
    scanTestStrings({ projectRoot, reportRoot }, run);
    return { calls, reportRoot, projectRoot };
  }

  it('hands every file outside production to the script and keeps its answer', () => {
    const { calls, reportRoot, projectRoot } = scanWith(REPORT_IMPORTS);

    expect(calls).toHaveLength(1);
    expect(calls[0].command.slice(0, 2)).toEqual(['python', '-I']);
    expect(path.basename(calls[0].command[2])).toBe('string-scan.py');
    expect(calls[0].options).toEqual({ rule: 'test-runtime-failed' });
    expect(calls[0].request).toEqual({
      root: projectRoot,
      files: ['tests/test_a.py'],
      modules: { 'app.service': 'src/app/service.py' },
    });
    expect(JSON.parse(readFileSync(path.join(reportRoot, 'string-literals.json'), 'utf8'))).toEqual(
      { 'tests/test_a.py': { strings: ['app.service'], plugins: [] } },
    );
  });

  it('does not start the interpreter when there is nothing to scan', () => {
    const { projectRoot, reportRoot } = reportRootWith({
      imports: { modules: [SERVICE], others: [], imports: {} },
    });

    scanTestStrings({ projectRoot, reportRoot }, () => {
      throw new Error('should not run');
    });

    expect(JSON.parse(readFileSync(path.join(reportRoot, 'string-literals.json'), 'utf8'))).toEqual(
      {},
    );
  });
});
