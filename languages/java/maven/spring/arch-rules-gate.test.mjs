import { describe, expect, it } from 'vitest';
import {
  buildRunsArchRules,
  runsArchRules,
  usesSpring,
  withDeclaredSpring,
  withFeatureFolders,
} from './arch-rules-gate.mjs';

const jarsOn = (...jars) => ({ mainCompile: jars.map((jar) => `/repo/${jar}`) });

describe('usesSpring', () => {
  const classpaths = (...jars) => ({ mainCompile: jars.map((jar) => `/repo/${jar}`) });

  it('is true for spring-context and spring-boot jars on the main compile classpath', () => {
    expect([
      usesSpring(classpaths('spring-context-6.2.10.jar')),
      usesSpring(classpaths('guava.jar', 'spring-boot-3.5.5.jar')),
    ]).toEqual([true, true]);
  });

  it('is false for other jars, other Spring modules and no jars', () => {
    expect([
      usesSpring(classpaths('spring-web-6.2.10.jar', 'spring-boot-starter.jar.sha1')),
      usesSpring(classpaths()),
    ]).toEqual([false, false]);
  });
});

describe('runsArchRules', () => {
  const classpaths = (...jars) => ({ mainCompile: jars.map((jar) => `/repo/${jar}`) });

  it('is true for Spring and for jmolecules-ddd on the main compile classpath', () => {
    expect([
      runsArchRules(classpaths('spring-context-6.2.10.jar')),
      runsArchRules(classpaths('jmolecules-ddd-2.0.1.jar')),
      runsArchRules(classpaths('jmolecules-layered-architecture-2.0.1.jar')),
      runsArchRules(classpaths()),
    ]).toEqual([true, true, false, false]);
  });
});

describe('withDeclaredSpring', () => {
  it('turns on Spring and the architecture rules for a declared Spring build, and keeps a jMolecules module running them', () => {
    expect([
      withDeclaredSpring({ spring: false, springArch: false }, true),
      withDeclaredSpring({ spring: false, springArch: true }, undefined),
      withDeclaredSpring({ spring: false, springArch: false }, undefined),
    ]).toEqual([
      { spring: true, springArch: true },
      { spring: false, springArch: true },
      { spring: false, springArch: false },
    ]);
  });
});

describe('withFeatureFolders', () => {
  it('turns on the architecture rules for a checkout with feature folders and keeps the others', () => {
    expect([
      withFeatureFolders({ spring: false, springArch: false }, true),
      withFeatureFolders({ spring: true, springArch: true }, undefined),
      withFeatureFolders({ spring: false, springArch: false }, undefined),
    ]).toEqual([
      { spring: false, springArch: true },
      { spring: true, springArch: true },
      { spring: false, springArch: false },
    ]);
  });
});

describe('buildRunsArchRules', () => {
  it('resolves ArchUnit for a declared Spring build, feature folders or a module that runs the rules', () => {
    const plain = [{ classpaths: jarsOn('guava.jar') }];

    expect([
      buildRunsArchRules({ spring: true }, plain),
      buildRunsArchRules({ featureFolders: true }, plain),
      buildRunsArchRules({}, [{ classpaths: jarsOn('jmolecules-ddd-2.0.1.jar') }]),
      buildRunsArchRules({}, plain),
    ]).toEqual([true, true, true, false]);
  });
});
