import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import {
  readJavaFindings,
  rootReports,
  projectWithKotlinReports,
  removeTemporaryProjects,
} from '../test-support/kotlin-report-project.mjs';

afterEach(removeTemporaryProjects);

it('ingests PSI forwarding evidence through Kotlin module reporting', () => {
  const root = projectWithKotlinReports();
  const file = 'src/main/kotlin/demo/Bad.kt';
  writeFileSync(
    path.join(rootReports(root), 'kotlin-metrics.json'),
    JSON.stringify({
      functions: [],
      files: [],
      forwarders: [
        { file, name: 'redundant', target: 'target', line: 4 },
        { file: 'src/test/kotlin/demo/Test.kt', name: 'helper', target: 'target', line: 5 },
      ],
    }),
  );

  const { findings } = readJavaFindings(root, { preset: 'kotlin' });

  expect(
    findings
      .filter(({ rule }) => rule === 'no-forwarding-wrapper')
      .map(({ path: source, identity, symbol, location, classification }) => ({
        source,
        identity,
        symbol,
        location,
        classification,
      })),
  ).toEqual([
    {
      source: file,
      identity: 'forward:redundant:target',
      symbol: 'redundant',
      location: { line: 4 },
      classification: 'enforceable',
    },
  ]);
});
