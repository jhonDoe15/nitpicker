import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { writeFiles } from '../../../../core/diff/git/test-support/fixture-files.mts';
import { PACKAGE_ROOT } from '../../../../core/tooling/tool-resolution.mjs';
import { HEAD_POLICY_ENV } from '../../../../shared/head-policy.mjs';
import { parseArguments } from '../../adapters/quality-areas/arguments.mts';
import { runQualityAreaReport } from '../../adapters/quality-areas-runner.mts';
import { fieldOf } from '../../../../shared/values/readers.mts';
import { projectImports as untypedProjectImports } from './cruise.mjs';

type ImportGraph = {
  readonly modules: readonly {
    readonly source: string;
    readonly dependencies: readonly {
      readonly resolved?: string;
      readonly module?: string;
      readonly coreModule?: boolean;
    }[];
  }[];
};

const projectImports: (
  graph: ImportGraph,
  isProduction: (file: string) => boolean,
) => { readonly from: string; readonly to: string }[] = untypedProjectImports;

const roots: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function projectWith(files: Readonly<Record<string, string>>): string {
  const parent = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-diff-')));
  roots.push(parent);
  const root = path.join(parent, 'head');
  writeFiles(root, files);
  return root;
}

function coupling(projectRoot: string) {
  return runQualityAreaReport(
    parseArguments([
      ...['--analyzer-name', 'coupling', '--kind', 'coupling'],
      ...['--project-root', projectRoot, '--policy-root', PACKAGE_ROOT],
      ...['--tool-root', PACKAGE_ROOT, '--snapshot', 'head'],
    ]),
  );
}

describe('project imports from the dependency graph', () => {
  it('keeps resolved edges between project source files and leaves packages and tests out', () => {
    const graph = {
      modules: [
        {
          source: './src/a/x.ts',
          dependencies: [
            { resolved: 'src/b/y.ts' },
            { resolved: 'node_modules/zod/index.js' },
            { resolved: 'src/a/x.test.ts' },
            { module: 'fs', coreModule: true },
          ],
        },
        { source: 'src/b/y.ts', dependencies: [] },
        { source: 'src/a/x.test.ts', dependencies: [{ resolved: 'src/a/x.ts' }] },
      ],
    };

    expect(projectImports(graph, (file) => !file.endsWith('.test.ts'))).toEqual([
      { from: 'src/a/x.ts', to: 'src/b/y.ts' },
    ]);
  });

  it('publishes folder imports from the coupling analyzer only when co-change history is on', async () => {
    const projectRoot = projectWith({
      'package.json': '{"name":"p","type":"module"}\n',
      'src/billing/invoice.ts':
        "import { total } from '../invoicing/ledger.js';\nexport const invoice = (): number => total();\n",
      'src/invoicing/ledger.ts': 'export function total(): number {\n  return 1;\n}\n',
    });
    const policyFile = path.join(path.dirname(projectRoot), 'policy.json');

    writeFileSync(policyFile, JSON.stringify({ history: { coChange: true } }));
    vi.stubEnv(HEAD_POLICY_ENV, policyFile);
    const enabled = await coupling(projectRoot);
    writeFileSync(policyFile, JSON.stringify({}));
    const disabled = await coupling(projectRoot);

    expect(fieldOf(enabled, 'moduleImports')).toEqual([
      { from: 'src/billing/invoice.ts', to: 'src/invoicing' },
    ]);
    expect(disabled).not.toHaveProperty('moduleImports');
    expect(disabled.findings).toEqual(enabled.findings);
  });

  it('follows package-name imports of workspace packages to their source files', async () => {
    const projectRoot = projectWith({
      'package.json': '{"name":"r","type":"module","private":true,"workspaces":["packages/*"]}\n',
      'packages/invoicing/package.json': '{"name":"@acme/invoicing","main":"src/index.ts"}\n',
      'packages/invoicing/src/index.ts': 'export const total = (): number => 1;\n',
      'packages/ledger/package.json':
        '{"name":"@acme/ledger","exports":{".":{"import":"./dist/esm/index.js"}}}\n',
      'packages/ledger/src/index.ts': 'export const sum = (): number => 1;\n',
      'packages/tax/package.json': '{"name":"@acme/tax","main":"bundle/tax.cjs"}\n',
      'packages/tax/src/rates.ts': 'export const rate = (): number => 1;\n',
      'packages/billing/package.json': '{"name":"@acme/billing"}\n',
      'packages/billing/src/invoice.ts': [
        "import { total } from '@acme/invoicing';",
        "import { sum } from '@acme/ledger';",
        "import { rate } from '@acme/tax';",
        "import { refund } from './refunds/refund.js';",
        'export const invoice = (): number => total() + sum() + rate() + refund();',
        '',
      ].join('\n'),
      'packages/billing/src/refunds/refund.ts': 'export const refund = (): number => 1;\n',
    });
    mkdirSync(path.join(projectRoot, 'node_modules/@acme'), { recursive: true });
    for (const name of ['invoicing', 'ledger', 'tax']) {
      symlinkSync(`../../packages/${name}`, path.join(projectRoot, `node_modules/@acme/${name}`));
    }
    const policyFile = path.join(path.dirname(projectRoot), 'policy.json');
    writeFileSync(
      policyFile,
      JSON.stringify({ history: { coChange: true }, layout: { sourceRoots: ['packages'] } }),
    );
    vi.stubEnv(HEAD_POLICY_ENV, policyFile);

    const { moduleImports } = await coupling(projectRoot);

    expect(moduleImports).toEqual([
      { from: 'packages/billing/src/invoice.ts', package: 'packages/tax' },
      { from: 'packages/billing/src/invoice.ts', to: 'packages/billing/src/refunds' },
      { from: 'packages/billing/src/invoice.ts', to: 'packages/invoicing/src' },
      { from: 'packages/billing/src/invoice.ts', to: 'packages/ledger/src' },
    ]);
  });

  it('counts an import naming the .ts file as runtime when tsconfig rewrites import extensions', async () => {
    const projectRoot = projectWith({
      'package.json': '{"name":"p","type":"module"}\n',
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          allowImportingTsExtensions: true,
          rewriteRelativeImportExtensions: true,
          noEmit: true,
          types: [],
          lib: ['ES2022'],
        },
      }),
      'src/billing/invoice.ts':
        "import { total } from '../invoicing/ledger.ts';\nexport const invoice = (): number => total();\n",
      'src/invoicing/ledger.ts': 'export function total(): number {\n  return 1;\n}\n',
    });
    const policyFile = path.join(path.dirname(projectRoot), 'policy.json');
    writeFileSync(policyFile, JSON.stringify({}));
    vi.stubEnv(HEAD_POLICY_ENV, policyFile);

    const { findings } = await coupling(projectRoot);

    const fanIn = findings.find(
      (finding) =>
        finding.path === 'src/invoicing/ledger.ts' &&
        fieldOf(fieldOf(finding, 'metric'), 'name') === 'runtimeFanIn',
    );

    expect(fieldOf(fieldOf(fanIn, 'metric'), 'value')).toBe(1);
  });
});
