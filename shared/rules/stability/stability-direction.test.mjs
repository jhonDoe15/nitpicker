import { describe, expect, it } from 'vitest';
import { computeCoupling } from '../coupling.mjs';
import { featureRoleContract, PUBLIC_FACES } from '../features/feature-roles.mjs';
import { STABILITY_FIX } from './stability-direction.mjs';
import { libraryGraph, libraryProject } from './test-support/library-project.mjs';

const roleOf = featureRoleContract({}, PUBLIC_FACES.jvm);

function directions(uses, options = {}) {
  return computeCoupling({ ...libraryGraph(uses), ...options }).stabilityDirection;
}

function pairs(found) {
  return found.map(({ source, target }) => `${source} -> ${target}`).sort();
}

const FACADE_PAIRS = ['catalog', 'fines', 'loans', 'members'].map(
  (name) => `src/features/${name} -> src/features/${name}/adapters`,
);

describe('stability direction without feature folders', () => {
  it('keeps the per-package rule: a new feature makes every facade edge an inversion', () => {
    const { uses } = libraryProject({ withFines: true });

    expect(pairs(directions(uses))).toEqual(FACADE_PAIRS);
    expect(directions(libraryProject().uses)).toEqual([]);
  });

  it('measures the package instabilities the package metrics report', () => {
    const { uses } = libraryProject({ withFines: true });
    const metrics = computeCoupling(libraryGraph(uses));
    const instability = new Map(metrics.packages.map((entry) => [entry.name, entry.instability]));

    for (const direction of metrics.stabilityDirection) {
      expect(direction.sourceInstability).toBe(instability.get(direction.source));
      expect(direction.targetInstability).toBe(instability.get(direction.target));
      expect(direction.message).toBeUndefined();
    }
  });
});

describe('stability direction with feature folders', () => {
  it('passes a new feature that reuses three others through their public face', () => {
    expect(directions(libraryProject({ withFines: true }).uses, { roleOf })).toEqual([]);
  });

  it('passes adapters that implement the interfaces of their own top package', () => {
    const { uses } = libraryProject({ withFines: true, adaptersImplementFace: true });

    expect(pairs(directions(uses))).toEqual(FACADE_PAIRS);
    expect(directions(uses, { roleOf })).toEqual([]);
  });

  it('still checks an edge between two internal packages of one feature', () => {
    const { uses } = libraryProject({ withFines: true });
    const internal = [
      ['catalog:domain', 'catalog:adapters'],
      ['catalog:adapters', 'loans:face'],
    ];

    expect(directions([...uses, ...internal], { roleOf })).toEqual([
      {
        source: 'src/features/catalog/domain',
        target: 'src/features/catalog/adapters',
        sourceInstability: 0.5,
        targetInstability: 0.6,
        delta: 0.1,
        cause: {
          files: ['src/features/catalog/domain/model.x'],
          contributors: [
            { file: 'src/features/catalog/adapters/store.x', unit: 'feature catalog' },
            { file: 'src/features/catalog/api.x', unit: 'feature catalog' },
            { file: 'src/features/loans/api.x', unit: 'feature loans' },
            { file: 'src/shared/ids.x', unit: 'package src/shared' },
          ],
        },
      },
    ]);
  });

  it('measures a feature as one unit and reports it on the feature folder with the fix', () => {
    const { uses } = libraryProject({ withFines: true });
    const [{ cause, ...direction }] = directions([...uses, ['catalog:domain', 'fines:face']], {
      roleOf,
    });

    expect(direction).toEqual({
      source: 'src/features/catalog',
      target: 'src/features/fines',
      sourceInstability: 0.5,
      targetInstability: 0.6667,
      delta: 0.1667,
      path: 'src/features/catalog',
      message: `Feature catalog (src/features/catalog) depends on less stable feature fines (src/features/fines). ${STABILITY_FIX}`,
    });
    expect(cause.files).toEqual([
      'src/features/catalog/adapters/store.x',
      'src/features/catalog/api.x',
      'src/features/catalog/domain/model.x',
    ]);
  });

  it('names a package that depends on a less stable feature', () => {
    const { uses } = libraryProject({ withFines: true });
    const [direction] = directions([...uses, ['shared', 'members:face']], { roleOf });

    expect(direction.message).toBe(
      `Package src/shared depends on less stable feature members (src/features/members). ${STABILITY_FIX}`,
    );
    expect(direction.path).toBe('src/shared');
  });
});
