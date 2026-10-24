import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import {
  readJavaFindings,
  projectWithKotlinReports,
  rootReports,
  removeTemporaryProjects,
} from '../test-support/kotlin-report-project.mjs';
import { applyFindingPolicy } from '../../../../../shared/findings/finding-policy.mjs';
import { parseAnalyzerReport } from '../../../../../core/diff/comparison/finding-schema.mjs';

const file = 'src/main/java/demo/Legacy.java';
afterEach(removeTemporaryProjects);

it.each(['java', 'kotlin'])(
  'includes schema-valid Java aliases through the shared %s reporting path',
  (preset) => {
    const root = projectWithKotlinReports();
    writeFileSync(
      path.join(rootReports(root), 'classes.json'),
      JSON.stringify({
        files: {},
        classes: [],
        forwarders: [
          { file, symbol: 'Legacy.alias', target: 'Legacy.target', line: 3 },
          {
            file: 'src/test/java/Check.java',
            symbol: 'Check.alias',
            target: 'Check.target',
            line: 3,
          },
        ],
      }),
    );
    const findings = readJavaFindings(root, { preset }).findings.filter(
      ({ rule }) => rule === 'ForwardingMethodAlias',
    );

    expect(parseAnalyzerReport({ findings }, preset).findings).toEqual(findings);
    expect(findings.map(({ path: source, identity }) => [source, identity])).toEqual([
      [file, 'ForwardingMethodAlias:Legacy.alias'],
    ]);
    expect(
      applyFindingPolicy(findings, {
        exceptions: [{ rule: 'pmd/ForwardingMethodAlias', glob: file }],
      }),
    ).toEqual([]);
  },
);
