import { describe, expect, it } from 'vitest';
import { libraryProject } from '../../../../shared/rules/stability/test-support/library-project.mjs';
import { analyzeCoupling } from './analyze.mjs';
import { LIBRARY_ROOT, libraryGraph } from './test-support/library-graph.mjs';

const FIX =
  "Depend on the other side's public face, or move the code that joins them into the composition root.";

function directions(uses, options) {
  return analyzeCoupling(libraryGraph(uses), LIBRARY_ROOT, options).stabilityDirection;
}

function pairs(found) {
  return found.map(({ source, target }) => `${source} -> ${target}`);
}

describe('stability direction over TypeScript features, with the default source root', () => {
  it('passes the library before and after a new feature that reuses three others through index.ts', () => {
    for (const options of [
      {},
      { withFines: true },
      { withFines: true, adaptersImplementFace: true },
    ]) {
      expect(directions(libraryProject(options).uses)).toEqual([]);
    }
  });

  it('does not report the composition root, which wires every feature', () => {
    const { uses } = libraryProject({ withFines: true });

    expect(directions([...uses, ['main', 'shared']])).toEqual([]);
  });

  it('measures shared code as its own folder against whole features', () => {
    const { uses } = libraryProject({ withFines: true });
    const [{ cause, ...direction }] = directions([...uses, ['shared', 'members:face']]);

    expect(direction).toEqual({
      source: 'src/main/shared',
      target: 'src/main/features/members',
      sourceInstability: 0.1111,
      targetInstability: 0.2,
      delta: 0.0889,
      message: `Keep feature dependencies pointing at more stable units: folder src/main/shared (instability 0.1111) depends on feature src/main/features/members (instability 0.2). ${FIX}`,
    });
    expect(cause.folders).toEqual(['src/main/shared']);
  });

  it('checks an edge between two folders of one feature per folder', () => {
    const { uses } = libraryProject({ withFines: true });
    const internal = [
      ['catalog:domain', 'catalog:adapters'],
      ['catalog:adapters', 'loans:face'],
    ];

    expect(pairs(directions([...uses, ...internal]))).toEqual([
      'src/main/features/catalog/domain -> src/main/features/catalog/adapters',
    ]);
  });

  it('keeps the per-folder rule when no folder is a feature', () => {
    const { uses } = libraryProject({ withFines: true });

    const plain = { roleOf: () => ({ kind: 'other' }) };

    expect(directions(uses, plain)).toEqual([]);
    expect(pairs(directions([...uses, ['shared', 'members:face']], plain))).toEqual([
      'src/main/shared -> src/main/features',
    ]);
  });
});
