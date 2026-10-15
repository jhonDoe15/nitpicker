import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { analyzeCallbackProtocols, analyzeProductionCallbacks } from './analyze.mjs';

const contracts = [
  {
    callee: 'WorkLoop',
    optionsArgument: 0,
    sourceCallbacks: ['produce'],
    correlatedCallbacks: [{ name: 'settled', inputIndex: 1 }],
    externalPublicationCallbacks: ['externalCommit'],
    snapshotReadMethods: ['snapshot'],
  },
];
const rules = (source) =>
  analyzeCallbackProtocols(source, { contracts }).map((finding) => finding.rule);

describe('callback protocol architecture rules', () => {
  it('applies configured callback roles independently of API or consumer names', () => {
    expect(
      rules(`class Arbitrary {
      store = new WorkLoop({produce: () => this.read(), settled: (result) => consume(result), externalCommit: () => publish()});
      read() { return this.store.snapshot(); }
    }`),
    ).toEqual([
      'source-loader-does-not-merge-published-state',
      'correlated-callback-declares-correlation-input',
      'publication-owner-does-not-commit-external-state',
    ]);
  });

  it('follows method references, callback aliases, bound methods, and option spreads', () => {
    expect(
      rules(`class Arbitrary {
      produce = this.first.bind(this);
      settings = {produce: this.produce, settled: this.finish};
      store = new WorkLoop({...this.settings});
      first() { return this.second(); }
      second() { const alias = this.store; return alias.snapshot(); }
      finish(outcome) { consume(outcome); }
    }`),
    ).toEqual([
      'source-loader-does-not-merge-published-state',
      'correlated-callback-declares-correlation-input',
    ]);
  });

  it('follows local callback references and target parameters through function calls', () => {
    expect(
      rules(`function transform(target) { return target.snapshot(); }
      const produce = () => transform(result);
      const result = new WorkLoop({produce});
    `),
    ).toEqual(['source-loader-does-not-merge-published-state']);
  });

  it('recognizes imported API aliases and computed snapshot access', () => {
    expect(
      rules(`import {WorkLoop as Renamed} from 'library';
      class Arbitrary {
        store = new Renamed({produce: () => this['store']['snapshot']()});
      }
    `),
    ).toEqual(['source-loader-does-not-merge-published-state']);
  });

  it('does not infer callback roles from method names or reject accepted metadata reads', () => {
    expect(
      rules(`class Arbitrary {
      store = new WorkLoop({produce: () => this.source.snapshot(this.store.get('accepted-etag')), settled: (result, correlation) => this.accept(result, correlation)});
      loadAnything() { return this.store.snapshot(); }
      accept(result, correlation) { use(result, correlation); }
    }`),
    ).toEqual([]);
  });

  it('does not confuse another instance or a shadowed local variable with the target', () => {
    expect(
      rules(`const other = externalSource;
      const produce = () => { const result = other; return result.snapshot(); };
      const result = new WorkLoop({produce});
    `),
    ).toEqual([]);
  });

  it('terminates recursive helper inspection and reports the reachable read once', () => {
    expect(
      rules(`class Arbitrary {
      store = new WorkLoop({produce: () => this.recursive()});
      recursive() { this.recursive(); return this.store.snapshot(); }
    }`),
    ).toEqual(['source-loader-does-not-merge-published-state']);
  });

  it('scans every production source under the root without a consumer allowlist', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'callback-protocols-'));
    try {
      mkdirSync(path.join(root, 'arbitrary', 'nested'), { recursive: true });
      mkdirSync(path.join(root, '__tests__'));
      mkdirSync(path.join(root, 'node_modules'));
      mkdirSync(path.join(root, 'build'));
      const broken = `const c = new WorkLoop({produce: () => c.snapshot()});`;
      for (const file of [
        'one.ts',
        'arbitrary/nested/two.ts',
        '__tests__/skip.ts',
        'node_modules/skip.ts',
        'ignored.test.ts',
      ])
        writeFileSync(path.join(root, file), broken);
      writeFileSync(path.join(root, 'build/kept.ts'), broken);
      const result = analyzeProductionCallbacks({ sourceRoot: root, contracts });
      expect(result.filesScanned).toBe(3);
      expect(result.findings).toHaveLength(3);
      expect(result.findings.every((finding) => finding.line === 1 && finding.column > 0)).toBe(
        true,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
