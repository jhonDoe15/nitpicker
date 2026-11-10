import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PACKAGE_ROOT } from '../../../../core/tooling/tool-resolution.mjs';
import { HEAD_POLICY_ENV } from '../../../../shared/head-policy.mjs';
import { parseArguments } from '../../adapters/quality-areas/arguments.mjs';
import { runQualityAreaReport } from '../../adapters/quality-areas-runner.mjs';
import { projectImports } from './cruise.mjs';

const roots = [];

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function projectWith(files) {
  const parent = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-diff-')));
  roots.push(parent);
  const root = path.join(parent, 'head');
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
  return root;
}

function coupling(projectRoot) {
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

    expect(enabled.moduleImports).toEqual([
      { from: 'src/billing/invoice.ts', to: 'src/invoicing' },
    ]);
    expect(disabled).not.toHaveProperty('moduleImports');
    expect(disabled.findings).toEqual(enabled.findings);
  });
});
