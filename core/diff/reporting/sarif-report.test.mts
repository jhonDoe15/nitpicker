import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  renderBaselineSarifReport,
  renderSarifReport,
  renderSnapshotSarifReport,
} from './sarif.mts';
import { expectValidSarif } from './test-support/format-checks/report-assertions.mts';
import { sarifSchemaErrors } from './test-support/format-checks/sarif-schema.mts';
import { finding, report } from './test-support/report-builders.mts';
import { docsUrl as untypedDocsUrl } from '../../../shared/messages/docs-url.mjs';
import { referenceLinks as untypedReferenceLinks } from '../../../shared/reference/store.mjs';
import { fieldAt, listOf } from '../../../scripts/json/fields.mts';
import type { Finding, ReferenceLinks } from '../../../shared/values/findings.mts';
import { parseJson } from '../../../shared/values/readers.mts';

const docsUrl: (relativePath: string, anchor: string) => string | undefined = untypedDocsUrl;
const referenceLinks: () => ReferenceLinks = untypedReferenceLinks;

const projectPath = 'packages/my app';

function held(overrides: Partial<Finding> = {}) {
  return finding({
    rule: 'file-size',
    identity: 'size',
    ratchet: { key: 'size', value: 7 },
    heldAtBase: 7,
    ...overrides,
  });
}

function comparison() {
  return {
    ...report({
      newFindings: [finding()],
      unchangedFindings: [held(), finding({ rule: 'untouched', identity: 'u' })],
    }),
    resolvedFindings: [finding({ rule: 'fixed', identity: 'f' })],
  };
}

function states(log: unknown): unknown[][] {
  return listOf(fieldAt(log, 'runs', 0, 'results')).map((result) => [
    fieldAt(result, 'ruleId'),
    fieldAt(result, 'baselineState'),
  ]);
}

