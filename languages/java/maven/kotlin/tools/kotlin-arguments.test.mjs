import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readPinnedTools } from '../../../builds/java-build.mjs';
import { toolDependencies } from '../../maven-tools.mjs';
import { detektArguments, detektClasspath } from './kotlin-detekt.mjs';
import { kotlinTools } from './kotlin-dependencies.mjs';
import { ktfmtArguments, ktlintArguments } from './kotlin-format.mjs';
import { programArguments } from './kotlin-programs.mjs';

const roots = [];
const module = {
  basedir: '/work/app',
  kotlin: { sourceRoots: ['/work/app/src/main/java', '/work/app/src/main/kotlin'] },
};

function tree(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-arguments-'));
  roots.push(root);
  for (const name of files) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), '');
  }
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('detekt arguments', () => {
  it('layers the project config, the one-way rules, the merged lists and the validation switch', () => {
    const detekt = path.resolve(import.meta.dirname, '../../../detekt');

    expect(
      detektArguments({
        module,
        report: '/work/app/target/nitpicker/detekt.sarif',
        options: { detektConfig: '/work/app/config/detekt.yml', detektLists: '/tmp/lists.yml' },
        classpath: ['/lib/a.jar', '/lib/b.jar'],
        home: '/jdk',
      }),
    ).toEqual([
      ...['--input', '/work/app/src/main/java,/work/app/src/main/kotlin'],
      ...['--includes', '**/*.kt'],
      ...['--report', 'sarif:/work/app/target/nitpicker/detekt.sarif'],
      ...['--base-path', '/work/app'],
      '--build-upon-default-config',
      ...[
        '--config',
        [
          '/work/app/config/detekt.yml',
          `${detekt}/nitpicker-detekt.yml`,
          '/tmp/lists.yml',
          `${detekt}/detekt-validation.yml`,
        ].join(','),
      ],
      ...['--classpath', '/lib/a.jar:/lib/b.jar'],
      ...['--jdk-home', '/jdk'],
    ]);
  });

  it('runs on the nitpicker config alone when the project has none, and without a JDK home when unknown', () => {
    const detekt = path.resolve(import.meta.dirname, '../../../detekt');

    expect(
      detektArguments({ module, report: 'r.sarif', options: {}, classpath: [], home: undefined }),
    ).toEqual([
      ...['--input', '/work/app/src/main/java,/work/app/src/main/kotlin'],
      ...['--includes', '**/*.kt'],
      ...['--report', 'sarif:r.sarif'],
      ...['--base-path', '/work/app'],
      '--build-upon-default-config',
      ...['--config', `${detekt}/nitpicker-detekt.yml,${detekt}/detekt-validation.yml`],
      ...['--classpath', ''],
    ]);
  });

  it('resolves types against detekt’s own standard library, the Java classes and the other libraries', () => {
    const root = tree(['java-classes/.keep', 'lib/guava.jar', 'lib/kotlin-stdlib-1.9.jar']);

    expect(
      detektClasspath({
        detektStdlib: ['/tools/kotlin-stdlib-2.0.21.jar'],
        javaClassDirectory: path.join(root, 'java-classes'),
        mainCompile: [
          path.join(root, 'lib/kotlin-stdlib-1.9.jar'),
          path.join(root, 'lib/guava.jar'),
          path.join(root, 'lib/missing.jar'),
        ],
      }),
    ).toEqual([
      '/tools/kotlin-stdlib-2.0.21.jar',
      path.join(root, 'java-classes'),
      path.join(root, 'lib/guava.jar'),
    ]);
  });
});

describe('formatter and metrics arguments', () => {
  it('hands ktlint one glob per Kotlin root, relative to the module', () => {
    expect(ktlintArguments({ module, report: '/r/ktlint.sarif' })).toEqual([
      '--relative',
      '--reporter=sarif,output=/r/ktlint.sarif',
      'src/main/java/**/*.kt',
      'src/main/kotlin/**/*.kt',
    ]);
  });

  it('hands ktfmt its style, the editorconfig switch and the files relative to the module', () => {
    const files = ['/work/app/src/main/kotlin/A.kt'];

    expect(
      ktfmtArguments({ module, options: { ktfmtStyle: 'google', editorconfig: true }, files }),
    ).toEqual(['--google-style', '--dry-run', '--enable-editorconfig', 'src/main/kotlin/A.kt']);
    expect(
      ktfmtArguments({ module, options: { ktfmtStyle: 'meta', editorconfig: false }, files }),
    ).toEqual(['--meta-style', '--dry-run', 'src/main/kotlin/A.kt']);
  });

  it('runs a PSI program on the module, with the roots relative to it', () => {
    const [program, ...rest] = programArguments({
      program: 'KotlinMetrics.java',
      output: '/r/kotlin-metrics.json',
      module,
    });

    expect(path.basename(program)).toBe('KotlinMetrics.java');
    expect(rest).toEqual([
      '/r/kotlin-metrics.json',
      '/work/app',
      'src/main/java',
      'src/main/kotlin',
    ]);
  });
});

describe('Kotlin tools', () => {
  const pinned = readPinnedTools();
  const everything =
    '<exclusions><exclusion><groupId>*</groupId><artifactId>*</artifactId></exclusion></exclusions>';
  const dependency = (coordinates, extra = '') => {
    const [groupId, artifactId, version, classifier] = coordinates.split(':');
    const id = `<groupId>${groupId}</groupId><artifactId>${artifactId}</artifactId><version>${version}</version>`;
    return `<dependency>${id}${classifier === undefined ? '' : `<classifier>${classifier}</classifier>`}${extra}</dependency>`;
  };

  it('resolves the compiler with its dependencies and the fat jars without any', () => {
    const tools = toolDependencies(pinned, [], kotlinTools(pinned, 'ktlint'));

    expect(Object.keys(tools).filter((name) => /kotlin|detekt|kt/u.test(name))).toEqual([
      'kotlin-compiler',
      'detekt',
      'detekt-stdlib',
      'ktlint',
    ]);
    expect(tools['kotlin-compiler']).toEqual([
      dependency(`org.jetbrains.kotlin:kotlin-compiler-embeddable:${pinned.kotlinCompiler}`),
    ]);
    expect(tools.detekt).toEqual([
      dependency(`io.gitlab.arturbosch.detekt:detekt-cli:${pinned.detekt}:all`, everything),
    ]);
    expect(tools['detekt-stdlib']).toEqual([
      dependency(`org.jetbrains.kotlin:kotlin-stdlib:${pinned.detektKotlin}`, everything),
    ]);
    expect(tools.ktlint).toEqual([
      dependency(`com.pinterest.ktlint:ktlint-cli:${pinned.ktlint}:all`, everything),
    ]);
  });

  it('resolves ktfmt only for a project that formats with it, and no formatter otherwise', () => {
    expect(kotlinTools(pinned, 'ktfmt').map(({ name }) => name)).toEqual([
      'kotlin-compiler',
      'detekt',
      'detekt-stdlib',
      'ktfmt',
    ]);
    expect(kotlinTools(pinned, 'ktfmt').at(-1).coordinates).toEqual([
      `com.facebook:ktfmt:${pinned.ktfmt}:with-dependencies`,
    ]);
    expect(kotlinTools(pinned, 'none').map(({ name }) => name)).toEqual([
      'kotlin-compiler',
      'detekt',
      'detekt-stdlib',
    ]);
  });
});
