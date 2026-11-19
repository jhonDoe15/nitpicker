import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fieldOf } from '../../../../../shared/values/readers.mts';
import { callUntyped } from '../../typed/java-values.mts';
import { findingsOf } from '../../kotlin/rules/test-support/findings-list.mts';
import { assigned } from '../test-support/views/assigned.mts';
import { findingFactory as untypedFindingFactory } from '../../kotlin/review-rules/review-finding.mts';
import { serviceLookupFindings as untypedServiceLookupFindings } from '../../kotlin/review-rules/main/service-lookups/service-lookups.mts';
import { composeMessage } from '../../kotlin/review-rules/test-support/lookup-facts.mts';
import { prepareKotlinPsi, runKotlinPsi } from '../../test-support/kotlin/kotlin-psi-program.mts';
import {
  EXPECTED_LOOKUP_FACT_FINDINGS,
  LOOKUP_FACT_SOURCES,
} from '../test-support/review/lookups/kotlin-lookup-facts-data.mts';

const findingFactory: () => unknown = untypedFindingFactory;
function serviceLookupFindings(
  files: unknown,
  options: { finding: unknown },
): { path: string; symbol?: string; message: string }[] {
  return findingsOf(callUntyped(untypedServiceLookupFindings, files, options));
}

const enabled = process.env['NITPICKER_KOTLIN_E2E'] === '1';
const gradle = process.env['NITPICKER_GRADLE'] ?? 'gradle';

function writeSources(root: string, files: Record<string, string>) {
  for (const [relative, content] of Object.entries(files)) {
    const target = path.resolve(root, relative);
    if (!target.startsWith(root + path.sep)) {
      throw new Error(`${relative} is outside ${root}`);
    }
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  return root;
}

describe.skipIf(!enabled)('service lookups from the facts kotlin-psi collects', () => {
  let workspace: string | undefined;
  let facts: unknown;

  beforeAll(() => {
    workspace = mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-lookups-'));
    const project = path.join(workspace, 'project');
    cpSync(path.resolve(import.meta.dirname, '../../fixtures/kotlin-project'), project, {
      recursive: true,
    });
    const psi = prepareKotlinPsi(workspace, project, gradle);
    const sources = writeSources(path.join(workspace, 'lookups'), LOOKUP_FACT_SOURCES);
    ({ facts } = runKotlinPsi(psi, sources));
  });

  afterAll(() => {
    rmSync(assigned(workspace, 'workspace'), { recursive: true, force: true });
  });

  it('reports the lookups outside composition points, typed by scope, through references and qualified names', () => {
    const findings = serviceLookupFindings(fieldOf(facts, 'files'), { finding: findingFactory() });

    expect(findings.map(({ path: file, symbol }) => `${file} ${String(symbol)}`).sort()).toEqual(
      EXPECTED_LOOKUP_FACT_FINDINGS,
    );
  });

  it('asks a composable for a parameter with the Koin call as its default value', () => {
    const findings = serviceLookupFindings(fieldOf(facts, 'files'), { finding: findingFactory() });
    const composable = findings.find(({ symbol }) => symbol?.startsWith('OrdersScreen') === true);

    expect(composable?.message).toBe(composeMessage('koinInject()', 'src/demo/Screens.kt'));
  });
});
