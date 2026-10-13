import { describe, expect, it } from 'vitest';
import { configuredAnalyzers } from '../languages/typescript/preset/diff/configured-analyzers.mjs';
import { resolveHeadPolicy } from '../languages/typescript/preset/head-policy.mjs';
import { createPythonAnalyzers } from '../languages/python/adapters/python-analyzer.mjs';
import { configureAnalyzers } from './configure-analyzers.mjs';

describe('configureAnalyzers', () => {
  it('applies disable, custom analyzers and the legacy inventory in one place', () => {
    const config = {
      disable: ['duplicates'],
      analyzers: [{ name: 'house-rules', command: './check.sh' }],
      legacyInventory: 'config/legacy.json',
    };

    const configured = configureAnalyzers(configuredAnalyzers, config, resolveHeadPolicy(config));
    const names = configured.map(({ name }) => name);

    expect(names).not.toContain('duplicates');
    expect(names).toContain('house-rules');
    expect(configured.find(({ name }) => name === 'coding-standards').legacyInventory).toBe(
      'config/legacy.json',
    );
  });

  it('hands the exclude globs and the snapshot to both Python analyzers', () => {
    const config = { preset: 'python', exclude: ['gen/**'] };
    const context = { projectRoot: '/p', toolRoot: '/t', liveProjectRoot: '/p', snapshot: 'base' };

    const configured = configureAnalyzers(
      createPythonAnalyzers(),
      config,
      resolveHeadPolicy(config),
    );

    expect(configured.map(({ name }) => name)).toEqual(['python', 'mutation']);
    for (const analyzer of configured) {
      expect(analyzer.createInvocation(context).args).toEqual(
        expect.arrayContaining(['--exclude', 'gen/**', '--snapshot', 'base']),
      );
    }
  });

  it('leaves the mutation analyzer of another preset alone', () => {
    const config = { preset: 'typescript', exclude: ['gen/**'] };

    const configured = configureAnalyzers(configuredAnalyzers, config, resolveHeadPolicy(config));
    const mutation = configured.find(({ name }) => name === 'mutation');
    const context = { projectRoot: '/p', policyRoot: '/p', toolRoot: '/t', snapshot: 'head' };

    expect(mutation.createInvocation(context).args).not.toContain('--exclude');
  });

  it('lets a Python project disable mutation testing alone, but not the analyzer it depends on', () => {
    const configure = (disable) => {
      const config = { preset: 'python', disable };
      return configureAnalyzers(createPythonAnalyzers(), config, resolveHeadPolicy(config));
    };

    expect(configure(['mutation']).map(({ name }) => name)).toEqual(['python']);
    expect(() => configure(['python'])).toThrow(
      '"disable" cannot disable python because mutation depends on it',
    );
  });
});
