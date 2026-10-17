import { describe, expect, it } from 'vitest';
import { useGitFixtures } from '../../diff/git/test-support/git-repository.mjs';
import { policyChangeFields } from '../describe-policy-changes.mjs';
import { readPolicyScope } from '../policy-scope.mjs';

const { createGitRepository } = useGitFixtures();
const JAVA = { preset: 'java' };
const CLASS = 'package a;\nclass A {}\n';

function between({ base, head, config = JAVA }) {
  const scope = readPolicyScope({
    baseConfig: config,
    headConfig: config,
    baseProjectRoot: createGitRepository(base).root,
    headProjectRoot: createGitRepository(head).root,
  });
  return policyChangeFields(config, config, scope);
}

function gradle(buildScript, extra = {}) {
  return {
    'build.gradle': buildScript,
    'src/main/java/a/A.java': CLASS,
    'src/test/java/a/slow/SlowTest.java': CLASS,
    'src/test/java/a/FastTest.java': CLASS,
    ...extra,
  };
}

function maven(pluginsXml, buildXml = '') {
  return {
    'pom.xml': `<project><modelVersion>4.0.0</modelVersion><build>${buildXml}<plugins>${pluginsXml}</plugins></build></project>`,
    'src/main/java/a/A.java': CLASS,
    'src/test/java/a/slow/SlowTest.java': CLASS,
  };
}

const surefire = (configuration) =>
  `<plugin><artifactId>maven-surefire-plugin</artifactId><configuration>${configuration}</configuration></plugin>`;

describe('Gradle build files', () => {
  it('counts a source set that stops listing a folder with checked code as loosening', () => {
    const head = gradle("sourceSets { main { java { srcDirs = ['src/core/java'] } } }\n");

    expect(between({ base: gradle("plugins { id 'java' }\n"), head }).policyLoosenings).toEqual([
      'Gradle source set main in build.gradle no longer includes checked code: src/main/java/a/A.java',
    ]);
  });

  it('lets a source set add folders and a Kotlin DSL script respell the default', () => {
    const added = gradle("sourceSets { main { java { srcDir 'src/gen/java' } } }\n");
    const respelled = {
      'build.gradle.kts': 'sourceSets { main { java.setSrcDirs(listOf("src/main/java")) } }\n',
      'src/main/java/a/A.java': CLASS,
    };

    expect(between({ base: gradle(''), head: added }).policyLoosenings).toEqual([]);
    expect(
      between({ base: { ...respelled, 'build.gradle.kts': '\n' }, head: respelled })
        .policyLoosenings,
    ).toEqual([]);
  });

  it('counts a test exclude that covers a checked test, and only lists one that covers nothing', () => {
    const covering = gradle("test { exclude '**/slow/**' }\n");
    const idle = gradle("test { exclude '**/nothing/**' }\n");
    const base = gradle("plugins { id 'java' }\n");

    expect(between({ base, head: covering }).policyLoosenings).toEqual([
      'Gradle test excludes in build.gradle added: **/slow/**',
    ]);
    expect(between({ base, head: idle })).toMatchObject({
      policyLoosenings: [],
      policyChanges: [
        'Gradle test excludes in build.gradle added: **/nothing/** (covers no checked file it did not cover before)',
      ],
    });
  });

  it('counts test tag and name filters, a disabled test task and source excludes', () => {
    const base = gradle("plugins { id 'java' }\n");
    const head = gradle(
      [
        "test { useJUnitPlatform { excludeTags 'slow' } }",
        "tasks.withType(Test) { filter { excludeTestsMatching 'a.slow.*' } }",
        "sourceSets { main { java { exclude '**/A.java' } } }",
      ].join('\n'),
    );

    expect(between({ base, head }).policyLoosenings).toEqual([
      'Gradle test excludes in build.gradle added: slow',
      'Gradle test excludes in build.gradle added: a.slow.*',
      'Gradle source set excludes in build.gradle added: **/A.java',
    ]);
  });

  it('ignores excludes that are not about tests or sources', () => {
    const head = gradle(
      "dependencies { implementation('x:y') { exclude group: 'g' } }\njar { exclude '**/A.class' }\n",
    );

    expect(between({ base: gradle(''), head }).policyLoosenings).toEqual([]);
  });

  it('counts a build file removed from a module that still has code', () => {
    const { 'build.gradle': _removed, ...head } = gradle('');

    expect(between({ base: gradle(''), head }).policyLoosenings).toEqual([
      'Gradle source set main in build.gradle no longer includes checked code: src/main/java/a/A.java',
      'Gradle source set test in build.gradle no longer includes checked code: src/test/java/a/FastTest.java, src/test/java/a/slow/SlowTest.java',
    ]);
  });
});

