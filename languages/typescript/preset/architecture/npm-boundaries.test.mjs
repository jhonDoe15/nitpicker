import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { withDefaultAnalyzerParallelism } from '../../../../core/diff/execution/test-support/analyzer-parallelism.mjs';
import { runAnalyzers } from '../../../../core/diff/execution/run-analyzers.mjs';
import { configuredAnalyzers } from '../diff/configured-analyzers.mjs';
import { resolveHeadPolicy, withHeadPolicyFile } from '../head-policy.mjs';

const packageRoot = path.resolve(import.meta.dirname, '../../../..');
const roots = [];

function installedPackage(name) {
  return {
    [`node_modules/${name}/package.json`]: JSON.stringify({
      name,
      version: '1.0.0',
      main: 'dist/cjs/index.js',
    }),
    [`node_modules/${name}/dist/cjs/index.js`]: 'exports.value = 1;\n',
  };
}

const project = {
  ...installedPackage('uuid'),
  ...installedPackage('pg'),
  'package.json': JSON.stringify({ name: 'fixture', dependencies: { uuid: '1.0.0', pg: '1.0.0' } }),
  'src/main/features/orders/domain/order-id.ts':
    "import { value } from 'uuid';\n\nexport const orderId = value;\n",
  'src/main/shared/database.ts': "import { value } from 'pg';\n\nexport const database = value;\n",
  'src/main/features/orders/domain/order-total.ts':
    "import { database } from '../../../shared/database.js';\n\nexport const total = database;\n",
};

afterAll(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function writeFiles(root, files) {
  for (const [relativePath, contents] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, relativePath)), { recursive: true });
    writeFileSync(path.join(root, relativePath), contents);
  }
}

function sourceFiles(files) {
  return Object.fromEntries(
    Object.entries(files).filter(([relativePath]) => !relativePath.startsWith('node_modules/')),
  );
}

function installedFiles(files) {
  return Object.fromEntries(
    Object.entries(files).filter(([relativePath]) => relativePath.startsWith('node_modules/')),
  );
}

function prepareDependencies(temporaryRoot, projectRoot, files, dependencies) {
  if (dependencies === 'installed') {
    writeFiles(projectRoot, installedFiles(files));
  }
  if (dependencies === 'symlinked') {
    const liveRoot = path.join(temporaryRoot, 'live');
    writeFiles(liveRoot, installedFiles(files));
    symlinkSync(path.join(liveRoot, 'node_modules'), path.join(projectRoot, 'node_modules'), 'dir');
  }
}

function architectureFindings(files, dependencies = 'installed') {
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-diff-'));
  roots.push(temporaryRoot);
  const projectRoot = path.join(temporaryRoot, 'head');
  writeFiles(projectRoot, sourceFiles(files));
  prepareDependencies(temporaryRoot, projectRoot, files, dependencies);
  const run = withDefaultAnalyzerParallelism(() =>
    withHeadPolicyFile(resolveHeadPolicy({}), (headPolicyFile) =>
      runAnalyzers({
        analyzers: configuredAnalyzers().filter(({ name }) => name === 'dependency-architecture'),
        projectRoot,
        policyRoot: projectRoot,
        toolRoot: packageRoot,
        liveProjectRoot: packageRoot,
        snapshot: 'head',
        headPolicyFile,
      }),
    ),
  );
  return {
    toolErrors: run.toolErrors,
    findings: run.reports
      .get('dependency-architecture')
      ?.findings.map(({ rule, path: file }) => `${rule} ${file}`)
      .toSorted(),
  };
}

describe('domain rules on installed npm packages', () => {
  it.each(['installed', 'symlinked', 'absent'])(
    'reports an ID library and a client reached through shared/ with node_modules %s',
    (dependencies) => {
      expect(architectureFindings(project, dependencies)).toEqual({
        toolErrors: [],
        findings: [
          'domain-does-not-import-id-libraries src/main/features/orders/domain/order-id.ts',
          'domain-does-not-reach-io-through-shared src/main/features/orders/domain/order-total.ts',
        ],
      });
    },
  );
});
