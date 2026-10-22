import { describe, expect, it } from 'vitest';
import { moduleClasspaths, parseDependencyList, usesSpring } from './maven-classpaths.mjs';

describe('parseDependencyList', () => {
  it('reads coordinates, scope and file, with classifiers, module names, optional markers and drive letters', () => {
    const listing = [
      '',
      'The following files have been resolved:',
      '   org.junit.jupiter:junit-jupiter-api:jar:5.11.0:test:/m2/junit-jupiter-api-5.11.0.jar -- module org.junit.jupiter.api',
      '   demo:core:jar:tests:1.0:test:/work/core/target/test-classes',
      '   demo:shared:jar:1.0:compile:C:\\work\\shared\\target\\classes (optional)',
      '   demo:z:jar:runtime:1.0:compile:/m2/z-1.0-runtime.jar',
      '   none',
    ].join('\n');

    expect(parseDependencyList(listing)).toEqual([
      {
        groupId: 'org.junit.jupiter',
        artifactId: 'junit-jupiter-api',
        type: 'jar',
        scope: 'test',
        file: '/m2/junit-jupiter-api-5.11.0.jar',
      },
      {
        groupId: 'demo',
        artifactId: 'core',
        type: 'jar',
        scope: 'test',
        file: '/work/core/target/test-classes',
      },
      {
        groupId: 'demo',
        artifactId: 'shared',
        type: 'jar',
        scope: 'compile',
        file: 'C:\\work\\shared\\target\\classes',
      },
      {
        groupId: 'demo',
        artifactId: 'z',
        type: 'jar',
        scope: 'compile',
        file: '/m2/z-1.0-runtime.jar',
      },
    ]);
  });
});

describe('moduleClasspaths', () => {
  it('keeps compile scopes for main code, adds test for test code, and everything at test runtime', () => {
    const module = { outputDirectory: '/m/classes', testOutputDirectory: '/m/test-classes' };
    const dependencies = ['compile', 'provided', 'runtime', 'test', 'system'].map((scope) => ({
      scope,
      file: `${scope}.jar`,
    }));

    expect(moduleClasspaths(module, dependencies)).toEqual({
      mainCompile: ['compile.jar', 'provided.jar', 'system.jar'],
      testCompile: ['compile.jar', 'provided.jar', 'test.jar', 'system.jar'],
      testRuntime: [
        '/m/test-classes',
        '/m/classes',
        'compile.jar',
        'provided.jar',
        'runtime.jar',
        'test.jar',
        'system.jar',
      ],
    });
  });
});

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