describe('Maven build files', () => {
  it('counts a sourceDirectory that leaves checked code out', () => {
    const base = maven('');
    const head = maven('', '<sourceDirectory>src/core/java</sourceDirectory>');

    expect(between({ base, head }).policyLoosenings).toEqual([
      'Maven main source directories in pom.xml no longer includes checked code: src/main/java/a/A.java',
    ]);
  });

  it('keeps a source directory that build-helper adds beside the default', () => {
    const helper =
      '<plugin><artifactId>build-helper-maven-plugin</artifactId><configuration><sources><source>src/gen/java</source></sources></configuration></plugin>';

    expect(between({ base: maven(''), head: maven(helper) }).policyLoosenings).toEqual([]);
  });

  it('counts surefire and failsafe excludes, excluded groups and skips', () => {
    const head = maven(
      `${surefire('<excludes><exclude>**/slow/*.java</exclude></excludes><excludedGroups>slow</excludedGroups><skipTests>true</skipTests>')}<plugin><artifactId>maven-compiler-plugin</artifactId><configuration><excludes><exclude>**/A.java</exclude></excludes></configuration></plugin>`,
    );

    expect(between({ base: maven(''), head }).policyLoosenings).toEqual([
      'Maven test excludes in pom.xml added: **/slow/*.java',
      'Maven test excludes in pom.xml added: slow',
      'Maven test excludes in pom.xml added: skipTests = true',
      'Maven compiler excludes in pom.xml added: **/A.java',
    ]);
  });

  it('tolerates a pom that is not valid XML', () => {
    const head = { 'pom.xml': '<project>', 'src/main/java/a/A.java': CLASS };

    expect(between({ base: head, head }).policyLoosenings).toEqual([]);
  });
});

describe('Python test selection', () => {
  const PYTHON = { preset: 'python' };
  const files = (pyproject) => ({
    'pyproject.toml': pyproject,
    'src/app/__init__.py': '',
    'src/app/core.py': 'x = 1\n',
    'tests/test_core.py': 'def test_x():\n    pass\n',
    'src/app/test_inner.py': 'def test_y():\n    pass\n',
  });
  const run = (base, head) => between({ base: files(base), head: files(head), config: PYTHON });

  it('counts testpaths that leave collected tests out', () => {
    expect(
      run(
        '[tool.pytest.ini_options]\naddopts = "-q"\n',
        '[tool.pytest.ini_options]\ntestpaths = ["tests"]\n',
      ).policyLoosenings,
    ).toEqual(['pytest testpaths no longer includes checked code: src/app/test_inner.py']);
  });

  it('keeps testpaths that still hold every test, and a removed list', () => {
    const wide = '[tool.pytest.ini_options]\ntestpaths = ["tests", "src"]\n';

    expect(run('[tool.pytest.ini_options]\naddopts = "-q"\n', wide).policyLoosenings).toEqual([]);
    expect(
      run(
        '[tool.pytest.ini_options]\ntestpaths = ["tests"]\n',
        '[tool.pytest.ini_options]\naddopts = "-q"\n',
      ).policyLoosenings,
    ).toEqual([]);
  });

  it('counts an added --ignore, --ignore-glob or --deselect that covers a test', () => {
    expect(
      run(
        '[tool.pytest.ini_options]\naddopts = "-q"\n',
        '[tool.pytest.ini_options]\naddopts = "-q --ignore=tests --deselect src/app/test_inner.py::test_y"\n',
      ).policyLoosenings,
    ).toEqual([
      'pytest addopts --ignore, --ignore-glob and --deselect added: tests',
      'pytest addopts --ignore, --ignore-glob and --deselect added: src/app/test_inner.py::test_y',
    ]);
  });

  it('counts a mutmut do_not_mutate pattern that covers production code', () => {
    const base = '[tool.mutmut]\npaths_to_mutate = "src"\n';
    const head =
      '[tool.mutmut]\npaths_to_mutate = "src"\ndo_not_mutate = ["src/app/core.py", "docs/*"]\n';

    expect(run(base, head)).toMatchObject({
      policyLoosenings: ['mutmut do_not_mutate added: src/app/core.py'],
      policyChanges: [
        'mutmut do_not_mutate added: src/app/core.py',
        'mutmut do_not_mutate added: docs/* (covers no checked file it did not cover before)',
      ],
    });
  });
});