describe('renderSarifReport', () => {
  it('emits a structurally valid SARIF 2.1.0 log with fingerprints', () => {
    const log = parseJson(
      renderSarifReport(
        report({
          newFindings: [
            finding(),
            { ...finding({ rule: 'no-var', identity: 'b:2' }), location: undefined },
            finding({
              tool: 'complexity',
              rule: 'cyclomatic',
              identity: 'fn',
              classification: 'descriptive',
              metric: { name: 'cyclomatic', value: 9 },
            }),
          ],
          toolErrors: [{ tool: 'depcruise', snapshot: 'head', message: 'boom' }],
        }),
        { projectPath: '' },
      ),
    );

    expectValidSarif(log);
    const run = fieldAt(log, 'runs', 0);
    expect(fieldAt(run, 'columnKind')).toBe('utf16CodeUnits');
    expect(fieldAt(run, 'originalUriBaseIds')).toBeUndefined();
    expect(
      listOf(fieldAt(run, 'results')).map((result) => [
        fieldAt(result, 'ruleId'),
        fieldAt(result, 'level'),
      ]),
    ).toEqual([
      ['eslint/no-console', 'error'],
      ['eslint/no-var', 'error'],
      ['complexity/cyclomatic', 'note'],
    ]);
    expect(fieldAt(run, 'results', 0, 'locations', 0, 'physicalLocation')).toEqual({
      artifactLocation: { uri: 'src/a.js', uriBaseId: '%SRCROOT%' },
      region: { startLine: 12, startColumn: 3 },
    });
    expect(
      fieldAt(run, 'results', 1, 'locations', 0, 'physicalLocation', 'region'),
    ).toBeUndefined();
    expect(fieldAt(run, 'invocations', 0)).toEqual({
      executionSuccessful: false,
      toolExecutionNotifications: [{ level: 'error', message: { text: 'depcruise (head): boom' } }],
    });
  });
  it('keeps fingerprints stable across line moves and distinct across findings', () => {
    const fingerprint = (value: Finding): unknown =>
      fieldAt(
        parseJson(renderSarifReport(report({ newFindings: [value] }), { projectPath })),
        'runs',
        0,
        'results',
        0,
        'partialFingerprints',
        'nitpickerIdentity/v1',
      );

    const original = fingerprint(finding());
    expect(original).toMatch(/^[0-9a-f]{64}$/);
    expect(fingerprint(finding({ location: { line: 99 }, message: 'reworded' }))).toBe(original);
    expect(fingerprint(finding({ identity: 'other' }))).not.toBe(original);
    expect(fingerprint(finding({ path: 'src/b.js' }))).not.toBe(original);
  });
  it('keeps the fingerprint of a finding that quotes a relative specifier as its identity says', () => {
    const quoted = finding({
      tool: 'typescript-typecheck',
      rule: 'TS2307',
      path: 'src/orders/a.ts',
      identity: "message:Cannot find module '../lib/b' or its corresponding type declarations.",
      classification: 'enforceable',
    });
    const log = parseJson(renderSarifReport(report({ newFindings: [quoted] }), { projectPath }));
    const expectedKey = JSON.stringify([
      'typescript-typecheck',
      'TS2307',
      'src/orders/a.ts',
      quoted.symbol ?? '',
      "message:Cannot find module '../lib/b' or its corresponding type declarations.",
      'enforceable',
      '',
    ]);

    expect(
      fieldAt(log, 'runs', 0, 'results', 0, 'partialFingerprints', 'nitpickerIdentity/v1'),
    ).toBe(createHash('sha256').update(expectedKey).digest('hex'));
  });
  it('links each rule to its entry in the rule reference with a helpUri and a short description', () => {
    const log = parseJson(
      renderSarifReport(
        report({
          newFindings: [
            finding({ tool: 'structure', rule: 'function-lines-limit', identity: 'f' }),
            finding({ tool: 'pmd', rule: 'UnusedLocalVariable', identity: 'g' }),
            finding({
              tool: 'eslint-lint',
              rule: '@typescript-eslint/no-explicit-any',
              identity: 'h',
            }),
            finding({ tool: 'mypy', rule: 'attr-defined', identity: 'i' }),
          ],
        }),
      ),
    );

    expectValidSarif(log);
    expect(fieldAt(log, 'runs', 0, 'tool', 'driver', 'rules')).toEqual([
      {
        id: 'structure/function-lines-limit',
        name: 'function-lines-limit',
        shortDescription: { text: 'A function longer than the limit.' },
        helpUri: docsUrl('docs/rules/checks.md', 'structure-function-lines-limit'),
      },
      {
        id: 'pmd/UnusedLocalVariable',
        name: 'UnusedLocalVariable',
        shortDescription: {
          text: 'Detects when a local variable is declared and/or assigned, but not used.',
        },
        helpUri: docsUrl('docs/rules/java-pmd.md', 'pmd-unusedlocalvariable'),
      },
      {
        id: 'eslint-lint/@typescript-eslint/no-explicit-any',
        name: '@typescript-eslint/no-explicit-any',
        shortDescription: { text: 'Disallow the any type' },
        helpUri: docsUrl(
          'docs/rules/typescript-eslint.md',
          'eslint-typescript-eslint-no-explicit-any',
        ),
      },
      {
        id: 'mypy/attr-defined',
        name: 'attr-defined',
        shortDescription: { text: 'A diagnostic of mypy, named by its <error code>.' },
        helpUri: docsUrl('docs/rules/python-types.md', 'mypy-error-code'),
      },
    ]);
  });
  it('leaves out the helpUri when the package gives no link root', () => {
    const known = referenceLinks();
    const reference = { index: () => known.index(), root: () => undefined };
    const log = parseJson(
      renderSarifReport(
        report({
          newFindings: [finding({ tool: 'pmd', rule: 'UnusedLocalVariable', identity: 'g' })],
        }),
        { reference },
      ),
    );

    expectValidSarif(log);
    expect(fieldAt(log, 'runs', 0, 'tool', 'driver', 'rules')).toEqual([
      {
        id: 'pmd/UnusedLocalVariable',
        name: 'UnusedLocalVariable',
        shortDescription: {
          text: 'Detects when a local variable is declared and/or assigned, but not used.',
        },
      },
    ]);
  });
  it('lists a rule the reference does not know with an id and a name only', () => {
    const log = parseJson(
      renderSarifReport(
        report({ newFindings: [finding({ tool: 'custom', rule: 'text-file', identity: 'c' })] }),
      ),
    );

    expectValidSarif(log);
    expect(fieldAt(log, 'runs', 0, 'tool', 'driver', 'rules')).toEqual([
      { id: 'custom/text-file', name: 'text-file' },
    ]);
  });
  it('emits an empty result list for a clean report', () => {
    const log = parseJson(renderSarifReport(report(), { projectPath }));
    expectValidSarif(log);
    expect(fieldAt(log, 'runs', 0, 'results')).toEqual([]);
    expect(fieldAt(log, 'runs', 0, 'invocations', 0, 'executionSuccessful')).toBe(true);
  });
  it('writes only the new findings, so an upload never turns held findings into alerts', () => {
    const log = parseJson(renderSarifReport(comparison(), { projectPath }));

    expectValidSarif(log);
    expect(states(log)).toEqual([['eslint/no-console', 'new']]);
  });
  it('prefixes paths with the project folder so they are relative to the repository root', () => {
    const log = parseJson(
      renderSarifReport(report({ newFindings: [finding({ path: 'src/[id]/my page#1.ts' })] }), {
        projectPath: 'packages/my app/',
      }),
    );

    expectValidSarif(log);
    expect(
      fieldAt(log, 'runs', 0, 'results', 0, 'locations', 0, 'physicalLocation', 'artifactLocation'),
    ).toEqual({
      uri: 'packages/my%20app/src/%5Bid%5D/my%20page%231.ts',
      uriBaseId: '%SRCROOT%',
    });
  });
  it('keeps project-relative paths without a base id when the repository folder is unknown', () => {
    const log = parseJson(renderSarifReport(report({ newFindings: [finding()] })));

    expectValidSarif(log);
    expect(
      fieldAt(log, 'runs', 0, 'results', 0, 'locations', 0, 'physicalLocation', 'artifactLocation'),
    ).toEqual({
      uri: 'src/a.js',
    });
  });
  it('points a finding about the whole project at the project folder', () => {
    const locationIn = (options?: { readonly projectPath?: string }): unknown =>
      fieldAt(
        parseJson(renderSarifReport(report({ newFindings: [finding({ path: '' })] }), options)),
        'runs',
        0,
        'results',
        0,
        'locations',
        0,
        'physicalLocation',
        'artifactLocation',
      );

    expect([
      locationIn({ projectPath: 'packages/my app/' }),
      locationIn({ projectPath: '' }),
      locationIn(undefined),
    ]).toEqual([
      { uri: 'packages/my%20app', uriBaseId: '%SRCROOT%' },
      { uri: '.', uriBaseId: '%SRCROOT%' },
      { uri: '.' },
    ]);
  });
});

