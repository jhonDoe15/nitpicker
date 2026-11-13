import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { collectArchitectureSignals } from './check.mjs';
import { resolveLayout } from '../layout.mjs';
import { analyzePublicContractUsage } from '../architecture/public-contract-usage.mjs';

describe('architecture signal paths', () => {
  let root;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'architecture-signals-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function write(file, source) {
    const absolute = path.join(root, file);
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, source);
  }

  function config(file, include, rootDir) {
    write(file, JSON.stringify({ compilerOptions: { noLib: true, types: [], rootDir }, include }));
  }

  function contract(file) {
    write(
      file,
      'export interface Port { send(): void; } export class Adapter implements Port { send() {} }',
    );
  }

  function signal(file) {
    return { file, rule: 'public-contract-production-use', source: 'Port.send' };
  }

  it('uses project-relative paths when a source root falls back to the root tsconfig', () => {
    config('tsconfig.json', ['src/**/*.ts']);
    contract('src/contract.ts');

    expect(collectArchitectureSignals(root, resolveLayout())).toEqual([signal('src/contract.ts')]);
  });

  it('reports a shared config once across source roots and ignores missing roots', () => {
    config('tsconfig.json', ['core/**/*.ts', 'languages/**/*.ts']);
    contract('core/contract.ts');
    contract('languages/contract.ts');
    const layout = resolveLayout({ sourceRoots: ['core', 'languages', 'missing'] });

    expect(collectArchitectureSignals(root, layout)).toEqual([
      signal('core/contract.ts'),
      signal('languages/contract.ts'),
    ]);
  });

  it('applies exclusions to the real project-relative path', () => {
    config('tsconfig.json', ['src/**/*.ts']);
    contract('src/contract.ts');
    contract('src/excluded/contract.ts');
    const layout = resolveLayout({}, ['src/excluded/**']);

    expect(collectArchitectureSignals(root, layout)).toEqual([signal('src/contract.ts')]);
  });

  it('prefixes findings from source-local configs with their actual folder', () => {
    config('packages/app/tsconfig.json', ['*.ts']);
    contract('packages/app/contract.ts');
    const layout = resolveLayout({ sourceRoots: ['packages/app'] });

    expect(collectArchitectureSignals(root, layout)).toEqual([signal('packages/app/contract.ts')]);
  });

  it.each([
    ['tsconfig.json', 'src'],
    ['src/tsconfig.json', 'lib'],
  ])('resolves rootDir paths from %s without changing the standalone analyzer', (file, rootDir) => {
    config(file, ['**/*.ts'], rootDir);
    const folder = path.posix.dirname(file);
    const contractPath = path.posix.join(folder, rootDir, 'contract.ts');
    contract(contractPath);

    expect(collectArchitectureSignals(root, resolveLayout())).toEqual([signal(contractPath)]);
    expect(analyzePublicContractUsage(path.join(root, file))).toEqual([
      { file: 'contract.ts', contract: 'Port', method: 'send' },
    ]);
  });

  it('collects findings from both a root fallback and a source-local config', () => {
    config('tsconfig.json', ['core/**/*.ts']);
    config('packages/app/tsconfig.json', ['*.ts']);
    contract('core/contract.ts');
    contract('packages/app/contract.ts');
    const layout = resolveLayout({ sourceRoots: ['core', 'packages/app'] });

    expect(collectArchitectureSignals(root, layout)).toEqual([
      signal('core/contract.ts'),
      signal('packages/app/contract.ts'),
    ]);
  });

  it('returns no contract findings when no tsconfig exists', () => {
    contract('src/contract.ts');

    expect(collectArchitectureSignals(root, resolveLayout())).toEqual([]);
  });
});
