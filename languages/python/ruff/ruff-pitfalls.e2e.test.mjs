import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createToolContext, lint, RUFF_REPORT } from '../adapters/python-tools.mjs';
import { ruffFindings } from '../adapters/python-reports.mjs';
import { exceptionRoute } from '../../../shared/exceptions/rule-names.mjs';
import { applyRuleHints } from '../rules/rule-hints.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const fixtures = path.resolve(import.meta.dirname, '../rules/fixtures/ruff-pitfalls');
const PITFALL = /^(?:ASYNC|DTZ|LOG|PLE|PLW|T10)\d+$/u;
const EXPECTED = [
  'ASYNC100',
  'ASYNC210',
  'DTZ005',
  'LOG001',
  'LOG004',
  'PLE1206',
  'PLW0133',
  'PLW1510',
  'T100',
  'T100',
];

function readFindings(projectRoot, reportRoot) {
  const context = createToolContext({
    projectRoot,
    liveRoot: projectRoot,
    settings: { environment: 'path', sourceRoots: ['.'] },
    reportRoot,
  });
  lint(context);
  const report = JSON.parse(readFileSync(path.join(reportRoot, RUFF_REPORT), 'utf8'));
  return applyRuleHints(ruffFindings(report, { roots: [projectRoot], projectRoot }));
}

describe.skipIf(!enabled)('the shipped Ruff pitfall selection', () => {
  let root;
  let findings;

  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), 'nitpicker-ruff-pitfalls-'));
    const banned = readFileSync(path.join(fixtures, 'banned/pitfalls.py'), 'utf8');
    writeFileSync(path.join(root, 'banned.py'), banned);
    writeFileSync(path.join(root, 'shifted.py'), `\n\n${banned}`);
    writeFileSync(
      path.join(root, 'allowed.py'),
      readFileSync(path.join(fixtures, 'allowed/pitfalls.py'), 'utf8'),
    );
    findings = readFindings(root, root);
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('reports the new families through real linting and SARIF ingestion, including aliases', () => {
    expect(
      findings
        .filter(({ path: file, rule }) => file === 'banned.py' && PITFALL.test(rule))
        .map(({ rule }) => rule)
        .toSorted(),
    ).toEqual(EXPECTED);
  });

  it('accepts async clients, aware timestamps, named loggers and explicit process checks', () => {
    expect(findings.filter(({ path: file }) => file === 'allowed.py')).toEqual([]);
  });

  it('keeps finding identities stable across line movement and names the exception route', () => {
    const identities = (file) =>
      findings
        .filter(({ path: found, rule }) => found === file && PITFALL.test(rule))
        .map(({ rule, identity, message }) => ({
          rule,
          identity,
          exception: message.endsWith(
            exceptionRoute({ rule, path: file, key: 'python.exceptions' }),
          ),
        }));

    expect(identities('shifted.py')).toEqual(identities('banned.py'));
    expect(identities('banned.py').map(({ exception }) => exception)).toEqual(
      EXPECTED.map(() => true),
    );
  });
});