describe('renderBaselineSarifReport', () => {
  it('marks new findings new and held findings unchanged, and leaves out fixed ones', () => {
    const log = parseJson(renderBaselineSarifReport(comparison(), { projectPath }));

    expectValidSarif(log);
    expect(states(log)).toEqual([
      ['eslint/no-console', 'new'],
      ['eslint/file-size', 'unchanged'],
    ]);
    expect(
      listOf(fieldAt(log, 'runs', 0, 'tool', 'driver', 'rules')).map((rule) => fieldAt(rule, 'id')),
    ).toEqual(['eslint/no-console', 'eslint/file-size']);
    expect(
      fieldAt(
        log,
        'runs',
        0,
        'results',
        1,
        'locations',
        0,
        'physicalLocation',
        'artifactLocation',
        'uri',
      ),
    ).toBe('packages/my%20app/src/a.js');
  });
});

describe('renderSnapshotSarifReport', () => {
  const snapshot = {
    summary: { overallStatus: 'violations' },
    findings: [
      finding(),
      finding({
        tool: 'complexity',
        rule: 'cyclomatic',
        identity: 'fn',
        classification: 'descriptive',
      }),
    ],
    toolErrors: [{ tool: 'depcruise', snapshot: 'head', message: 'boom', path: '' }],
  };

  it('writes every finding of the full run with no baseline state', () => {
    const log = parseJson(renderSnapshotSarifReport(snapshot, { projectPath }));

    expectValidSarif(log);
    const run = fieldAt(log, 'runs', 0);
    expect(
      listOf(fieldAt(run, 'results')).map((result) => [
        fieldAt(result, 'ruleId'),
        fieldAt(result, 'level'),
        fieldAt(result, 'baselineState'),
      ]),
    ).toEqual([
      ['eslint/no-console', 'error', undefined],
      ['complexity/cyclomatic', 'note', undefined],
    ]);
    expect(
      fieldAt(run, 'results', 0, 'locations', 0, 'physicalLocation', 'artifactLocation', 'uri'),
    ).toBe('packages/my%20app/src/a.js');
    expect(fieldAt(run, 'invocations', 0, 'executionSuccessful')).toBe(false);
  });
  it('gives a finding the same fingerprint as in the differential run', () => {
    const fingerprint = (log: unknown): unknown =>
      fieldAt(log, 'runs', 0, 'results', 0, 'partialFingerprints');
    const full = parseJson(
      renderSnapshotSarifReport(
        { summary: {}, findings: [finding()], toolErrors: [] },
        { projectPath },
      ),
    );
    const diff = parseJson(renderSarifReport(report({ newFindings: [finding()] })));

    expect(fingerprint(full)).toEqual(fingerprint(diff));
  });
});

describe('SARIF schema check', () => {
  it('rejects a log the 2.1.0 schema does not allow', () => {
    const log = parseJson(renderSarifReport(report({ newFindings: [finding()] }), { projectPath }));
    const text = JSON.stringify(log);
    const errorPaths = (from: string, to: string): string[] =>
      sarifSchemaErrors(parseJson(text.replace(from, to))).map(({ instancePath }) => instancePath);

    expect(sarifSchemaErrors(log)).toEqual([]);
    expect(errorPaths('"baselineState":"new"', '"baselineState":"fixed"')).toEqual([
      '/runs/0/results/0/baselineState',
    ]);
    expect(errorPaths('"startLine":12', '"startLine":0')).toEqual([
      '/runs/0/results/0/locations/0/physicalLocation/region/startLine',
    ]);
    expect(errorPaths('"columnKind":"utf16CodeUnits"', '"columnKind":"bytes"')).toEqual([
      '/runs/0/columnKind',
    ]);
  });
});
