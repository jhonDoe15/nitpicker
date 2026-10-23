import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { moduleManifest } from './maven-build.mjs';
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
});
