import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { GRADLE_DIRECTORY } from '../../builds/java-build.mjs';

const LINES = readFileSync(path.join(GRADLE_DIRECTORY, 'nitpicker.init.gradle'), 'utf8').split(
  '\n',
);

function braceBalance(line) {
  return [...line].reduce((balance, char) => balance + ({ '{': 1, '}': -1 }[char] ?? 0), 0);
}

function blockStartingWith(anchor) {
  const start = LINES.findIndex((line) => line.trim() === anchor);
  const block = [];
  let depth = 0;
  for (const line of LINES.slice(start)) {
    block.push(line.trim());
    depth += braceBalance(line);
    if (depth === 0) {
      break;
    }
  }
  return block;
}

function linesContaining(text) {
  return LINES.filter((line) => line.includes(text)).map((line) => line.trim());
}

describe('the Gradle init script node runner', () => {
  it('reports a node that cannot start as clearly as a node that exits non-zero', () => {
    expect(
      blockStartingWith('def runNode = { File script, List<String> arguments, String failure ->'),
    ).toEqual([
      'def runNode = { File script, List<String> arguments, String failure ->',
      'def process',
      'try {',
      'process = new ProcessBuilder([nodeCommand, script.absolutePath] + arguments)',
      '.redirectErrorStream(true).start()',
      '} catch (IOException error) {',
      `throw new GradleException("\${failure}: could not run \${nodeCommand}: \${error.message}")`,
      '}',
      "def log = process.inputStream.getText('UTF-8')",
      'def exit = process.waitFor()',
      'if (exit != 0) {',
      `throw new GradleException("\${failure}: \${processFailure(nodeCommand, exit, log)}")`,
      '}',
      '}',
    ]);
  });
});

describe('the Gradle init script and the formatter style', () => {
  it('reads the style and the indentation from project properties, google and two spaces by default', () => {
    expect(linesContaining("nitpickerArgument('nitpicker.java.")).toEqual([
      "def javaStyle = nitpickerArgument('nitpicker.java.style') ?: 'google'",
      "def javaIndentation = nitpickerArgument('nitpicker.java.indentation') ?: '2'",
    ]);
  });

  it('puts the palantir jar on the formatter classpath for palantir, the google jar unless none', () => {
    expect(blockStartingWith("if (javaStyle == 'palantir') {")).toEqual([
      "if (javaStyle == 'palantir') {",
      'nitpickerFormat "com.palantir.javaformat:palantir-java-format:${pinned.palantirJavaFormat}"',
      "} else if (javaStyle != 'none') {",
      'nitpickerFormat "com.google.googlejavaformat:google-java-format:${pinned.googleJavaFormat}"',
      '}',
    ]);
  });

  it('runs the formatter main class and flags that belong to the style, and nothing for none', () => {
    expect(blockStartingWith("tasks.register('nitpickerFormat', JavaExec) {")).toEqual([
      "tasks.register('nitpickerFormat', JavaExec) {",
      "group = 'nitpicker'",
      'classpath = configurations.nitpickerFormat',
      "mainClass = javaStyle == 'palantir' ? 'com.palantir.javaformat.java.Main' : 'com.google.googlejavaformat.java.Main'",
      "enabled = javaStyle != 'none'",
      'onlyIf {',
      'if (!javaFiles().isEmpty()) {',
      'return true',
      '}',
      'reportDir.get().asFile.mkdirs()',
      "reportDir.get().file('format.txt').asFile.text = ''",
      'false',
      '}',
      'ignoreExitValue = true',
      "jvmArgs(['api', 'file', 'parser', 'tree', 'util', 'code'].collect {",
      '"--add-exports=jdk.compiler/com.sun.tools.javac.${it}=ALL-UNNAMED".toString()',
      '})',
      'def formatErrors = new ByteArrayOutputStream()',
      'errorOutput = formatErrors',
      'doFirst {',
      'reportDir.get().asFile.mkdirs()',
      "standardOutput = new FileOutputStream(reportDir.get().file('format.txt').asFile)",
      "args(['--dry-run'] + ([aosp: ['--aosp'], palantir: ['--palantir']][javaStyle] ?: []) + javaFiles()*.absolutePath)",
      '}',
      'doLast {',
      'def exit = executionResult.get().exitValue',
      'if (exit != 0) {',
      "def detail = formatErrors.toString('UTF-8').readLines().findAll { it.trim() && !it.startsWith('Picked up ') }.take(20).join('\\n')",
      `throw new GradleException("\${mainClass.get().contains('palantir') ? 'palantir-java-format' : 'google-java-format'} " +`,
      `"failed with exit code \${exit}: \${detail}")`,
      '}',
      '}',
      '}',
    ]);
  });

  it('checks the same main and test Java files before and during formatting', () => {
    expect(blockStartingWith('def javaFiles = {')).toEqual([
      'def javaFiles = {',
      '(mainSources.files + testSourceDirectories()).findAll { it.exists() }',
      ".collectMany { directory -> fileTree(directory) { include '**/*.java' }.files }.unique().sort()",
      '}',
    ]);
  });

  it('writes an empty format report when no formatter runs, and when the formatter did not run', () => {
    expect(blockStartingWith("if (javaStyle == 'none' || !formatReport.exists()) {")).toEqual([
      "if (javaStyle == 'none' || !formatReport.exists()) {",
      "formatReport.text = ''",
      '}',
    ]);
  });

  it('reads the Checkstyle suppressions of the style, and a fresh config when the style changes', () => {
    expect(linesContaining("inputs.property('java")).toEqual([
      "inputs.property('javaStyle', javaStyle)",
      "inputs.property('javaIndentation', javaIndentation)",
    ]);
    expect(linesContaining('checkstyle-suppressions')).toEqual([
      "? 'checkstyle-suppressions-unformatted.xml' : 'checkstyle-suppressions.xml').absolutePath]",
    ]);
  });

  it('has the shared config writer add the unused import check and the measured indentation', () => {
    expect(linesContaining('javaStyle: javaStyle')).toEqual(['javaStyle: javaStyle,']);
    expect(linesContaining('indentation: javaIndentation')).toEqual([
      'indentation: javaIndentation,',
    ]);
    expect(linesContaining("writeRules('checkstyle-config', plan)")).toEqual([
      "writeRules('checkstyle-config', plan)",
    ]);
  });
});
