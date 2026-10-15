import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { withDefaultAnalyzerParallelism } from '../../../../core/diff/fixtures/analyzer-parallelism.mjs';
import { runAnalyzers } from '../../../../core/diff/run-analyzers.mjs';
import { configuredAnalyzers } from '../../preset/diff/configured-analyzers.mjs';
import { resolveHeadPolicy, withHeadPolicyFile } from '../../preset/head-policy.mjs';

const packageRoot = path.resolve(import.meta.dirname, '../../../..');
const TOOL_TIMEOUT_MS = 240_000;
const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-diff-'));
const root = path.join(temporaryRoot, 'base');
const domain = 'src/main/features/billing/domain';

afterAll(() => {
  rmSync(temporaryRoot, { recursive: true, force: true });
});

const files = {
  'tsconfig.json': JSON.stringify({ compilerOptions: { module: 'NodeNext', strict: true } }),
  'package.json': JSON.stringify({
    name: 'app',
    type: 'module',
    dependencies: { react: '19.0.0' },
  }),
  'node_modules/react/package.json': JSON.stringify({ name: 'react', main: 'index.js' }),
  'node_modules/react/index.js': 'exports.useState = () => [];\n',
  'node_modules/pino/package.json': JSON.stringify({ name: 'pino', main: 'pino.js' }),
  'node_modules/pino/pino.js': 'module.exports = () => ({});\n',
  'node_modules/axios/package.json': JSON.stringify({ name: 'axios', main: 'index.js' }),
  'node_modules/axios/index.js': 'module.exports = {};\n',
  [`${domain}/log.ts`]: "import pino from 'pino';\nexport const log = pino;\n",
  [`${domain}/fetch.ts`]: "import axios from 'axios';\nexport const client = axios;\n",
  [`${domain}/view.ts`]: "import { useState } from 'react';\nexport const view = useState;\n",
  [`${domain}/total.ts`]: 'export function total(a: number, b: number): number {\n  return a + b;\n}\n',
};

for (const [file, contents] of Object.entries(files)) {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), contents);
}

function findingsOf(names) {
  const policy = resolveHeadPolicy({});
  const run = withDefaultAnalyzerParallelism(() =>
    withHeadPolicyFile(policy, (headPolicyFile) =>
      runAnalyzers({
        analyzers: configuredAnalyzers.filter(({ name }) => names.includes(name)),
        projectRoot: root,
        policyRoot: root,
        toolRoot: packageRoot,
        liveProjectRoot: packageRoot,
        snapshot: 'head',
        headPolicyFile,
      }),
    ),
  );
  expect(run.toolErrors).toEqual([]);
  return names.flatMap((name) =>
    run.reports
      .get(name)
      .findings.filter(({ rule }) => rule.startsWith('domain-') || rule === 'no-restricted-syntax')
      .map(({ path: file, rule }) => `${file} ${rule}`)
      .toSorted(),
  );
}

describe('architecture rules on installed packages', () => {
  it(
    'report domain imports of packages that resolve into node_modules, react included',
    () => {
      expect(findingsOf(['dependency-architecture', 'eslint-lint'])).toEqual([
        `${domain}/fetch.ts domain-does-not-import-network-or-database-clients`,
        `${domain}/log.ts domain-does-not-import-the-logger`,
        `${domain}/view.ts no-restricted-syntax`,
      ]);
    },
    TOOL_TIMEOUT_MS,
  );
});
