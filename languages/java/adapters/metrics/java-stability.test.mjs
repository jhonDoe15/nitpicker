import { describe, expect, it } from 'vitest';
import { libraryProject } from '../../../../shared/rules/stability/test-support/library-project.mjs';
import { analyzeJavaCoupling, parseJdeps } from './java-coupling.mjs';
import { evaluateCoupling } from '../../../../shared/rules/coupling.mjs';
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
      'library.features.catalog -> library.features.fines',
    ]);
  });
});

describe('JVM feature units keyed by package', () => {
  const FEATURES = 'com.x.features';
  const KOTLIN = new Set([`${FEATURES}.members.adapters.Store`, `${FEATURES}.members.Stray`]);
  const CLASSES = [
    'com.x.App',
    `${FEATURES}.members.Members`,
    `${FEATURES}.members.Stray`,
    `${FEATURES}.members.domain.Member`,
    `${FEATURES}.members.adapters.Store`,
    `${FEATURES}.loans.Loans`,
    `${FEATURES}.loans.adapters.LoanStore`,
    'com.x.shared.Ids',
  ];
  const EDGES = [
    ['com.x.App', 'members.Members'],
    ['com.x.App', 'loans.Loans'],
    ['members.Members', 'members.adapters.Store'],
    ['members.Members', 'members.domain.Member'],
    ['members.adapters.Store', 'members.Members'],
    ['members.adapters.Store', 'com.x.shared.Ids'],
    ['members.domain.Member', 'com.x.shared.Ids'],
    ['loans.Loans', 'loans.adapters.LoanStore'],
    ['loans.adapters.LoanStore', 'members.Members'],
    ['loans.adapters.LoanStore', 'com.x.shared.Ids'],
    ['members.Stray', 'members.adapters.Store'],
    ['members.Stray', 'loans.Loans'],
  ].map((pair) => {
    const [source, target] = pair.map((name) =>
      name.startsWith('com.') ? name : `${FEATURES}.${name}`,
    );
    return { source, target };
  });

  function analyze(fileOf) {
    return analyzeJavaCoupling({ classes: CLASSES, edges: EDGES, fileOf });
  }

  it('keeps one feature whose classes sit in both the Java and the Kotlin source root', () => {
    const report = analyze((name) =>
      KOTLIN.has(name) && !name.endsWith('Stray')
        ? `src/main/kotlin/${name.replaceAll('.', '/')}.kt`
        : `src/main/java/${name.replaceAll('.', '/')}.java`,
    );

    expect(report.stabilityDirection).toEqual([]);
  });

  it('gives each finding one identity when a feature package also has classes outside the feature folder', () => {
    const members = 'com.x.features.members';
    const edges = [
      ['com.x.App', 'Members'],
      ['Members', 'domain.Member'],
      ['domain.Member', 'adapters.Store'],
      ['domain.StrayDomain', 'adapters.StrayAdapter'],
      ['adapters.Store', 'com.x.shared.Ids'],
      ['adapters.StrayAdapter', 'com.x.Other'],
      ['adapters.StrayAdapter', 'com.x.Third'],
      ['com.x.App', 'domain.StrayDomain'],
    ].map((pair) => {
      const [source, target] = pair.map((name) =>
        name.startsWith('com.') ? name : `${members}.${name}`,
      );
      return { source, target };
    });
    const classes = [...new Set(edges.flatMap(({ source, target }) => [source, target]))];
    const report = analyzeJavaCoupling({
      classes,
      edges,
      fileOf: (name) =>
        name.includes('Stray')
          ? `src/main/kotlin/strays/${name.split('.').at(-1)}.kt`
          : `src/main/java/${name.replaceAll('.', '/')}.java`,
    });
    const identities = evaluateCoupling(report, 'coupling').map(
      ({ path, identity }) => `${path} ${identity}`,
    );

    expect(report.stabilityDirection.map(({ source, target }) => `${source} -> ${target}`)).toEqual(
      [`${members}.domain -> ${members}.adapters`],
    );
    expect(new Set(identities).size).toBe(identities.length);
  });
});
