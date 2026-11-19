import { describe, expect, it } from 'vitest';
import { stabilityUnits } from './feature-layout.mjs';

describe('stability units for a project whose code sits at the root', () => {
  const units = stabilityUnits({
    sourceRoot: '.',
    sharedRoots: [],
    roleOf: () => ({ kind: 'other' }),
  });

  it('groups a file by its top folder and treats root files as wiring', () => {
    expect(units.groupOf('lib/a.js')).toBe('lib');
    expect(units.groupOf('lib/deep/b.js')).toBe('lib');
    expect(units.groupOf('index.js')).toBe('index.js');
    expect(units.roleOf('index.js')).toEqual({ kind: 'wiring' });
    expect(units.roleOf('lib/a.js')).toEqual({ kind: 'other' });
  });

  it('keeps the named-root grouping', () => {
    const named = stabilityUnits({
      sourceRoot: 'src',
      sharedRoots: [],
      roleOf: () => ({ kind: 'other' }),
    });

    expect(named.groupOf('src/lib/a.ts')).toBe('src/lib');
    expect(named.groupOf('src/index.ts')).toBe('src/index.ts');
  });
});
