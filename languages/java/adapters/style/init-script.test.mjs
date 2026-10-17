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
      'ignoreExitValue = true',
      "jvmArgs(['api', 'file', 'parser', 'tree', 'util', 'code'].collect {",
      '"--add-exports=jdk.compiler/com.sun.tools.javac.${it}=ALL-UNNAMED".toString()',
      '})',
      'doFirst {',
      'reportDir.get().asFile.mkdirs()',
      "standardOutput = new FileOutputStream(reportDir.get().file('format.txt').asFile)",
      'def files = (mainSources.files + testSourceDirectories()).findAll { it.exists() }',
      ".collectMany { directory -> fileTree(directory) { include '**/*.java' }.files }.unique().sort()",
      "args(['--dry-run'] + ([aosp: ['--aosp'], palantir: ['--palantir']][javaStyle] ?: []) + files*.absolutePath)",
      '}',
      '}',
    ]);
  });

  it('writes an empty format report when the formatter did not run', () => {
    expect(blockStartingWith('if (!formatReport.exists()) {')).toEqual([
      'if (!formatReport.exists()) {',
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

  it('adds the unused import check when no formatter runs, and moves indentation to the measured width', () => {
    expect(blockStartingWith("if (javaStyle == 'none') {")).toEqual([
      "if (javaStyle == 'none') {",
      'if (!text.contains(\'<module name="TreeWalker">\')) {',
      "throw new GradleException('nitpicker could not find TreeWalker in google_checks.xml')",
      '}',
      'text = text.replace(\'<module name="TreeWalker">\',',
      '\'<module name="TreeWalker">\\n    <module name="UnusedImports"/>\')',
      "if (javaIndentation == 'tab') {",
      "['Indentation', 'FileTabCharacter'].each { name ->",
      'text = text.replaceAll("(?s)<module name=\\"${name}\\"\\\\s*(?:/>|>.*?</module>)", \'\')',
      '}',
      "} else if (javaIndentation == '4') {",
      "['basicOffset', 'caseIndent', 'arrayInitIndent'].each { property ->",
      'def pattern = ~/(?s)(<module name="Indentation">(?:(?!<\\/module>).)*?<property name="${property}" value=")\\d+(")/',
      'if (!(text =~ pattern).find()) {',
      'throw new GradleException("nitpicker could not find Indentation ${property} in google_checks.xml")',
      '}',
      'text = text.replaceAll(pattern) { whole, head, tail -> "${head}4${tail}".toString() }',
      '}',
      '}',
      '}',
    ]);
  });
});
