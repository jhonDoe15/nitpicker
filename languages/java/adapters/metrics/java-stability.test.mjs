import { describe, expect, it } from 'vitest';
import { libraryProject } from '../../../../shared/rules/stability/test-support/library-project.mjs';
import { analyzeJavaCoupling, parseJdeps } from './java-coupling.mjs';
import { libraryClasses, libraryJdeps } from './test-support/library-classes.mjs';

const JAVA = { sourceRoot: 'src/main/java', extension: 'java' };
const KOTLIN = { sourceRoot: 'src/main/kotlin', extension: 'kt' };
const NO_FEATURES = { featureRoots: [] };

const FACADE_PAIRS = ['catalog', 'fines', 'loans', 'members'].map(
  (name) => `library.features.${name} -> library.features.${name}.adapters`,
);

function pairs(project, { language, layout }) {
  const { classes, fileOf } = libraryClasses(project.uses, language);
  const report = analyzeJavaCoupling({
    classes,
    edges: parseJdeps(libraryJdeps(project.uses)),
    fileOf,
    layout,
  });
  return report.stabilityDirection.map(({ source, target }) => `${source} -> ${target}`).sort();
}

describe('stability direction over JVM feature packages', () => {
  it('passes a new Java feature that reuses three others through their top package', () => {
    const project = libraryProject({ withFines: true });

    expect(pairs(project, { language: JAVA })).toEqual([]);
    expect(pairs(project, { language: JAVA, layout: NO_FEATURES })).toEqual(FACADE_PAIRS);
  });

  it('passes Kotlin adapters that implement the interfaces of their top package', () => {
    const project = libraryProject({ withFines: true, adaptersImplementFace: true });

    expect(pairs(project, { language: KOTLIN })).toEqual([]);
    expect(pairs(project, { language: KOTLIN, layout: NO_FEATURES })).toEqual(FACADE_PAIRS);
  });

  it('reports a Java feature that depends on a less stable one on the feature folder', () => {
    const { uses } = libraryProject({ withFines: true });
    const project = { uses: [...uses, ['catalog:domain', 'fines:face']] };

    expect(pairs(project, { language: JAVA })).toEqual([
      'src/main/java/library/features/catalog -> src/main/java/library/features/fines',
    ]);
  });
});
