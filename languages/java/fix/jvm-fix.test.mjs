import { readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixtureGit, useGitFixtures } from '../../../core/diff/git/test-support/git-repository.mjs';
import { writeFiles } from '../../../core/diff/git/test-support/fixture-files.mjs';
import { fixWorkingTree } from '../../../core/fix/run-fix.mjs';
import { JAVAC_EXPORTS } from '../maven/maven-lint.mjs';
import { fakeJvmTools } from './test-support/fake-jvm-tools.mjs';

const { createGitRepository, temporaryRoot } = useGitFixtures();
const GRADLE = { 'build.gradle': "plugins { id 'java' }\n" };
const MAVEN = { 'pom.xml': '<project/>\n' };
const JAVA = 'src/main/java/demo';
const KT = 'src/main/kotlin/demo';
const ENVIRONMENT = { NITPICKER_GRADLE: '', NITPICKER_MAVEN: 'fake-mvn' };
const TOOLS_PROPERTY = '-Pnitpicker.fix.tools=';
const GOOGLE_COORDINATES = 'java-format=com.google.googlejavaformat:google-java-format:1.25.2';
const TEMPORARY = new RegExp(`${tmpdir()}/nitpicker-fix-\\w+`, 'gu');
const MAVEN_TOOLS = /^.*\/maven-tools-[0-9a-f]{16}\//u;

afterEach(() => {
  vi.unstubAllEnvs();
});

function topic(base, changes) {
  vi.stubEnv('XDG_CACHE_HOME', temporaryRoot('nitpicker-fix-cache-'));
  const repository = createGitRepository(base, { baseRef: 'base' });
  fixtureGit(repository.root, ['checkout', '-q', '-b', 'topic']);
  writeFiles(repository.root, changes);
  return repository;
}

function fix(repository, tools, { headPolicy = {}, config = { preset: 'java' } } = {}) {
  return fixWorkingTree({
    repositoryRoot: repository.root,
    projectRoot: repository.root,
    baseRef: 'base',
    executeFixCommand: tools.executeFixCommand,
    headPolicy: { exclude: [], conventions: {}, ...headPolicy },
    config,
    environment: ENVIRONMENT,
  });
}

function read(repository, name) {
  return readFileSync(path.join(repository.root, name), 'utf8');
}

function launchOf({ launches }, index = 0) {
  const { cwd, ...launch } = launches[index];
  return {
    ...launch,
    args: launch.args.map((argument) =>
      argument.replaceAll(cwd, '<cwd>').replace(TEMPORARY, '<tmp>'),
    ),
  };
}

function toolsProperty(tools) {
  return tools.calls[0].args.find((argument) => argument.startsWith(TOOLS_PROPERTY));
}

