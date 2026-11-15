import { describe, expect, it } from 'vitest';
import { libraryProject as untypedLibraryProject } from '../../../../shared/rules/stability/test-support/library-project.mjs';
import { analyzeCoupling, type CouplingOptions } from './test-support/analyze-view.mts';
import { LIBRARY_ROOT, libraryGraph } from './test-support/library-graph.mts';

const libraryProject: (options?: {
  readonly withFines?: boolean;
  readonly adaptersImplementFace?: boolean;
}) => { readonly uses: string[][] } = untypedLibraryProject;

const FIX =
  "Depend on the other side's public face, or move the code that joins them into the composition root.";

function directions(uses: readonly (readonly string[])[], options?: CouplingOptions) {
  return analyzeCoupling(libraryGraph(uses), LIBRARY_ROOT, options).stabilityDirection;
}

function onlyDirection<T>(found: readonly T[]): T {
  const [first] = found;
  if (first === undefined) {
    throw new RangeError('Expected a stability direction');
  }
  return first;
}

function pairs(found: readonly { readonly source: string; readonly target: string }[]) {
  return found.map(({ source, target }) => `${source} -> ${target}`);
}

describe('stability direction over TypeScript features, with the default source root', () => {
  it.each([{}, { withFines: true }, { withFines: true, adaptersImplementFace: true }])(
    'passes the library with %j, a new feature reusing three others through index.ts',
    (options) => {
      expect(directions(libraryProject(options).uses)).toEqual([]);
    },
  );

  it('does not report the composition root, which wires every feature', () => {
    const { uses } = libraryProject({ withFines: true });

    expect(directions([...uses, ['main', 'shared']])).toEqual([]);
  });

  it('measures shared code as its own folder against whole features', () => {
    const { uses } = libraryProject({ withFines: true });
    const { cause, sourceInstability, targetInstability, delta, ...direction } = onlyDirection(
      directions([...uses, ['shared', 'members:face']]),
    );

    expect(direction).toEqual({
      source: 'src/main/shared',
      target: 'src/main/features/members',
      message: `Keep feature dependencies pointing at more stable units: folder src/main/shared (instability 0.1111) depends on feature src/main/features/members (instability 0.2). ${FIX}`,
    });
    expect(sourceInstability).toBeCloseTo(0.1111, 4);
    expect(targetInstability).toBeCloseTo(0.2, 4);
    expect(delta).toBeCloseTo(0.0889, 4);
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
