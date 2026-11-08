import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { HEAD_POLICY_ENV } from '../../../head-policy.mjs';
import { folderImports, moduleImportsSection } from './module-imports.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function policyEnvironment(policy) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-module-imports-'));
  roots.push(root);
  const file = path.join(root, 'policy.json');
  writeFileSync(file, JSON.stringify(policy));
  return { [HEAD_POLICY_ENV]: file };
}

const IMPORTS = [
  { from: 'src/billing/invoice.ts', to: 'src/invoicing/ledger.ts' },
  { from: 'src/billing/invoice.ts', to: 'src/invoicing/totals.ts' },
  { from: 'src/billing/refund.ts', to: 'src/invoicing/ledger.ts' },
  { from: 'src/billing/refund.ts', to: 'src/billing/invoice.ts' },
  { from: 'main.ts', to: 'src/billing/invoice.ts' },
  { from: 'src/invoicing/ledger.ts', to: 'src/billing/invoice.ts' },
];

describe('folder imports', () => {
  it('counts the importing files per folder pair and leaves same-folder and root files out', () => {
    expect(folderImports(IMPORTS)).toEqual([
      { from: 'src/billing', to: 'src/invoicing', files: 2 },
      { from: 'src/invoicing', to: 'src/billing', files: 1 },
    ]);
  });
  it('publishes the section only when co-change history is enabled', () => {
    expect(
      moduleImportsSection(IMPORTS, policyEnvironment({ history: { coChange: true } })),
    ).toEqual({ moduleImports: folderImports(IMPORTS) });
    expect(moduleImportsSection(IMPORTS, policyEnvironment({ history: {} }))).toEqual({});
    expect(moduleImportsSection(IMPORTS, {})).toEqual({});
    expect(
      moduleImportsSection(undefined, policyEnvironment({ history: { coChange: true } })),
    ).toEqual({});
  });
});