describe('--fix for Java', () => {
  it('formats the changed Java files with google-java-format and leaves the rest alone', () => {
    const repository = topic(
      {
        ...GRADLE,
        [`${JAVA}/Legacy.java`]: 'class  Legacy {}\n',
        [`${JAVA}/Same.java`]: 'class  Same {}\n',
      },
      {
        [`${JAVA}/New.java`]: 'class  New {}\n',
        [`${JAVA}/Legacy.java`]: 'class  Legacy {}\n// edit\n',
        'notes.md': 'a  b\n',
      },
    );
    const tools = fakeJvmTools();

    const result = fix(repository, tools);

    expect(result).toEqual({
      fixedFiles: [`${JAVA}/New.java`],
      toolErrors: [],
      notes: [
        `google-java-format rewrote ${JAVA}/New.java`,
        `google-java-format left ${JAVA}/Legacy.java as is: already unformatted before your change`,
      ],
    });
    expect(read(repository, `${JAVA}/New.java`)).toBe('class New {}\n');
    expect(read(repository, `${JAVA}/Same.java`)).toBe('class  Same {}\n');
    expect(tools.operations()).toEqual(['fix-tools', 'java-format-fix', 'java-format-fix']);
  });
  it('runs the pinned google-java-format jar on copies of the files', () => {
    const repository = topic(GRADLE, { [`${JAVA}/New.java`]: 'class  New {}\n' });
    const tools = fakeJvmTools();

    fix(repository, tools);

    expect(launchOf(tools)).toEqual({
      operation: 'java-format-fix',
      jvmArgs: JAVAC_EXPORTS,
      classpath: '/fake/java-format.jar',
      mainClass: 'com.google.googlejavaformat.java.Main',
      args: ['--replace', '<cwd>/0/New.java'],
      layout: ['0', '0/New.java'],
    });
    expect(toolsProperty(tools)).toBe(`${TOOLS_PROPERTY}${GOOGLE_COORDINATES}`);
  });
  it('formats with --aosp when the project indents with four spaces', () => {
    const repository = topic(GRADLE, { [`${JAVA}/New.java`]: 'class  New {}\n' });
    const tools = fakeJvmTools();

    const result = fix(repository, tools, {
      headPolicy: { conventions: { 'java.indentation': '4' } },
    });

    expect(launchOf(tools).args).toEqual(['--aosp', '--replace', '<cwd>/0/New.java']);
    expect(result.notes).toEqual([`google-java-format --aosp rewrote ${JAVA}/New.java`]);
  });
  it('formats with palantir-java-format when the project uses it', () => {
    const repository = topic(GRADLE, { [`${JAVA}/New.java`]: 'class  New {}\n' });
    const tools = fakeJvmTools();

    const result = fix(repository, tools, {
      headPolicy: { conventions: { 'java.formatter': 'palantir' } },
    });

    const launch = launchOf(tools);
    expect([launch.mainClass, launch.args]).toEqual([
      'com.palantir.javaformat.java.Main',
      ['--palantir', '--replace', '<cwd>/0/New.java'],
    ]);
    expect(toolsProperty(tools)).toBe(
      `${TOOLS_PROPERTY}java-format=com.palantir.javaformat:palantir-java-format:2.50.0`,
    );
    expect(result.notes).toEqual([`palantir-java-format rewrote ${JAVA}/New.java`]);
  });
  it('rewrites nothing and says so when the project runs no Java formatter', () => {
    const repository = topic(GRADLE, { [`${JAVA}/New.java`]: 'class  New {}\n' });
    const tools = fakeJvmTools();

    const result = fix(repository, tools, {
      headPolicy: { conventions: { 'java.formatter': 'none' } },
    });

    expect(result).toEqual({
      fixedFiles: [],
      toolErrors: [],
      notes: [
        'No Java formatter runs for this project (conventions "java.formatter" is "none"), so Java files were not rewritten',
      ],
    });
    expect(tools.calls).toEqual([]);
  });
  it('resolves the formatter through Maven for a Maven project', () => {
    const repository = topic(MAVEN, { [`${JAVA}/New.java`]: 'class  New {}\n' });
    const tools = fakeJvmTools();

    const result = fix(repository, tools);

    const [call] = tools.calls;
    expect(result.fixedFiles).toEqual([`${JAVA}/New.java`]);
    expect([call.command, call.args.slice(0, 5), call.args.slice(-2)]).toEqual([
      'fake-mvn',
      ['--batch-mode', '--no-transfer-progress', '-Dstyle.color=never', '--quiet', '--file'],
      [
        'org.apache.maven.plugins:maven-dependency-plugin:3.8.1:build-classpath',
        '-Dmdep.outputFile=classpath.txt',
      ],
    ]);
    expect(launchOf(tools).classpath.replace(MAVEN_TOOLS, '<tools>/')).toBe('<tools>/pom.xml');
  });
  it('ignores Kotlin sources under the java preset, excluded paths and non-Java files', () => {
    const repository = topic(GRADLE, {
      'src/main/kotlin/A.kt': 'class  A\n',
      [`${JAVA}/gen/Api.java`]: 'class  Api {}\n',
      [`${JAVA}/Ok.java`]: 'class  Ok {}\n',
    });
    const tools = fakeJvmTools();

    const result = fix(repository, tools, { headPolicy: { exclude: [`${JAVA}/gen/**`] } });

    expect(result.fixedFiles).toEqual([`${JAVA}/Ok.java`]);
    expect(read(repository, `${JAVA}/gen/Api.java`)).toBe('class  Api {}\n');
    expect(read(repository, 'src/main/kotlin/A.kt')).toBe('class  A\n');
  });
  it('touches only the files the format check of the gate covers', () => {
    const repository = topic(
      {
        ...GRADLE,
        'app/build.gradle': "sourceSets { main { java { srcDirs = ['source'] } } }\n",
      },
      {
        'build.gradle.kts': 'plugins  { }\n',
        'settings.gradle.kts': 'rootProject.name  =  "demo"\n',
        'tools/helper.main.kts': 'val  x = 1\n',
        'tools/Script.java': 'class  Script {}\n',
        'tools/Script.kt': 'class  Script\n',
        'src/test/resources/Sample.java': 'class  Sample {}\n',
        'src/test/resources/Sample.kt': 'class  Sample\n',
        'build/generated/sources/Gen.java': 'class  Gen {}\n',
        'src/main/java/demo/Marked.java':
          '// Code generated by protoc-gen-go. DO NOT EDIT.\nclass  Marked {}\n',
        'app/source/demo/Declared.java': 'class  Declared {}\n',
        [`${KT}/Main.kt`]: 'class  Main\n',
        [`${JAVA}/Main.java`]: 'class  Main {}\n',
      },
    );
    const tools = fakeJvmTools();

    const result = fix(repository, tools, {
      config: { preset: 'kotlin', kotlin: { formatter: 'ktlint' } },
    });

    expect(result.fixedFiles).toEqual([
      'app/source/demo/Declared.java',
      `${JAVA}/Main.java`,
      `${KT}/Main.kt`,
    ]);
  });
  it('leaves a file that is not UTF-8 text alone and says so', () => {
    const repository = topic(GRADLE, { [`${JAVA}/Ok.java`]: 'class  Ok {}\n' });
    const latin1 = Buffer.from('class  Caf\u00e9 {}\n', 'latin1');
    writeFileSync(path.join(repository.root, JAVA, 'Latin.java'), latin1);

    const result = fix(repository, fakeJvmTools());

    expect(result.notes).toEqual([
      `google-java-format rewrote ${JAVA}/Ok.java`,
      `--fix left ${JAVA}/Latin.java as is: not UTF-8 text`,
    ]);
    expect(readFileSync(path.join(repository.root, JAVA, 'Latin.java'))).toEqual(latin1);
  });
  it('does nothing when no Java file changed', () => {
    const repository = topic(GRADLE, { 'notes.md': 'a  b\n' });
    const tools = fakeJvmTools();

    expect(fix(repository, tools)).toEqual({ fixedFiles: [], toolErrors: [], notes: [] });
    expect(tools.calls).toEqual([]);
  });
  it('reports a file the formatter cannot parse without failing', () => {
    const repository = topic(GRADLE, {
      [`${JAVA}/Broken.java`]: 'class BROKEN {\n',
      [`${JAVA}/Ok.java`]: 'class  Ok {}\n',
    });

    const result = fix(repository, fakeJvmTools());

    expect(result).toEqual({
      fixedFiles: [`${JAVA}/Ok.java`],
      toolErrors: [],
      notes: [
        `google-java-format rewrote ${JAVA}/Ok.java`,
        `google-java-format could not parse ${JAVA}/Broken.java`,
      ],
    });
  });
  it('reports a failing formatter as a tool error', () => {
    const repository = topic(GRADLE, { [`${JAVA}/New.java`]: 'class  New {}\n' });
    const tools = fakeJvmTools({
      failure: { 'java-format-fix': { status: 1, stdout: '', stderr: 'Exception in thread main' } },
    });

    const result = fix(repository, tools);

    expect(result.fixedFiles).toEqual([]);
    expect(result.toolErrors).toEqual([
      {
        tool: 'java-format-fix',
        snapshot: 'fix',
        message: 'google-java-format failed: Exception in thread main',
      },
    ]);
  });
  it('reports a build that cannot resolve the formatter as one tool error', () => {
    const repository = topic(GRADLE, { [`${JAVA}/New.java`]: 'class  New {}\n' });
    const tools = fakeJvmTools({
      failure: { 'fix-tools': { status: 1, stdout: '', stderr: 'Could not resolve artifact' } },
    });

    const result = fix(repository, tools);

    expect(
      result.toolErrors.map((error) => ({
        ...error,
        message: error.message.replace(/ at \S+\/gradle-tools-[0-9a-f]{16},/u, ' at <tools>,'),
      })),
    ).toEqual([
      {
        tool: 'fix-tools',
        snapshot: 'fix',
        message:
          'fix-tools failed: Could not resolve artifact (nitpicker resolves the formatter jars in its own build at <tools>, from Maven Central, since the project declares no repositories)',
      },
    ]);
    expect(result.fixedFiles).toEqual([]);
  });
});

