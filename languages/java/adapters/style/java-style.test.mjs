import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { analyzeJavaSnapshot } from '../java-runner.mjs';
import { javaStyle, javaStyleArguments, javaStyleProperties } from './java-style.mjs';

const fakeGradle = path.resolve(import.meta.dirname, '../fixtures/fake-gradle.mjs');
const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function gradleArguments(policy) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-java-style-')));
  roots.push(root);
  analyzeJavaSnapshot(root, { gradle: fakeGradle, policy });
  return JSON.parse(readFileSync(path.join(root, 'build/nitpicker/gradle-args.json'), 'utf8'));
}

describe('javaStyleProperties', () => {
  it('passes only a non-default style, as a command-line property', () => {
    expect(javaStyleProperties('aosp')).toEqual(['-Pnitpicker.java.style=aosp']);
    expect(javaStyleProperties('google')).toEqual([]);
    expect(javaStyleProperties(undefined)).toEqual([]);
  });
});

describe('Checkstyle layout checks', () => {
  const suppressions = readFileSync(
    path.resolve(import.meta.dirname, '../../gradle/checkstyle-suppressions.xml'),
    'utf8',
  );
  const suppressed = suppressions
    .split('\n')
    .flatMap((line) => /checks="([^"]+)"/u.exec(line)?.[1].split('|') ?? []);

  it('leaves layout to google-java-format, in every style', () => {
    expect(suppressed.toSorted()).toEqual([
      'AnnotationLocation',
      'CommentsIndentation',
      'CustomImportOrder',
      'EmptyLineSeparator',
      'FileTabCharacter',
      'GenericWhitespace',
      'Indentation',
      'LeftCurly',
      'MethodParamPad',
      'MissingJavadocMethod',
      'MissingJavadocType',
      'NoLineWrap',
      'NoWhitespaceBefore',
      'OperatorWrap',
      'ParenPad',
      'RegexpSinglelineJava',
      'RightCurly',
      'SeparatorWrap',
      'WhitespaceAfter',
      'WhitespaceAround',
    ]);
  });

  it('keeps the checks that are not layout', () => {
    for (const kept of ['LineLength', 'NeedBraces', 'AvoidStarImport', 'EmptyCatchBlock']) {
      expect(suppressed).not.toContain(kept);
    }
  });
});

describe('the Gradle run', () => {
  it('gets the aosp style as a command-line property and nothing for the default', () => {
    const styleProperties = (policy) =>
      gradleArguments(policy).filter((argument) => argument.startsWith('-Pnitpicker.java.style'));
    expect(styleProperties({ javaStyle: 'aosp' })).toEqual(['-Pnitpicker.java.style=aosp']);
    expect(styleProperties({ javaStyle: 'google' })).toEqual([]);
    expect(styleProperties({})).toEqual([]);
  });
});

describe('javaStyle', () => {
  it('reads the java.indentation convention: 4 is aosp, 2 and absent are google', () => {
    expect(javaStyle({ 'java.indentation': '4' })).toBe('aosp');
    expect(javaStyle({ 'java.indentation': '2' })).toBe('google');
    expect(javaStyle({})).toBe('google');
    expect(javaStyle(undefined)).toBe('google');
  });

  it('turns a non-default style into runner arguments', () => {
    expect(javaStyleArguments({ 'java.indentation': '4' })).toEqual(['--java-style', 'aosp']);
    expect(javaStyleArguments({ 'java.indentation': '2' })).toEqual([]);
    expect(javaStyleArguments(undefined)).toEqual([]);
  });
});
