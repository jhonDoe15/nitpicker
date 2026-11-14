import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { temporaryTrees } from '../../test-support/temporary-trees.mts';
import { moduleManifest } from '../manifest/maven-manifest.mts';
import { buildAndTest } from '../quick/maven-test-phase.mts';
import { readReactor } from '../maven-project.mts';
import type { ModuleDescription } from '../typed/module-description.mts';
import { fieldOf, textOf } from '../../../../shared/values/readers.mts';
import { checkoutModulePath as untypedCheckoutModulePath } from '../../../../shared/paths/checkout-module.mjs';

const checkoutModulePath: (file: string) => string = untypedCheckoutModulePath;
const trees = temporaryTrees('nitpicker-maven-manifest-');

afterEach(trees.cleanup);

function singleModule(): ModuleDescription {
  const root = trees.tree({
    'pom.xml': '<project><groupId>demo</groupId><artifactId>shop</artifactId></project>',
  });
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
  if (module === undefined) {
    throw new Error('The reactor has no module');
  }
  return module;
}

describe('moduleManifest', () => {
  it('marks a Spring module and lists its roots relative to the module', () => {
    const pinned = { pmd: '7.7.0' };

    expect(
      moduleManifest({
        module: singleModule(),
        classpaths: {
          mainCompile: ['/m2/spring-boot-3.3.5.jar'],
          mainRuntime: [],
          testCompile: ['/m2/spring-boot-test-3.3.5.jar'],
          testRuntime: ['target/test-classes', 'target/classes', '/m2/spring-boot-3.3.5.jar'],
        },
        pinned,
      }),
    ).toEqual({
      versions: pinned,
      build: 'maven',
      sourceRoots: ['src/main/java'],
      kotlinSourceRoots: [],
      testSourceRoots: ['src/test/java'],
      kotlinTestSourceRoots: [],
      resourceRoots: ['src/main/resources'],
      spring: true,
      springArch: true,
      springClasspath: [
        'target/test-classes',
        'target/classes',
        '/m2/spring-boot-3.3.5.jar',
        '/m2/spring-boot-test-3.3.5.jar',
      ],
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
      const classpaths = {
        mainCompile: jars,
        mainRuntime: [],
        testCompile: ['/m2/spring-boot-test-3.3.5.jar'],
        testRuntime: [],
      };

      const manifest = moduleManifest({ module: singleModule(), classpaths, pinned: {} });

      expect([manifest['spring'], manifest['springArch']]).toEqual([spring, spring]);
    },
  );

  it('runs the architecture rules, but not the Spring rules, for a module with jMolecules only', () => {
    const classpaths = {
      mainCompile: ['/m2/jmolecules-ddd-2.0.1.jar'],
      mainRuntime: [],
      testCompile: [],
      testRuntime: [],
    };

    const manifest = moduleManifest({ module: singleModule(), classpaths, pinned: {} });

    expect([manifest['spring'], manifest['springArch']]).toEqual([false, true]);
  });
});

describe('buildAndTest', () => {
  function mavenArguments(module: ModuleDescription): readonly string[] {
    const calls: (readonly string[])[] = [];
    buildAndTest({
      projectRoot: '/repo',
      maven: 'mvn',
      work: '/work',
      timeoutMs: undefined,
      quick: false,
      pinned: { jacoco: '0.8.12' },
      modules: [module],
      spawn: (_command: string, args: readonly string[]) => {
        calls.push(args);
        return { status: 0, stdout: '', stderr: '' };
      },
    });
    return calls[0] ?? [];
  }

  it.each([
    ['Surefire', false, 'test'],
    ['Failsafe', true, 'verify'],
  ])(
    'keeps failing tests and turns reruns off for %s',
    (_name: string, runsFailsafe: boolean, phase: string) => {
      const args = mavenArguments({ ...singleModule(), runsFailsafe });

      expect([
        args.includes(phase),
        args.filter((arg: string) => /^-D(?:maven\.test\.failure|\w+\.rerun)/u.test(arg)),
      ]).toEqual([
        true,
        [
          '-Dmaven.test.failure.ignore=true',
          '-Dsurefire.rerunFailingTestsCount=0',
          '-Dfailsafe.rerunFailingTestsCount=0',
        ],
      ]);
    },
  );

  it('skips Spring AOT processing unless the tests run in AOT mode', () => {
    const aotArguments = (module: Partial<ModuleDescription>): string[] =>
      mavenArguments({ ...singleModule(), ...module }).filter((arg: string) => arg.includes('aot'));

    expect([
      aotArguments({ testJvmArgs: [] }),
      aotArguments({ testJvmArgs: ['-Dspring.aot.enabled=true'] }),
    ]).toEqual([['-Dspring-boot.aot.skip=true'], []]);
  });
});

describe('the tools a module runs in parallel processes', () => {
  it('names each tool function in the module that a process imports it from', async () => {
    const directory = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(path.join(directory, 'maven-module.mts'), 'utf8');
    const urls = Object.fromEntries(
      [...source.matchAll(/const (\w+_URL) =[^']*new URL\('([^']+)'/gu)].map(([, name, file]) => [
        textOf(name),
        pathToFileURL(checkoutModulePath(path.join(directory, textOf(file)))).href,
      ]),
    );
    const tasks = [...source.matchAll(/sourceTask\(\s*(\w+),\s*(\w+_URL)/gu)];
    const exported = await Promise.all(
      tasks.map(async ([, tool, url]) => [
        tool,
        typeof fieldOf(await import(textOf(urls[textOf(url)])), textOf(tool)),
      ]),
    );

    expect(tasks.length).toBeGreaterThan(5);
    expect(exported.filter(([, type]) => type !== 'function')).toEqual([]);
  });
});
