import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createToolContext, lint, RUFF_REPORT } from '../adapters/python-tools.mjs';
import { ruffFindings } from '../adapters/python-reports.mjs';
import { applyPythonExceptions } from '../adapters/configuration/python-exceptions.mjs';
import {
  RULES_REPORT,
  checkRules,
  readAllowances,
  readTestFiles,
} from '../adapters/analysis/python-ast-rules.mjs';
import { ingestRulesReport } from '../ingest/rules-report.mjs';
import { exceptionRoute } from '../../../shared/exceptions/rule-names.mjs';
import { applyRuleHints } from '../rules/rule-hints.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const fixtures = path.resolve(import.meta.dirname, '../rules/fixtures/ruff-pitfalls');
const PITFALL = /^(?:ASYNC|DTZ|LOG|PLE|PLW|T10)\d+$/u;
const OWNERS = [
  'clock-now',
  'real-clock-in-test',
  'sleep-in-test',
  'tautological-assert',
  'process-env-access',
  'LOG015',
  'ASYNC230',
  'ASYNC240',
];
const EXCEPTIONS = OWNERS.map((rule) => ({ rule, paths: ['excepted/**'], reason: 'Reviewed' }));
const BANNED = {
  'async_calls.py': [
    '9 ASYNC109',
    '10 ASYNC100',
    '15 ASYNC100',
    '16 ASYNC210',
    '21 ASYNC212',
    '25 ASYNC110',
    '30 ASYNC251',
    '34 ASYNC221',
    '35 ASYNC220',
    '36 ASYNC222',
    '40 ASYNC230',
    '42 ASYNC240',
    '43 ASYNC250',
  ],
  'cycle/loop.py': ['1 PLW0406'],
  'datetimes.py': [
    '6 DTZ001',
    '7 DTZ002',
    '8 DTZ003',
    '9 DTZ004',
    '10 DTZ005',
    '11 DTZ006',
    '12 DTZ007',
    '13 DTZ011',
    '14 DTZ012',
    '15 DTZ901',
  ],
  'logs.py': [
    '3 LOG001',
    '4 LOG002',
    '5 LOG009',
    '9 LOG004',
    '10 LOG014',
    '11 LOG015',
    '12 PLE1206',
    '16 LOG007',
  ],
  'pylint_errors.py': [
    '4 PLE0604',
    '11 PLE0237',
    '16 PLE0101',
    '19 PLE0241',
    '24 PLE0302',
    '28 PLE0303',
    '32 PLE0118',
    '33 PLW0602',
    '38 PLE0643',
    '42 PLE0704',
    '46 PLE1700',
    '50 PLE1519',
    '55 PLE2515',
  ],
  'pylint_warnings.py': [
    '3 T100',
    '8 PLW0604',
    '12 PLW0108',
    '19 PLW0120',
    '24 PLW0127',
    '25 PLW0128',
    '30 PLW0131',
    '35 PLW0133',
    '36 PLW0177',
    '41 PLW0211',
    '45 PLW0642',
    '52 PLW0245',
    '56 PLW0129',
    '60 PLW1501',
    '65 PLW1509',
    '66 PLW1510',
    '67 T100',
    '71 PLW2101',
    '77 PLW2901',
    '82 PLW3301',
  ],
  'settings.py': ['7 PLW1507', '8 PLW1508', '9 PLE1507'],
  'special/dunders.py': [
    '3 PLE0100',
    '6 PLE0304',
    '9 PLE0305',
    '12 PLE0307',
    '15 PLE0308',
    '18 PLE0309',
  ],
  'special/escapes.py': ['1 PLE2502', '2 PLE2510', '3 PLE2512', '4 PLE2513', '5 PLE2514'],
  'special/scopes.py': [
    '6 PLE0605',
    '10 PLE0117',
    '11 PLE0115',
    '15 PLE0117',
    '19 PLW0603',
    '24 PLE1142',
    '28 PLE1205',
    '31 PLE1520',
  ],
  'tests/test_pitfalls.py': ['5 DTZ001', '6 PLW0133'],
  'trio_calls.py': ['5 ASYNC105', '6 ASYNC115', '7 ASYNC116'],
};
const OVERLAP = {
  'adapters/clock.py': ['5 DTZ005'],
  'async_files.py': ['5 ASYNC230', '7 ASYNC240'],
  'domain/clock.py': ['6 clock-now', '7 clock-now', '8 clock-now', '9 clock-now'],
  'logs.py': ['3 LOG015'],
  'service.py': ['7 process-env-access', '8 process-env-access', '9 process-env-access'],
  'tests/test_asserts.py': ['2 tautological-assert'],
  'tests/test_faked.py': ['10 DTZ005', '17 ASYNC110'],
  'tests/test_waits.py': [
    '7 sleep-in-test',
    '9 sleep-in-test',
    '10 real-clock-in-test',
    '11 real-clock-in-test',
  ],
};
const EXCEPTED = {
  'adapters/clock.py': ['5 DTZ005'],
  'async_files.py': ['5 PTH123', '7 PTH110'],
  'domain/clock.py': ['6 DTZ005', '7 DTZ003', '8 DTZ002', '9 DTZ011'],
  'logs.py': ['3 G010'],
  'service.py': ['7 PLW1507', '8 PLW1508', '9 PLE1507'],
  'tests/test_asserts.py': ['2 PLW0129'],
  'tests/test_faked.py': ['10 DTZ005', '17 ASYNC110'],
  'tests/test_waits.py': ['8 ASYNC110', '10 DTZ011', '11 DTZ003'],
};

