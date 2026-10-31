import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fileFindings } from '../../../languages/java/adapters/suppressions/java-suppressions.mjs';
import { isBannedSuppression } from '../../../languages/java/adapters/kotlin/rules/kotlin-rules.mjs';
import { toTree } from '../tree.mjs';
import { detectLanguageTampering } from './tampering/index.mjs';

const commentsModule = path.resolve(import.meta.dirname, '../../../languages/python/rules/checks');
const SCRIPT = [
  'import json, sys',
  `sys.path.insert(0, ${JSON.stringify(commentsModule)})`,
  'from comments import comment_findings',
  "print(json.dumps(comment_findings('a.py', sys.stdin.read())))",
].join('\n');

function detected(file, code) {
  return detectLanguageTampering(toTree({ [file]: '' }), toTree({ [file]: code })).length > 0;
}

function pythonGateFlags(code) {
  const run = spawnSync('python3', ['-c', SCRIPT], { input: code, encoding: 'utf8' });
  return JSON.parse(run.stdout).some(({ rule }) => rule === 'no-inline-suppression');
}

describe('the Python gate and the suppression detector agree', () => {
  it.each([
    'x = 1  # noqa',
    'x = 1  # noqa: E501',
    '# ruff: noqa',
    '# flake8: noqa',
    'x = 1  # type: ignore',
    'x = 1  # type: ignore[assignment]',
    'x = 1  # pyright: ignore[reportAssignmentType]',
    '# pyright: basic',
    '# fmt: off',
    'x = 1  # fmt: skip',
    '# mypy: ignore-errors',
  ])('both report %s', (code) => {
    expect(pythonGateFlags(`${code}\n`)).toBe(true);
    expect(detected('a.py', `${code}\n`)).toBe(true);
  });

  it.each(['x = "# noqa"', '# an ordinary comment', 'x = 1  # a note'])(
    'neither reports %s',
    (code) => {
      expect(pythonGateFlags(`${code}\n`)).toBe(false);
      expect(detected('a.py', `${code}\n`)).toBe(false);
    },
  );
});

const javaFile = (annotation) => `package demo;\n\n${annotation}\nclass A {}\n`;

describe('the Java gate and the suppression detector agree', () => {
  it.each([
    '@SuppressWarnings("all")',
    '@SuppressWarnings({"PMD.Foo", "unchecked"})',
    '@java.lang.SuppressWarnings("all")',
    '@SuppressFBWarnings("EI_EXPOSE_REP")',
    '@edu.umd.cs.findbugs.annotations.SuppressFBWarnings("EI_EXPOSE_REP")',
  ])('both report %s', (annotation) => {
    expect(fileFindings(javaFile(annotation), 'A.java').length).toBeGreaterThan(0);
    expect(detected('src/main/java/demo/A.java', javaFile(annotation))).toBe(true);
  });

  it.each(['// @SuppressWarnings("all")', 'String s = "@SuppressWarnings(\\"all\\")";'])(
    'neither reports %s',
    (annotation) => {
      expect(fileFindings(javaFile(annotation), 'A.java')).toEqual([]);
      expect(detected('src/main/java/demo/A.java', javaFile(annotation))).toBe(false);
    },
  );
});

describe('the one Java marker the gate allows', () => {
  const repository = `package demo;

interface Repo {
  @Query(value = "select 1", nativeQuery = true)
  @SuppressWarnings("PMD.SpringDataNativeQuery")
  List<A> find();
}
`;

  it('is allowed by both', () => {
    expect(fileFindings(repository, 'Repo.java')).toEqual([]);
    expect(detected('src/main/java/demo/Repo.java', repository)).toBe(false);
  });
});

describe('the Kotlin gate and the suppression detector agree', () => {
  it.each([
    '@Suppress("MagicNumber")',
    '@file:Suppress("detekt:all")',
    '@Suppress("UNCHECKED_CAST")',
    '@get:Suppress("TooGenericExceptionCaught")',
    '@kotlin.Suppress("MagicNumber")',
    '@[Suppress("MagicNumber")]',
  ])('the detector reports what the gate bans: %s', (annotation) => {
    const token = /"([^"]+)"/u.exec(annotation)[1];
    expect(isBannedSuppression(token)).toBe(true);
    expect(detected('src/main/kotlin/demo/A.kt', `package demo\n\n${annotation}\nclass A\n`)).toBe(
      true,
    );
  });

  it('also reports a suppression the gate lets through, which is still tampering', () => {
    expect(isBannedSuppression('unused')).toBe(false);
    expect(
      detected('src/main/kotlin/demo/A.kt', 'package demo\n\n@Suppress("unused")\nclass A\n'),
    ).toBe(true);
  });
});
