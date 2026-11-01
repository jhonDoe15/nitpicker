import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  nestedCheckout,
  useGitCheckouts,
} from '../../../../core/diff/git/test-support/git-checkout.mjs';
import { useProjectFixtures } from '../../../../core/diff/git/test-support/projects/project-fixtures.mjs';
import { useGitFixtures } from '../../../../core/diff/git/test-support/git-repository.mjs';
import {
  resolveHeadPolicy,
  withHeadCheckoutFacts,
} from '../../../typescript/preset/head-policy.mjs';
import { resolveProjectHeadPolicy } from '../../../../core/conventions/project-head-policy.mjs';
import { declaresSpring, javaHeadFacts } from './head-facts.mjs';
import { analyzeJavaSnapshot, readRunnerPolicy } from '../java-runner.mjs';

const { createGitRepository } = useGitFixtures();
const { gitCheckout } = useGitCheckouts();
const { outsideGit } = useProjectFixtures();
const roots = [];
const fakeGradle = path.resolve(import.meta.dirname, '../fixtures/fake-gradle.mjs');

function gradleArguments(policy) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-head-facts-gradle-')));
  roots.push(root);
  analyzeJavaSnapshot(root, { gradle: fakeGradle, policy });
  return JSON.parse(readFileSync(path.join(root, 'build/gradle-args.json'), 'utf8'));
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function declares(files) {
  return declaresSpring(createGitRepository(files).root);
}

describe('declaresSpring', () => {
  it.each([
    [
      'a Gradle plugin',
      { 'build.gradle': "plugins { id 'org.springframework.boot' version '3.3.0' }\n" },
    ],
    [
      'a Kotlin DSL dependency',
      {
        'app/build.gradle.kts':
          'dependencies { implementation("org.springframework.boot:spring-boot-starter-web") }\n',
      },
    ],
    [
      'a version catalog module',
      {
        'gradle/libs.versions.toml':
          '[libraries]\nweb = { module = "org.springframework.boot:spring-boot-starter-web" }\n',
      },
    ],
    [
      'a Maven dependency',
      {
        'pom.xml':
          '<project><dependencies><dependency><groupId>org.springframework</groupId><artifactId>spring-context</artifactId></dependency></dependencies></project>',
      },
    ],
  ])('finds Spring in %s', (_name, files) => {
    expect(declares(files)).toBe(true);
  });

  it('ignores a build without Spring and one that only mentions it in a comment', () => {
    expect(declares({ 'build.gradle': "plugins { id 'java' }\n" })).toBe(false);
    expect(
      declares({
        'build.gradle':
          "// org.springframework.boot is next\n/* org.springframework */\nplugins { id 'java' }\n",
      }),
    ).toBe(false);
    expect(declares({ 'pom.xml': '<project><!-- org.springframework --></project>' })).toBe(false);
  });

  it('reads the build files of the Git checkout, not ignored folders or nested checkouts', () => {
    const spring = "plugins { id 'org.springframework.boot' }\n";
    const root = gitCheckout(
      {
        'build.gradle': "plugins { id 'java' }\n",
        'scratch/build.gradle': spring,
        ...nestedCheckout('agent', { 'build.gradle': spring }),
      },
      ['scratch/'],
    );

    expect(declaresSpring(root)).toBe(false);
    expect(declaresSpring(gitCheckout({ 'app/build.gradle': spring }))).toBe(true);
  });

  it('reads the build files of a folder outside Git', () => {
    const root = outsideGit({ 'pom.xml': '<project>org.springframework</project>' });

    expect(declaresSpring(root)).toBe(true);
  });
});

describe('javaHeadFacts', () => {
  const kotlinBuild = (formatter) => ({
    'build.gradle.kts': `plugins { kotlin("jvm") ${formatter} }\n`,
  });

  it('reads the formatter the Kotlin build declares, unless the config pins one', () => {
    const root = createGitRepository(kotlinBuild('id("org.jlleitschuh.gradle.ktlint")')).root;

    expect(javaHeadFacts(root, { preset: 'kotlin' }).kotlin).toEqual({ formatter: 'ktlint' });
    expect(
      javaHeadFacts(root, { preset: 'kotlin', kotlin: { formatter: 'none' } }).kotlin?.formatter,
    ).toBe('none');
    expect(
      javaHeadFacts(createGitRepository(kotlinBuild('')).root, { preset: 'kotlin' }).kotlin
        ?.formatter,
    ).toBe('none');
  });

  it('reports no Kotlin facts for Java, and Spring only when declared', () => {
    const root = createGitRepository({
      'build.gradle': "plugins { id 'org.springframework.boot' }\n",
    }).root;

    expect(javaHeadFacts(root, { preset: 'java' })).toEqual({ spring: true });
    expect(
      javaHeadFacts(createGitRepository({ 'build.gradle': '\n' }).root, { preset: 'java' }),
    ).toEqual({});
  });

  it('puts the facts in the head policy and hands them to the base policy', () => {
    const root = createGitRepository({
      'build.gradle.kts':
        'plugins { kotlin("jvm"); id("org.springframework.boot") }\ndependencies { ktfmt("x") }\n',
    }).root;
    const head = resolveProjectHeadPolicy({ preset: 'kotlin' }, root);
    const base = withHeadCheckoutFacts(
      resolveProjectHeadPolicy({ preset: 'kotlin', kotlin: { formatter: 'none' } }),
      head,
    );

    expect([head.spring, head.kotlin]).toEqual([true, { formatter: 'ktfmt' }]);
    expect([base.spring, base.kotlin]).toEqual([true, { formatter: 'ktfmt' }]);
  });

  it('leaves the facts out of the TypeScript head policy, whose policy copy has no Java modules', () => {
    const root = createGitRepository({
      'build.gradle': "plugins { id 'org.springframework.boot' }\n",
    }).root;

    expect(resolveHeadPolicy({ preset: 'java' }, root).spring).toBeUndefined();
    expect(resolveProjectHeadPolicy({ preset: 'java' }, root).spring).toBe(true);
    expect(resolveProjectHeadPolicy({ preset: 'typescript' }, root).spring).toBeUndefined();
  });

  it('reaches the runner policy from the policy file', () => {
    const directory = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-head-facts-')));
    roots.push(directory);
    const file = path.join(directory, 'policy.json');
    writeFileSync(file, JSON.stringify({ spring: true, kotlin: { formatter: 'ktlint' } }));
    const { policy } = readRunnerPolicy(['--project-root', '/p', '--kotlin-formatter', 'none'], {
      NITPICKER_POLICY: file,
    });

    expect([policy.spring, policy.kotlinFormatter]).toEqual([true, 'ktlint']);
    expect(
      readRunnerPolicy(['--project-root', '/p', '--kotlin-formatter', 'none'], {}).policy
        .kotlinFormatter,
    ).toBe('none');
  });

  it('turns Spring on and picks the formatter in the Gradle run from the policy', () => {
    const named = (policy, prefix) =>
      gradleArguments(policy).filter((argument) => argument.startsWith(prefix));

    expect(named({ spring: true }, '-Pnitpicker.spring')).toEqual(['-Pnitpicker.spring=true']);
    expect(named({}, '-Pnitpicker.spring')).toEqual([]);
    expect(
      named({ preset: 'kotlin', kotlinFormatter: 'ktfmt' }, '-Pnitpicker.kotlin.formatter'),
    ).toEqual(['-Pnitpicker.kotlin.formatter=ktfmt']);
  });
});
