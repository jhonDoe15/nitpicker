import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { compareFindings } from '../../../../core/diff/comparison/compare.mjs';
import { exceptionHint } from '../../../../shared/rules/exceptions.mjs';
import { applyFindingPolicy } from '../../../../shared/findings/finding-policy.mjs';
import { kotlinRuleCases } from '../kotlin/rules/test-support/kotlin-rule-cases.mjs';
import {
  kotlinFindings,
  projectWithKotlinReports,
  removeTemporaryProjects,
  rootReports,
} from './test-support/kotlin-report-project.mjs';

const rule = 'detekt.coroutines.SuspendFunSwallowedCancellation';
const message = kotlinRuleCases.find(({ id }) => id === 'suspendRunCatching').message;
const sources = ['src/main/kotlin/demo/Bad.kt', 'src/test/kotlin/demo/BadTest.kt'];

afterEach(removeTemporaryProjects);

function cancellationFindings(line) {
  const root = projectWithKotlinReports();
  writeFileSync(
    path.join(rootReports(root), 'detekt.sarif'),
    JSON.stringify({
      runs: [
        {
          tool: { driver: { name: 'detekt', version: '1.23.8' } },
          results: sources.map((file) => ({
            ruleId: rule,
            level: 'warning',
            message: { text: message },
            locations: [
              {
                physicalLocation: {
                  artifactLocation: { uri: file },
                  region: { startLine: line },
                },
              },
            ],
          })),
        },
      ],
    }),
  );
  return kotlinFindings(root, 'detekt');
}

it('baselines cancellation findings across line movement in main and test sources', () => {
  const baseFindings = cancellationFindings(3);
  const headFindings = cancellationFindings(20);
  const compared = compareFindings({ baseFindings, headFindings });

  expect(compared.newFindings).toEqual([]);
  expect(compared.resolvedFindings).toEqual([]);
  expect(compared.unchangedFindings).toHaveLength(2);
  expect(
    headFindings.map(({ identity, classification, location }) => [
      identity,
      classification,
      location.line,
    ]),
  ).toEqual(sources.map(() => [`fp:nitpicker/subject=${message}`, 'enforceable', 20]));
  expect(headFindings[0].message).toBe(
    `${message} Use a direct suspend call or catch only the expected specific exception; a Result helper must rethrow CancellationException immediately. ${exceptionHint(rule, sources[0])}`,
  );
});

it('lifts only the reviewed cancellation path while preserving other paths and rules', () => {
  const findings = cancellationFindings(3);
  const other = { ...findings[1], rule: 'detekt.exceptions.TooGenericExceptionCaught' };

  expect(
    applyFindingPolicy([...findings, other], {
      exceptions: [{ rule, glob: 'src/test/**', reason: 'Reviewed cancellation boundary' }],
    }),
  ).toEqual([findings[0], other]);
});
