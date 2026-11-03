import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { moduleManifest } from './manifest/maven-manifest.mjs';
import { buildAndTest } from './maven-build.mjs';
import { readReactor } from './maven-project.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function singleModule() {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-maven-manifest-'));
  roots.push(root);
  writeFileSync(
    path.join(root, 'pom.xml'),
    '<project><groupId>demo</groupId><artifactId>shop</artifactId></project>',
  );
  const [module] = readReactor(
    root,
    `<?xml version="1.0"?>
<project>
  <groupId>demo</groupId>
  <artifactId>shop</artifactId>
  <build>
    <sourceDirectory>${root}/src/main/java</sourceDirectory>
    <testSourceDirectory>${root}/src/test/java</testSourceDirectory>
    <resources><resource><directory>${root}/src/main/resources</directory></resource></resources>
  </build>
</project>
`,
  );
  return module;
}

describe('moduleManifest', () => {
  it('marks a Spring module and lists its roots relative to the module', () => {
    const pinned = { pmd: '7.7.0' };

    expect(
      moduleManifest({
        module: singleModule(),
        classpaths: { mainCompile: ['/m2/spring-boot-3.3.5.jar'], testCompile: [] },
        pinned,
      }),
    ).toEqual({
      versions: pinned,
      build: 'maven',
      sourceRoots: ['src/main/java'],
      kotlinSourceRoots: [],
      testSourceRoots: ['src/test/java'],
      resourceRoots: ['src/main/resources'],
      spring: true,
      springArch: true,
      guava: false,
      testGuava: false,
      testAwaitility: false,
      published: false,
      runsFailsafe: false,
    });
  });

  it.each([
    [['/m2/spring-context-6.1.14.jar'], true],
    [['/m2/spring-core-6.1.14.jar', '/m2/spring-web-6.1.14.jar'], false],
    [[], false],
  ])(
    'reads Spring from spring-context or spring-boot on the main classpath: %j',
    (jars, spring) => {
      const classpaths = { mainCompile: jars, testCompile: ['/m2/spring-boot-test-3.3.5.jar'] };

      const manifest = moduleManifest({ module: singleModule(), classpaths, pinned: {} });

      expect([manifest.spring, manifest.springArch]).toEqual([spring, spring]);
    },
  );

  it('runs the architecture rules, but not the Spring rules, for a module with jMolecules only', () => {
    const classpaths = { mainCompile: ['/m2/jmolecules-ddd-2.0.1.jar'], testCompile: [] };

    const manifest = moduleManifest({ module: singleModule(), classpaths, pinned: {} });

    expect([manifest.spring, manifest.springArch]).toEqual([false, true]);
  });
});

describe('buildAndTest', () => {
  function mavenArguments(module) {
    const calls = [];
    buildAndTest({
      projectRoot: '/repo',
      maven: 'mvn',
      work: '/work',
      pinned: { jacoco: '0.8.12' },
      modules: [module],
      spawn: (command, args) => {
        calls.push(args);
        return { status: 0, stdout: '', stderr: '' };
      },
    });
    return calls[0];
  }

  it.each([
    ['Surefire', false, 'test'],
    ['Failsafe', true, 'verify'],
  ])('keeps failing tests and turns reruns off for %s', (_name, runsFailsafe, phase) => {
    const args = mavenArguments({ ...singleModule(), runsFailsafe });

    expect([
      args.includes(phase),
      args.filter((arg) => /^-D(?:maven\.test\.failure|\w+\.rerun)/u.test(arg)),
    ]).toEqual([
      true,
      [
        '-Dmaven.test.failure.ignore=true',
        '-Dsurefire.rerunFailingTestsCount=0',
        '-Dfailsafe.rerunFailingTestsCount=0',
      ],
    ]);
  });
});
