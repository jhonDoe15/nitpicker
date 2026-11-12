import { describe, expect, it } from 'vitest';
import { folderImports, moduleImportsSection } from './module-imports.mjs';

const IMPORTS = [
  { from: 'src/billing/invoice.ts', to: 'src/invoicing/ledger.ts' },
  { from: 'src/billing/invoice.ts', to: 'src/invoicing/totals.ts' },
  { from: 'src/billing/refund.ts', to: 'src/invoicing/ledger.ts' },
  { from: 'src/billing/refund.ts', to: 'src/billing/invoice.ts' },
  { from: 'main.ts', to: 'src/billing/invoice.ts' },
  { from: 'src/invoicing/ledger.ts', to: 'src/billing/invoice.ts' },
];

describe('folder imports', () => {
  it('keeps one edge per importing file and imported folder, without same-folder or root files', () => {
    expect(folderImports(IMPORTS)).toEqual([
      { from: 'src/billing/invoice.ts', to: 'src/invoicing' },
      { from: 'src/billing/refund.ts', to: 'src/invoicing' },
      { from: 'src/invoicing/ledger.ts', to: 'src/billing' },
    ]);
  });
  it('publishes the section only when co-change history is enabled', () => {
    expect(moduleImportsSection(IMPORTS, { coChange: true })).toEqual({
      moduleImports: folderImports(IMPORTS),
    });
    expect(moduleImportsSection(IMPORTS, {})).toEqual({});
    expect(moduleImportsSection(IMPORTS, undefined)).toEqual({});
    expect(moduleImportsSection(undefined, { coChange: true })).toEqual({});
  });
});
