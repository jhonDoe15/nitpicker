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

function describeFinding({ rule, path: file }) {
  return `${rule} ${file}`;
}

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

function architectureFindings(files, dependencies = 'installed', describe = describeFinding) {
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
    findings: run.reports.get('dependency-architecture')?.findings.map(describe).toSorted(),
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

describe('architecture findings', () => {
  it('name the allowed form, the exception route and the shared module on the way', () => {
    const route =
      ' An exception fits only when it is deliberate; its paths are the importing files.';
    const idLibraries = [
      'domain/ may not import ID or random-data libraries (uuid, nanoid, cuid, ulid, faker).',
      ' Take the ID as a parameter from adapters/.',
    ].join('');
    const reach = [
      'domain/ reaches Node I/O or a client through a shared/ module it imports.',
      ' Move that dependency out of the shared module,',
      ' or do the work in adapters/ and pass the result into domain/ as a parameter.',
    ].join('');
    expect(architectureFindings(project, 'absent', ({ message }) => message)).toEqual({
      toolErrors: [],
      findings: [
        `src/main/features/orders/domain/order-id.ts must not depend on uuid. ${idLibraries}${route}`,
        [
          'src/main/features/orders/domain/order-total.ts must not depend on pg',
          ` through src/main/shared/database.ts. ${reach}${route}`,
        ].join(''),
      ],
    });
  });
});

describe('domain rules on a local folder named like a package', () => {
  it('report nothing for shared/ws/ and shared/uuid/ imported from domain/', () => {
    expect(
      architectureFindings({
        'package.json': JSON.stringify({ name: 'fixture' }),
        'src/main/shared/ws/frames.ts': 'export const frameSize = 4;\n',
        'src/main/shared/uuid/format.ts': 'export const separator = 4;\n',
        'src/main/features/orders/domain/frames.ts': [
          "import { frameSize } from '../../../shared/ws/frames.js';",
          "import { separator } from '../../../shared/uuid/format.js';",
          '',
          'export const total = frameSize + separator;',
          '',
        ].join('\n'),
      }),
    ).toEqual({ toolErrors: [], findings: [] });
  });
});