function pythonFiles(folder) {
  return readdirSync(folder, { recursive: true }).filter((file) => file.endsWith('.py'));
}

function writeProject(root) {
  writeFileSync(
    path.join(root, 'pyproject.toml'),
    '[project]\nname = "pitfalls"\nrequires-python = ">=3.12"\n',
  );
  for (const [from, to] of [
    ['banned', 'banned'],
    ['banned', 'shifted'],
    ['allowed', 'allowed'],
    ['overlap', 'overlap'],
    ['overlap', 'excepted'],
  ]) {
    cpSync(path.join(fixtures, from), path.join(root, to), { recursive: true });
  }
  for (const file of pythonFiles(path.join(root, 'shifted'))) {
    const target = path.join(root, 'shifted', file);
    writeFileSync(target, `\n\n${readFileSync(target, 'utf8')}`);
  }
}

function readFindings(projectRoot, reportRoot) {
  const context = createToolContext({
    projectRoot,
    liveRoot: projectRoot,
    settings: { environment: 'path', sourceRoots: ['.'] },
    reportRoot,
  });
  checkRules(context);
  lint(context);
  const report = JSON.parse(readFileSync(path.join(reportRoot, RUFF_REPORT), 'utf8'));
  const testFiles = readTestFiles(reportRoot);
  const ruff = ruffFindings(report, {
    roots: [projectRoot],
    projectRoot,
    testFiles,
    exceptions: EXCEPTIONS,
    ...readAllowances(reportRoot),
  });
  const rules = ingestRulesReport(readFileSync(path.join(reportRoot, RULES_REPORT), 'utf8'));
  return {
    findings: applyPythonExceptions(applyRuleHints([...ruff, ...rules]), EXCEPTIONS),
    testFiles,
  };
}

const inside = (folder) => (found) => found.path.startsWith(`${folder}/`);
const relative = (folder, file) => file.slice(folder.length + 1);

function sitesBy(findings, folder) {
  const grouped = {};
  for (const found of findings.filter(inside(folder))) {
    const file = relative(folder, found.path);
    grouped[file] = [...(grouped[file] ?? []), `${String(found.location?.line)} ${found.rule}`];
  }
  return Object.fromEntries(
    Object.entries(grouped).map(([file, sites]) => [
      file,
      sites.toSorted(
        (a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10) || a.localeCompare(b),
      ),
    ]),
  );
}

describe.skipIf(!enabled)('the shipped Ruff pitfall selection', () => {
  let root;
  let reports;
  let findings;
  let testFiles;

  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), 'nitpicker-ruff-pitfalls-'));
    reports = mkdtempSync(path.join(tmpdir(), 'nitpicker-ruff-pitfalls-report-'));
    writeProject(root);
    ({ findings, testFiles } = readFindings(root, reports));
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(reports, { recursive: true, force: true });
  });

  it('reports every banned form once per site, through real linting and SARIF ingestion', () => {
    expect(sitesBy(findings, 'banned')).toEqual(BANNED);
  });

  it('accepts every allowed counterpart, in source and in tests', () => {
    expect(findings.filter(inside('allowed'))).toEqual([]);
  });

  it('applies the families to test files too', () => {
    expect(testFiles.filter((file) => file.startsWith('banned/'))).toEqual([
      'banned/tests/test_pitfalls.py',
    ]);
    expect(sitesBy(findings, 'banned')['tests/test_pitfalls.py']).toEqual([
      '5 DTZ001',
      '6 PLW0133',
    ]);
  });

  it('keeps finding identities stable across line movement and names the exception route', () => {
    const identities = (folder) =>
      findings
        .filter((found) => inside(folder)(found) && PITFALL.test(found.rule))
        .map(({ rule, identity, path: file, message }) => ({
          rule,
          identity,
          file: relative(folder, file),
          exception: message.endsWith(
            exceptionRoute({ rule, path: file, key: 'python.exceptions' }),
          ),
        }));

    expect(identities('shifted')).toEqual(identities('banned'));
    expect(identities('banned').every(({ exception }) => exception)).toBe(true);
  });

  it('leaves one finding where a nitpicker rule or another ruff rule owns the site', () => {
    expect(sitesBy(findings, 'overlap')).toEqual(OVERLAP);
  });

  it('keeps the ruff finding when an exception lifts the rule that owns the site', () => {
    expect(sitesBy(findings, 'excepted')).toEqual(EXCEPTED);
  });
});
