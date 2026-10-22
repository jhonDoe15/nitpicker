import { describe, expect, it } from 'vitest';
import { renderSarifReport } from './sarif.mjs';
import { expectValidSarif } from './test-support/report-assertions.mjs';
import { finding, report } from './test-support/report-builders.mjs';

describe('renderSarifReport', () => {
  it('emits a structurally valid SARIF 2.1.0 log with fingerprints', () => {
    const log = JSON.parse(
      renderSarifReport(
        report({
          newFindings: [
            finding(),
            finding({ rule: 'no-var', identity: 'b:2', location: undefined }),
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
      ),
    );

    expectValidSarif(log);
    const [run] = log.runs;
    expect(run.results.map((result) => [result.ruleId, result.level])).toEqual([
      ['eslint/no-console', 'error'],
      ['eslint/no-var', 'error'],
      ['complexity/cyclomatic', 'note'],
    ]);
    expect(run.results[0].locations[0].physicalLocation).toEqual({
      artifactLocation: { uri: 'src/a.js' },
      region: { startLine: 12, startColumn: 3 },
    });
    expect(run.results[1].locations[0].physicalLocation.region).toBeUndefined();
    expect(run.invocations[0]).toEqual({
      executionSuccessful: false,
      toolExecutionNotifications: [{ level: 'error', message: { text: 'depcruise (head): boom' } }],
    });
  });
  it('keeps fingerprints stable across line moves and distinct across findings', () => {
    const fingerprint = (value) =>
      JSON.parse(renderSarifReport(report({ newFindings: [value] }))).runs[0].results[0]
        .partialFingerprints['nitpickerIdentity/v1'];

    const original = fingerprint(finding());
    expect(original).toMatch(/^[0-9a-f]{64}$/);
    expect(fingerprint(finding({ location: { line: 99 }, message: 'reworded' }))).toBe(original);
    expect(fingerprint(finding({ identity: 'other' }))).not.toBe(original);
    expect(fingerprint(finding({ path: 'src/b.js' }))).not.toBe(original);
  });
  it('links each rule to its entry in the rule reference with a helpUri and a short description', () => {
    const log = JSON.parse(
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
    expect(log.runs[0].tool.driver.rules).toEqual([
      {
        id: 'structure/function-lines-limit',
        name: 'function-lines-limit',
        shortDescription: { text: 'A function longer than the limit.' },
        helpUri: expect.stringMatching(
          /^https:\/\/github\.com\/[^/]+\/nitpicker\/blob\/main\/docs\/rules\/checks\.md#structure-function-lines-limit$/u,
        ),
      },
      {
        id: 'pmd/UnusedLocalVariable',
        name: 'UnusedLocalVariable',
        shortDescription: { text: expect.any(String) },
        helpUri: expect.stringMatching(/\/docs\/rules\/java-pmd\.md#pmd-unusedlocalvariable$/u),
      },
      {
        id: 'eslint-lint/@typescript-eslint/no-explicit-any',
        name: '@typescript-eslint/no-explicit-any',
        shortDescription: { text: 'Disallow the `any` type' },
        helpUri: expect.stringMatching(
          /\/docs\/rules\/typescript-eslint\.md#eslint-typescript-eslint-no-explicit-any$/u,
        ),
      },
      {
        id: 'mypy/attr-defined',
        name: 'attr-defined',
        shortDescription: { text: expect.any(String) },
        helpUri: expect.stringMatching(/\/docs\/rules\/python-types\.md#mypy-error-code$/u),
      },
    ]);
  });
  it('lists a rule the reference does not know with an id and a name only', () => {
    const log = JSON.parse(
      renderSarifReport(
        report({ newFindings: [finding({ tool: 'custom', rule: 'text-file', identity: 'c' })] }),
      ),
    );

    expectValidSarif(log);
    expect(log.runs[0].tool.driver.rules).toEqual([{ id: 'custom/text-file', name: 'text-file' }]);
  });
  it('emits an empty result list for a clean report', () => {
    const log = JSON.parse(renderSarifReport(report()));
    expectValidSarif(log);
    expect(log.runs[0].results).toEqual([]);
    expect(log.runs[0].invocations[0].executionSuccessful).toBe(true);
  });
});
