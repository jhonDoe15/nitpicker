import { describe, expect, it } from 'vitest';
import { condenseFailure, withoutToolNoise } from './failure-text.mjs';

const NOTICE = 'Picked up JAVA_TOOL_OPTIONS: -Dhttps.proxyHost=127.0.0.1';
const ROOT = '/work/head';
const TRY = [
  '* Try:',
  '> Run with --stacktrace option to get the stack trace.',
  '> Run with --info or --debug option to get more log output.',
  '> Run with --scan to get full insights.',
  '> Get more help at https://help.gradle.org.',
  '',
  'BUILD FAILED in 3s',
];

function banner(...sections) {
  return ['FAILURE: Build failed with an exception.', '', ...sections.flat(), ...TRY].join('\n');
}

describe('withoutToolNoise', () => {
  it('drops the lines the JVM prints for its option variables, and nothing else', () => {
    const text = [NOTICE, 'Picked up _JAVA_OPTIONS: -Xmx1g', 'FAILURE: Build failed', NOTICE].join(
      '\n',
    );

    expect(withoutToolNoise(text)).toBe('FAILURE: Build failed');
  });

  it('drops the notice behind a PIT minion prefix, PIT progress in any locale and Checkstyle warnings', () => {
    const text = [
      `12:50:42 PM PIT >> INFO : MINION : ${NOTICE}`,
      '12:50:44 PM PIT >> INFO : Sent tests to minion',
      '3:58:17?PM PIT >> INFO : Created 1 mutation test units',
      '[ant:checkstyle] [WARN] /src/A.java:3: Line is longer than 100 characters',
      '12:50:44 PM PIT >> ERROR : minion exited abnormally',
    ].join('\n');

    expect(withoutToolNoise(text)).toBe('12:50:44 PM PIT >> ERROR : minion exited abnormally');
  });

  it('drops the SLF4J warnings a tool without a logging provider prints', () => {
    const text = [
      'SLF4J(W): No SLF4J providers were found.',
      'SLF4J(W): Defaulting to no-operation (NOP) logger implementation',
      'Handler.java:44: error: cannot find symbol',
    ].join('\n');

    expect(withoutToolNoise(text)).toBe('Handler.java:44: error: cannot find symbol');
  });

  it('keeps a line that only mentions the variable', () => {
    expect(withoutToolNoise('set JAVA_TOOL_OPTIONS to fix it')).toBe(
      'set JAVA_TOOL_OPTIONS to fix it',
    );
  });
});

describe('condenseFailure', () => {
  it('keeps the deepest cause of a missing toolchain and drops the Where of the own init script', () => {
    const text = banner(
      ['* Where:', "Initialization script '/n/nitpicker.init.gradle' line: 309", ''],
      [
        '* What went wrong:',
        'A problem occurred evaluating initialization script.',
        "> Failed to calculate the value of task ':compileJava' property 'javaCompiler'.",
        '   > Cannot find a Java installation on your machine matching: {languageVersion=25}.',
        '',
      ],
    );

    expect(condenseFailure(text, ROOT).split('\n')).toEqual([
      "Failed to calculate the value of task ':compileJava' property 'javaCompiler'.",
      '> Cannot find a Java installation on your machine matching: {languageVersion=25}.',
    ]);
  });

  it('keeps each compiler error once, with its symbol, and drops the copy in the failure', () => {
    const error = `${ROOT}/src/main/java/demo/Greeter.java:5: error: cannot find symbol`;
    const compiler = [
      error,
      '    return missing();',
      '           ^',
      '  symbol:   method missing()',
    ];
    const text = [
      ...compiler,
      '1 error',
      '',
      banner([
        '* What went wrong:',
        "Execution failed for task ':compileJava'.",
        '> Compilation failed; see the compiler output below.',
        ...compiler.map((line) => `  ${line}`),
        '',
      ]),
    ].join('\n');

    expect(condenseFailure(text, ROOT).split('\n')).toEqual([
      'src/main/java/demo/Greeter.java:5: error: cannot find symbol (method missing())',
      "Execution failed for task ':compileJava'.",
      '> Compilation failed; see the compiler output below.',
    ]);
  });

  it('keeps the dependency that could not be resolved and its parent', () => {
    const text = banner([
      '* What went wrong:',
      "Execution failed for task ':compileJava'.",
      "> Could not resolve all files for configuration ':compileClasspath'.",
      '   > Could not find com.example:missing:1.0.',
      '     Searched in the following locations:',
      '       - https://repo.maven.apache.org/maven2/com/example/missing/1.0/missing-1.0.pom',
      '',
    ]);

    expect(condenseFailure(text, ROOT).split('\n')).toEqual([
      "Could not resolve all files for configuration ':compileClasspath'.",
      '> Could not find com.example:missing:1.0.',
    ]);
  });

  it("keeps the Where of the project's own build script", () => {
    const text = banner(
      ['* Where:', `Build file '${ROOT}/build.gradle' line: 12`, ''],
      [
        '* What went wrong:',
        'A problem occurred evaluating root project.',
        "> Could not find method implementatio() for arguments [x] on root project 'demo'.",
        '',
      ],
    );

    expect(condenseFailure(text, ROOT).split('\n')).toEqual([
      "Build file 'build.gradle' line: 12",
      'A problem occurred evaluating root project.',
      "> Could not find method implementatio() for arguments [x] on root project 'demo'.",
    ]);
  });

  it('names a missing build by the project folder, without the documentation lines', () => {
    const text = banner([
      '* What went wrong:',
      `Directory '${ROOT}' does not contain a Gradle build.`,
      '',
      'For more details on creating a Gradle build, please refer to ' +
        'https://docs.gradle.org/8.14/userguide/tutorial_using_tasks.html in the Gradle documentation.',
      '',
    ]);

    expect(condenseFailure(text, ROOT)).toBe("Directory '.' does not contain a Gradle build.");
  });

  it('keeps the causes before the failure and drops the noise around them', () => {
    const cause =
      'Caused by: org.pitest.help.PitError: Coverage generation minion exited abnormally!';
    const text = [
      NOTICE,
      'INFO: step 1',
      cause,
      'INFO: step 2',
      banner(['* What went wrong:', "Execution failed for task ':nitpickerPit'.", '']),
    ].join('\n');

    expect(condenseFailure(text, ROOT).split('\n')).toEqual([
      "Execution failed for task ':nitpickerPit'.",
      cause,
    ]);
  });

  it('keeps the last lines of a failure without a Gradle failure block, at most 12', () => {
    const lines = Array.from({ length: 30 }, (_, index) => `line ${String(index)}`);

    expect(condenseFailure(lines.join('\n'), ROOT).split('\n')).toEqual(lines.slice(-12));
  });

  it('cuts a very long line', () => {
    const condensed = condenseFailure(`* What went wrong:\n${'x'.repeat(400)}`, ROOT);

    expect(condensed).toBe(`${'x'.repeat(300)}…`);
  });
});
