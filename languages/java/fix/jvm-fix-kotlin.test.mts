import { symlinkSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

afterEach(() => {
  vi.unstubAllEnvs();
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
      fixedFindings: [],
      toolErrors: [],
      notes: [`ktfmt rewrote ${KT}/Ok.kt`, `ktfmt could not parse ${KT}/Broken.kt`],
    });
  });
  it('reports a Kotlin file the formatter cannot parse', () => {
    const repository = topic(GRADLE, { [`${KT}/Broken.kt`]: 'class BROKEN {\n' });

    const result = fix(repository, fakeJvmTools(), { config: kotlin });

    expect(result).toEqual({
      fixedFiles: [],
      fixedFindings: [],
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
        message: `"kotlin.detektConfig" is missing.yml, which does not exist: create it, or change or remove "kotlin.detektConfig". ${linkSentence('projectToolConfigMissing')}`,
      },
    ]);
  });
});