describe('--fix for Kotlin', () => {
  const kotlin = { preset: 'kotlin', kotlin: { formatter: 'ktlint' } };

  it('formats with ktlint only the code around a change to a file that was unformatted before', () => {
    const repository = topic(
      {
        ...GRADLE,
        [`${JAVA}/Old.java`]: 'class Old {\nint  a;\n}\n',
        [`${KT}/Old.kt`]: 'class Old {\nval  a = 1\n}\n',
      },
      {
        [`${JAVA}/Old.java`]: 'class Old {\nint  a;\nint  b;\n}\n',
        [`${KT}/Old.kt`]: 'class Old {\nval  a = 1\nval  b = 2\n}\n',
      },
    );
    symlinkSync('Old.kt', path.join(repository.root, KT, 'Link.kt'));

    const result = fix(repository, fakeJvmTools(), { config: kotlin });

    expect(result.notes).toEqual([
      `google-java-format left ${JAVA}/Old.java as is: already unformatted before your change`,
      `ktlint formatted only the code around your change in ${KT}/Old.kt: the rest was already unformatted before your change`,
      `--fix left ${KT}/Link.kt as is: symbolic links are not followed`,
    ]);
    expect([read(repository, `${JAVA}/Old.java`), read(repository, `${KT}/Old.kt`)]).toEqual([
      'class Old {\nint  a;\nint  b;\n}\n',
      'class Old {\nval  a = 1\nval b = 2\n}\n',
    ]);
  });
  it('formats changed Kotlin and Java files with one tool resolution', () => {
    const repository = topic(GRADLE, {
      [`${KT}/New.kt`]: 'class  New\n',
      [`${JAVA}/J.java`]: 'class  J {}\n',
    });
    const tools = fakeJvmTools();

    const result = fix(repository, tools, { config: kotlin });

    expect(result.fixedFiles).toEqual([`${JAVA}/J.java`, `${KT}/New.kt`]);
    expect(result.notes).toEqual([
      `google-java-format rewrote ${JAVA}/J.java`,
      `ktlint rewrote ${KT}/New.kt`,
    ]);
    expect(tools.operations()).toEqual(['fix-tools', 'java-format-fix', 'ktlint-fix']);
    expect(toolsProperty(tools)).toBe(
      `${TOOLS_PROPERTY}${GOOGLE_COORDINATES},ktlint=com.pinterest.ktlint:ktlint-cli:1.8.0:all!`,
    );
  });
  it('runs ktlint in a mirror of the project with the editorconfig of the gate', () => {
    const repository = topic(GRADLE, { [`${KT}/New.kt`]: 'class  New\n' });
    const tools = fakeJvmTools();

    fix(repository, tools, {
      config: kotlin,
      headPolicy: { conventions: { 'kotlin.indentation': '2', 'kotlin.lineLength': '100' } },
    });

    expect(launchOf(tools)).toEqual({
      operation: 'ktlint-fix',
      jvmArgs: [],
      classpath: '/fake/ktlint.jar',
      mainClass: 'com.pinterest.ktlint.Main',
      args: [
        '--format',
        '--relative',
        '--editorconfig=<tmp>/ktlint-defaults.editorconfig',
        '--',
        `${KT}/New.kt`,
      ],
      layout: [
        'ktlint-defaults.editorconfig',
        'workspace',
        'workspace/.editorconfig',
        'workspace/src',
        'workspace/src/main',
        'workspace/src/main/kotlin',
        'workspace/src/main/kotlin/demo',
        `workspace/${KT}/New.kt`,
      ],
      defaults: '[*.{kt,kts}]\nindent_size = 2\nmax_line_length = 100\n',
    });
  });
  it('formats with ktfmt in the style and width the project follows', () => {
    const repository = topic(GRADLE, { [`${KT}/New.kt`]: 'class  New\n' });
    const tools = fakeJvmTools();

    const result = fix(repository, tools, {
      config: { preset: 'kotlin', kotlin: { formatter: 'ktfmt' } },
      headPolicy: { conventions: { 'kotlin.indentation': '4', 'kotlin.lineLength': '100' } },
    });

    const launch = launchOf(tools);
    expect([launch.mainClass, launch.classpath, launch.args]).toEqual([
      'com.facebook.ktfmt.cli.Main',
      '/fake/ktfmt.jar',
      ['--kotlinlang-style', '--max-width=100', `./${KT}/New.kt`],
    ]);
    expect(result.notes).toEqual([`ktfmt rewrote ${KT}/New.kt`]);
  });
  it('rewrites no Kotlin file and says how to turn a formatter on when the project names none', () => {
    const repository = topic(GRADLE, {
      [`${KT}/New.kt`]: 'class  New\n',
      [`${JAVA}/J.java`]: 'class  J {}\n',
    });
    const tools = fakeJvmTools();

    const result = fix(repository, tools, {
      config: { preset: 'kotlin' },
      headPolicy: { kotlin: { formatter: 'none' } },
    });

    expect(result.fixedFiles).toEqual([`${JAVA}/J.java`]);
    expect(result.notes).toEqual([
      'No Kotlin formatter found, so Kotlin files were not rewritten: set "kotlin.formatter" to "ktlint" or "ktfmt" in nitpicker.config.json to format them',
      `google-java-format rewrote ${JAVA}/J.java`,
    ]);
    expect(tools.operations()).toEqual(['fix-tools', 'java-format-fix']);
  });
  it('uses the formatter the head policy detected', () => {
    const repository = topic(GRADLE, { [`${KT}/New.kt`]: 'class  New\n' });
    const tools = fakeJvmTools();

    fix(repository, tools, {
      config: { preset: 'kotlin' },
      headPolicy: { kotlin: { formatter: 'ktfmt' } },
    });

    expect(tools.operations()).toEqual(['fix-tools', 'ktfmt-fix']);
  });
  it('lets ktfmt read the editorconfig files of the project when it opted in', () => {
    const repository = topic(
      { ...GRADLE, '.editorconfig': 'root = true\n[*.kt]\nindent_size = 2\n' },
      { [`${KT}/New.kt`]: 'class  New\n' },
    );
    const tools = fakeJvmTools();

    fix(repository, tools, {
      config: { preset: 'kotlin', kotlin: { formatter: 'ktfmt' } },
      headPolicy: { tools: { ktfmt: { precedence: ['project'] } } },
    });

    const launch = launchOf(tools);
    expect([launch.args, launch.layout.filter((entry) => entry.endsWith('.editorconfig'))]).toEqual(
      [['--meta-style', '--enable-editorconfig', `./${KT}/New.kt`], ['workspace/.editorconfig']],
    );
  });
  it('formats the other Kotlin files when ktfmt cannot parse one', () => {
    const repository = topic(GRADLE, {
      [`${KT}/Broken.kt`]: 'class BROKEN {\n',
      [`${KT}/Ok.kt`]: 'class  Ok\n',
    });

    const result = fix(repository, fakeJvmTools(), {
      config: { preset: 'kotlin', kotlin: { formatter: 'ktfmt' } },
    });

    expect(result).toEqual({
      fixedFiles: [`${KT}/Ok.kt`],
      toolErrors: [],
      notes: [`ktfmt rewrote ${KT}/Ok.kt`, `ktfmt could not parse ${KT}/Broken.kt`],
    });
  });
  it('reports a Kotlin file the formatter cannot parse', () => {
    const repository = topic(GRADLE, { [`${KT}/Broken.kt`]: 'class BROKEN {\n' });

    const result = fix(repository, fakeJvmTools(), { config: kotlin });

    expect(result).toEqual({
      fixedFiles: [],
      toolErrors: [],
      notes: [`ktlint could not parse ${KT}/Broken.kt`],
    });
  });
  it('reports a Kotlin setup it cannot read as a tool error and still formats Java', () => {
    const repository = topic(GRADLE, {
      [`${KT}/New.kt`]: 'class  New\n',
      [`${JAVA}/J.java`]: 'class  J {}\n',
    });

    const result = fix(repository, fakeJvmTools(), {
      config: { preset: 'kotlin', kotlin: { formatter: 'ktlint', detektConfig: 'missing.yml' } },
      headPolicy: { tools: { detekt: { precedence: ['project'] } } },
    });

    expect(result.fixedFiles).toEqual([`${JAVA}/J.java`]);
    expect(result.toolErrors).toEqual([
      {
        tool: 'kotlin-format-fix',
        snapshot: 'fix',
        message:
          '"kotlin.detektConfig" is missing.yml, which does not exist: create it, or change or remove "kotlin.detektConfig"',
      },
    ]);
  });
});
