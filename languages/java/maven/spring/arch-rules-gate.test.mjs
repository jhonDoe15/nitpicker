import { describe, expect, it } from 'vitest';
import { runsArchRules, usesSpring, withDeclaredSpring } from './arch-rules-gate.mjs';

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
