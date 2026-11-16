import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fieldOf, fieldsOf, textOf } from '../../../shared/values/readers.mts';
import { JAVAC_EXPORTS } from '../maven/maven-lint.mts';
import { fakeJvmTools } from './test-support/fake-jvm-tools.mts';
import {
  GOOGLE_COORDINATES,
  GRADLE,
  JAVA,
  KT,
  TOOLS_PROPERTY,
  fix,
  launchOf,
  linkSentence,
  read,
  toolsProperty,
  topic,
} from './test-support/jvm-fix-harness.mts';

const MAVEN = { 'pom.xml': '<project/>\n' };
const MAVEN_TOOLS = /^.*\/maven-tools-[0-9a-f]{16}\//u;

afterEach(() => {
  vi.unstubAllEnvs();
});

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
      fixedFindings: [],
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
      `${TOOLS_PROPERTY}java-format=com.palantir.javaformat:palantir-java-format:2.90.0`,
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
      fixedFindings: [],
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
    expect([call?.command, call?.args.slice(0, 5), call?.args.slice(-2)]).toEqual([
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
      fixedFindings: [],
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
        message: `google-java-format failed: Exception in thread main. ${linkSentence('fixersFail')}`,
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
        ...fieldsOf(error),
        message: textOf(fieldOf(error, 'message')).replace(
          / at \S+\/gradle-tools-[0-9a-f]{16},/u,
          ' at <tools>,',
        ),
      })),
    ).toEqual([
      {
        tool: 'fix-tools',
        snapshot: 'fix',
        message: `fix-tools failed: Could not resolve artifact (nitpicker resolves the formatter jars in its own build at <tools>, from Maven Central, since the project declares no repositories). ${linkSentence('fixersFail')}`,
      },
    ]);
    expect(result.fixedFiles).toEqual([]);
  });
});
