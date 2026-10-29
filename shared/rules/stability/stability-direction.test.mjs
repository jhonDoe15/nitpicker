import { describe, expect, it } from 'vitest';
import { computeCoupling } from '../coupling.mjs';
import { featureRoleContract, PUBLIC_FACES } from '../features/feature-roles.mjs';
import { libraryGraph, libraryProject } from './test-support/library-project.mjs';

const roleOf = featureRoleContract({}, PUBLIC_FACES.jvm);
const FIX =
  "Depend on the other side's public face, or move the code that joins them into the composition root.";

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
    const [{ cause, ...direction }] = directions([...uses, ...internal], { roleOf });

    expect(direction).toEqual({
      source: 'src/features/catalog/domain',
      target: 'src/features/catalog/adapters',
      sourceInstability: 0.5,
      targetInstability: 0.6,
      delta: 0.1,
    });
    expect(cause.folders).toEqual(['src/features/catalog/domain']);
    expect(cause.units.map(({ unit }) => unit)).toEqual([
      'package src/features/catalog',
      'package src/features/catalog/adapters',
      'package src/features/loans',
      'package src/shared',
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
      message: `Keep feature dependencies pointing at more stable units: feature src/features/catalog (instability 0.5) depends on feature src/features/fines (instability 0.6667). ${FIX}`,
    });
    expect(cause.folders).toEqual([
      'src/features/catalog',
      'src/features/catalog/adapters',
      'src/features/catalog/domain',
    ]);
    expect(cause.units.find(({ unit }) => unit === 'feature src/features/fines')).toEqual({
      unit: 'feature src/features/fines',
      folders: ['src/features/fines', 'src/features/fines/adapters', 'src/features/fines/domain'],
      files: [
        'src/features/fines/adapters/store.x',
        'src/features/fines/api.x',
        'src/features/fines/domain/model.x',
      ],
      count: 3,
    });
  });

  it('names a package that depends on a less stable feature, and leaves its path to the adapter', () => {
    const { uses } = libraryProject({ withFines: true });
    const [direction] = directions([...uses, ['shared', 'members:face']], { roleOf });

    expect(direction.message).toBe(
      `Keep feature dependencies pointing at more stable units: package src/shared (instability 0.1111) depends on feature src/features/members (instability 0.2). ${FIX}`,
    );
    expect(direction.path).toBeUndefined();
  });

  it('labels each feature by its folder, so two features of one name stay apart', () => {
    const [first, second] = ['src/a/features/catalog/api.x', 'src/b/features/catalog/api.x'];
    const edges = [
      ['src/main.x', second],
      ['src/other/x.x', second],
      [second, first],
      [first, 'src/shared/ids.x'],
      [first, 'src/shared/two.x'],
    ].map(([source, target]) => ({ source, target, kind: 'runtime' }));
    const [direction] = computeCoupling({
      modules: [...new Set(edges.flatMap(({ source, target }) => [source, target]))],
      edges,
      packageOf: (file) => file.slice(0, file.lastIndexOf('/')),
      roleOf,
    }).stabilityDirection;

    expect(direction.message).toBe(
      `Keep feature dependencies pointing at more stable units: feature src/b/features/catalog (instability 0.3333) depends on feature src/a/features/catalog (instability 0.6667). ${FIX}`,
    );
  });
});

describe('the cause of a stability direction', () => {
  it('lists at most ten units around it, three files of each and their count', () => {
    const users = Array.from({ length: 30 }, (_, index) =>
      ['a', 'b', 'c', 'd'].map((name) => `src/user${String(index)}/${name}.x`),
    ).flat();
    const edges = [
      ...users.map((source) => ({ source, target: 'src/hub/h.x' })),
      { source: 'src/hub/h.x', target: 'src/volatile/v.x' },
      { source: 'src/volatile/v.x', target: 'src/leaf/l1.x' },
      { source: 'src/volatile/v.x', target: 'src/leaf/l2.x' },
    ].map((edge) => ({ ...edge, kind: 'runtime' }));
    const [{ cause }] = computeCoupling({
      modules: [...new Set(edges.flatMap(({ source, target }) => [source, target]))],
      edges,
      packageOf: (file) => file.slice(0, file.lastIndexOf('/')),
    }).stabilityDirection;

    expect(cause.folders).toEqual(['src/hub']);
    expect(cause.units).toHaveLength(10);
    expect(cause.units.find(({ unit }) => unit === 'package src/volatile')).toEqual({
      unit: 'package src/volatile',
      folders: ['src/volatile'],
      files: ['src/volatile/v.x'],
      count: 1,
    });
    expect(cause.units.find(({ unit }) => unit === 'package src/user0')).toEqual({
      unit: 'package src/user0',
      folders: ['src/user0'],
      files: ['src/user0/a.x', 'src/user0/b.x', 'src/user0/c.x'],
      count: 4,
    });
  });
});
