import { describe, expect, it } from 'vitest';
import {
  buildRunsArchRules,
  runsArchRules,
  usesSpring,
  withDeclaredSpring,
  withFeatureFolders,
} from './arch-rules-gate.mjs';

const classpaths = (...jars) => ({ mainCompile: jars.map((jar) => `/repo/${jar}`) });

describe('usesSpring', () => {
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
  it('is true for a Spring module only', () => {
    expect([
      runsArchRules(classpaths('spring-context-6.2.10.jar')),
      runsArchRules(classpaths('guava.jar')),
    ]).toEqual([true, false]);
  });
});

describe('withDeclaredSpring and withFeatureFolders', () => {
  it('turn on the architecture rules for a declared Spring build and for a checkout with feature folders', () => {
    expect([
      withDeclaredSpring({ spring: false, springArch: false }, true),
      withDeclaredSpring({ spring: false, springArch: false }, undefined),
      withFeatureFolders({ spring: false, springArch: false }, true),
      withFeatureFolders({ spring: true, springArch: true }, undefined),
      withFeatureFolders({ spring: false, springArch: false }, undefined),
    ]).toEqual([
      { spring: true, springArch: true },
      { spring: false, springArch: false },
      { spring: false, springArch: true },
      { spring: true, springArch: true },
      { spring: false, springArch: false },
    ]);
  });
});

describe('buildRunsArchRules', () => {
  it('resolves ArchUnit for a declared Spring build, feature folders or a Spring module', () => {
    const plain = [{ classpaths: classpaths('guava.jar') }];

    expect([
      buildRunsArchRules({ spring: true }, plain),
      buildRunsArchRules({ featureFolders: true }, plain),
      buildRunsArchRules({}, [{ classpaths: classpaths('spring-boot-3.5.5.jar') }]),
      buildRunsArchRules({}, plain),
    ]).toEqual([true, true, true, false]);
  });
});
