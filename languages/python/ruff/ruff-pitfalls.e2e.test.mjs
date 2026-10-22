import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createToolContext, lint, RUFF_REPORT } from '../adapters/python-tools.mjs';
import { ruffFindings } from '../adapters/python-reports.mjs';
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
const BANNED_FILES = [
  'async_calls.py',
  'trio_calls.py',
  'datetimes.py',
  'logs.py',
  'pylint_errors.py',
  'pylint_warnings.py',
  'cycle/loop.py',
  'tests/test_pitfalls.py',
];
const EXPECTED = {
  'async_calls.py': [
    'ASYNC100',
    'ASYNC100',
    'ASYNC109',
    'ASYNC110',
    'ASYNC210',
    'ASYNC212',
    'ASYNC220',
    'ASYNC221',
    'ASYNC222',
    'ASYNC230',
    'ASYNC240',
    'ASYNC250',
    'ASYNC251',
  ],
  'trio_calls.py': ['ASYNC105', 'ASYNC115', 'ASYNC116'],
  'datetimes.py': [
    'DTZ001',
    'DTZ002',
    'DTZ003',
    'DTZ004',
    'DTZ005',
    'DTZ006',
    'DTZ007',
    'DTZ011',
    'DTZ012',
    'DTZ901',
  ],
  'logs.py': ['LOG001', 'LOG002', 'LOG004', 'LOG007', 'LOG009', 'LOG014', 'LOG015', 'PLE1206'],
  'pylint_errors.py': [
    'PLE0101',
    'PLE0118',
    'PLE0237',
    'PLE0241',
    'PLE0302',
    'PLE0303',
    'PLE0604',
    'PLE0643',
    'PLE0704',
    'PLE1132',
    'PLE1300',
    'PLE1310',
    'PLE1507',
    'PLE1519',
    'PLE1700',
    'PLE2515',
    'PLW0602',
  ],
  'pylint_warnings.py': [
    'PLW0108',
    'PLW0120',
    'PLW0127',
    'PLW0128',
    'PLW0131',
    'PLW0133',
    'PLW0177',
    'PLW0211',
    'PLW0245',
    'PLW0604',
    'PLW0642',
    'PLW0711',
    'PLW1501',
    'PLW1507',
    'PLW1508',
    'PLW1509',
    'PLW1510',
    'PLW2101',
    'PLW2901',
    'PLW3301',
    'T100',
    'T100',
  ],
  'cycle/loop.py': ['PLW0406'],
  'tests/test_pitfalls.py': ['DTZ001', 'PLW0129'],
};
const OVERLAPS = {
  'overlap/domain/clock.py':
    'from datetime import datetime\n\n\ndef stamp():\n    return datetime.now()\n',
  'overlap/adapters/clock.py':
    'from datetime import datetime\n\n\ndef stamp():\n    return datetime.now()\n',
  'overlap/tests/test_waits.py':
    'import asyncio\nimport time\nfrom datetime import date\n\n\nasync def test_waits(flag):\n    time.sleep(1)\n    while not flag.ready:\n        await asyncio.sleep(1)\n    assert date.today()\n',
  'overlap/logs.py': 'import logging\n\nlogging.warn("Root logger")\n',
};

function copyShifted(from, to) {
  cpSync(from, to, { recursive: true });
  for (const file of BANNED_FILES) {
    const target = path.join(to, file);
    writeFileSync(target, `\n\n${readFileSync(target, 'utf8')}`);
  }
}

function writeProject(root) {
  writeFileSync(
    path.join(root, 'pyproject.toml'),
    '[project]\nname = "pitfalls"\nrequires-python = ">=3.12"\n',
  );
  cpSync(path.join(fixtures, 'banned'), path.join(root, 'banned'), { recursive: true });
  cpSync(path.join(fixtures, 'allowed'), path.join(root, 'allowed'), { recursive: true });
  copyShifted(path.join(fixtures, 'banned'), path.join(root, 'shifted'));
  for (const [file, text] of Object.entries(OVERLAPS)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
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
    ...readAllowances(reportRoot),
  });
  const rules = ingestRulesReport(readFileSync(path.join(reportRoot, RULES_REPORT), 'utf8'));
  return { findings: applyRuleHints([...ruff, ...rules]), testFiles };
}

const inside = (folder) => (found) => found.path.startsWith(`${folder}/`);
const relative = (folder, file) => file.slice(folder.length + 1);

function pitfallsBy(findings, folder) {
  const grouped = {};
  for (const found of findings.filter(inside(folder))) {
    if (PITFALL.test(found.rule)) {
      const file = relative(folder, found.path);
      grouped[file] = [...(grouped[file] ?? []), found.rule].toSorted();
    }
  }
  return grouped;
}

function rulesAt(findings, file) {
  return findings
    .filter((found) => found.path === file)
    .map(({ rule, location }) => `${String(location?.line)} ${rule}`)
    .toSorted();
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

  it('reports every family through real linting and SARIF ingestion', () => {
    expect(pitfallsBy(findings, 'banned')).toEqual(EXPECTED);
  });

  it('accepts every allowed counterpart, in source and in tests', () => {
    expect(findings.filter(inside('allowed'))).toEqual([]);
  });

  it('applies the families to test files too', () => {
    expect(testFiles).toContain('banned/tests/test_pitfalls.py');
    expect(pitfallsBy(findings, 'banned')['tests/test_pitfalls.py']).toEqual(['DTZ001', 'PLW0129']);
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

  it.each([
    ['overlap/domain/clock.py', ['5 clock-now']],
    ['overlap/adapters/clock.py', ['5 DTZ005']],
    [
      'overlap/tests/test_waits.py',
      ['10 real-clock-in-test', '7 sleep-in-test', '9 sleep-in-test'],
    ],
    ['overlap/logs.py', ['3 LOG015']],
  ])('reports one finding per site in %s where a clock or logger rule overlaps', (file, rules) => {
    expect(rulesAt(findings, file)).toEqual(rules);
  });
});
