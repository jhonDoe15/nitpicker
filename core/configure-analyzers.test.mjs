import { describe, expect, it } from 'vitest';
import { configuredAnalyzers } from '../languages/typescript/preset/diff/configured-analyzers.mjs';
import { resolveHeadPolicy } from '../languages/typescript/preset/head-policy.mjs';
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
});
