import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { configurationFiles, createJavaAnalyzer } from '../java-analyzer.mjs';
import { analyzeJavaSnapshot, readRunnerPolicy } from '../java-runner.mjs';
import { javaStyle, javaStyleProperties } from './java-style.mjs';

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
  return JSON.parse(readFileSync(path.join(root, 'build/gradle-args.json'), 'utf8'));
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
      'LineLength',
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
    for (const kept of ['NeedBraces', 'AvoidStarImport', 'EmptyCatchBlock']) {
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
    expect(styleProperties({ preset: 'kotlin', javaStyle: 'aosp' })).toEqual([
      '-Pnitpicker.java.style=aosp',
    ]);
  });
});

describe('the analyzer hash', () => {
  const hashWith = (conventions) => {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-java-hash-')));
    roots.push(root);
    const file = path.join(root, 'policy.json');
    writeFileSync(file, JSON.stringify({ conventions }));
    const previous = process.env.NITPICKER_POLICY;
    process.env.NITPICKER_POLICY = file;
    try {
      const analyzer = createJavaAnalyzer();
      return [analyzer.configurationHash, analyzer.version];
    } finally {
      if (previous === undefined) {
        delete process.env.NITPICKER_POLICY;
      } else {
        process.env.NITPICKER_POLICY = previous;
      }
    }
  };

  it('does not depend on the style, which is read at run time', () => {
    expect(hashWith({ 'java.indentation': '4' })).toEqual(hashWith({ 'java.indentation': '2' }));
  });

  it('covers the style code and the Checkstyle suppressions it relies on', () => {
    expect(configurationFiles()).toEqual(
      expect.arrayContaining([
        'languages/java/adapters/style/java-style.mjs',
        'languages/java/gradle/checkstyle-suppressions.xml',
      ]),
    );
  });
});

describe('javaStyle', () => {
  it('reads the java.indentation convention: 4 is aosp, 2 and absent are google', () => {
    expect(javaStyle({ 'java.indentation': '4' })).toBe('aosp');
    expect(javaStyle({ 'java.indentation': '2' })).toBe('google');
    expect(javaStyle({})).toBe('google');
    expect(javaStyle(undefined)).toBe('google');
  });

  it('reaches the runner policy from the policy file named by NITPICKER_POLICY', () => {
    const policyOf = (conventions) => {
      const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-java-policy-')));
      roots.push(root);
      const file = path.join(root, 'policy.json');
      writeFileSync(file, JSON.stringify(conventions === undefined ? {} : { conventions }));
      return readRunnerPolicy(['--project-root', '/p'], { NITPICKER_POLICY: file }).policy;
    };
    expect(policyOf({ 'java.indentation': '4' }).javaStyle).toBe('aosp');
    expect(policyOf({ 'java.indentation': '2' }).javaStyle).toBe('google');
    expect(policyOf(undefined).javaStyle).toBe('google');
    expect(readRunnerPolicy(['--project-root', '/p'], {}).policy.javaStyle).toBe('google');
  });
});
