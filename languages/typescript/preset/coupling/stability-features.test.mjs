import { describe, expect, it } from 'vitest';
import { libraryProject } from '../../../../shared/rules/stability/test-support/library-project.mjs';
import { STABILITY_FIX } from '../../../../shared/rules/stability/stability-direction.mjs';
import { analyzeCoupling } from './analyze.mjs';
import { LIBRARY_ROOT, libraryGraph } from './test-support/library-graph.mjs';

const { uses } = libraryProject({ withFines: true, adaptersImplementFace: true });

function directions(graphUses, options) {
  return analyzeCoupling(libraryGraph(graphUses), LIBRARY_ROOT, options).stabilityDirection;
}

describe('stability direction over TypeScript features', () => {
  it('passes a new feature that reuses three others through their index.ts', () => {
    expect(directions(uses)).toEqual([]);
  });

  it('keeps the per-package rule when no folder is a feature', () => {
    const packages = directions([...uses, ['shared', 'members:face']], {
      roleOf: () => ({ kind: 'other' }),
    });

    expect(packages.map(({ source, target, message }) => ({ source, target, message }))).toEqual([
      { source: 'shared', target: 'features', message: undefined },
    ]);
  });

  it('measures each feature as one unit against shared code', () => {
    const [{ cause, ...direction }] = directions([...uses, ['shared', 'members:face']]);

    expect(direction).toEqual({
      source: 'shared',
      target: `${LIBRARY_ROOT}/features/members`,
      sourceInstability: 0.1111,
      targetInstability: 0.2,
      delta: 0.0889,
      path: 'shared',
      message: `Package shared depends on less stable feature members (${LIBRARY_ROOT}/features/members). ${STABILITY_FIX}`,
    });
    expect(cause.files).toEqual([`${LIBRARY_ROOT}/shared/ids.ts`]);
  });
});
