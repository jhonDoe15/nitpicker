import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { withDefaultAnalyzerParallelism as untypedParallelism } from '../../../../core/diff/execution/test-support/analyzer-parallelism.mjs';
import { runAnalyzers } from '../../../../core/diff/execution/run-analyzers.mts';
import { configuredAnalyzers as untypedConfiguredAnalyzers } from '../diff/configured-analyzers.mjs';
import {
  resolveHeadPolicy as untypedResolveHeadPolicy,
  withHeadPolicyFile as untypedWithHeadPolicyFile,
} from '../head-policy.mjs';

type Files = Readonly<Record<string, string>>;
type Dependencies = 'installed' | 'symlinked' | 'absent';
type FindingView = { readonly rule: string; readonly path: string; readonly message: string };

const withDefaultAnalyzerParallelism: <T>(run: () => T) => T = untypedParallelism;
const configuredAnalyzers: () => readonly { readonly name: string }[] = untypedConfiguredAnalyzers;
const resolveHeadPolicy: (config: object) => unknown = untypedResolveHeadPolicy;
const withHeadPolicyFile: <T>(policy: unknown, operation: (headPolicyFile: string) => T) => T =
  untypedWithHeadPolicyFile;

const packageRoot = path.resolve(import.meta.dirname, '../../../..');
const roots: string[] = [];
const dependencyModes: Dependencies[] = ['installed', 'symlinked', 'absent'];

function installedPackage(name: string): Files {
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

function describeFinding({ rule, path: file }: FindingView): string {
  return `${rule} ${file}`;
}

function writeFiles(root: string, files: Files): void {
  for (const [relativePath, contents] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, relativePath)), { recursive: true });
    writeFileSync(path.join(root, relativePath), contents);
  }
}

function sourceFiles(files: Files): Files {
  return Object.fromEntries(
    Object.entries(files).filter(([relativePath]) => !relativePath.startsWith('node_modules/')),
  );
}

function installedFiles(files: Files): Files {
  return Object.fromEntries(
    Object.entries(files).filter(([relativePath]) => relativePath.startsWith('node_modules/')),
  );
}

function prepareDependencies(
  temporaryRoot: string,
  projectRoot: string,
  files: Files,
  dependencies: Dependencies,
): void {
  if (dependencies === 'installed') {
    writeFiles(projectRoot, installedFiles(files));
  }
  if (dependencies === 'symlinked') {
    const liveRoot = path.join(temporaryRoot, 'live');
    writeFiles(liveRoot, installedFiles(files));
    symlinkSync(path.join(liveRoot, 'node_modules'), path.join(projectRoot, 'node_modules'), 'dir');
  }
}

function architectureFindings(
  files: Files,
  dependencies: Dependencies = 'installed',
  describe: (finding: FindingView) => string = describeFinding,
) {
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
        baselineRoot: undefined,
        baselineMovesFile: undefined,
        headPolicyFile,
        mutationScope: undefined,
        logRoot: undefined,
        runTasks: undefined,
      }),
    ),
  );
  return {
    toolErrors: run.toolErrors,
    findings: run.reports.get('dependency-architecture')?.findings.map(describe).toSorted(),
  };
}

describe('domain rules on installed npm packages', () => {
  it.each(dependencyModes)(
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
    const guidance =
      ' An exception fits only when it is deliberate; its paths are the importing files.';
    const route = (rule: string, file: string) =>
      ` If this is intended, add {"rule":"${rule}","paths":["${file}"],"reason":"..."} to "exceptions" in nitpicker.config.json.`;
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
        `src/main/features/orders/domain/order-id.ts must not depend on uuid. ${idLibraries}${guidance}${route('domain-does-not-import-id-libraries', 'src/main/features/orders/domain/order-id.ts')}`,
        [
          'src/main/features/orders/domain/order-total.ts must not depend on pg',
          ` through src/main/shared/database.ts. ${reach}${guidance}`,
          route(
            'domain-does-not-reach-io-through-shared',
            'src/main/features/orders/domain/order-total.ts',
          ),
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
