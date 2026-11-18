import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readStringCallFindings as untypedRead } from '../string-calls.mjs';

type Finding = {
  readonly rule: string;
  readonly message: string;
  readonly location: { readonly line: number };
};

const read: (
  projectRoot: string,
  options: { readonly projects: readonly unknown[]; readonly kotlin: boolean },
) => Finding[] = untypedRead;

const roots: string[] = [];
const PROJECT = {
  qualifier: '',
  sourceRoots: ['src/main/java'],
  testSourceRoots: ['src/test/java'],
  kotlinSourceRoots: ['src/main/kotlin'],
  kotlinTestSourceRoots: ['src/test/kotlin'],
};

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function scan(file: string, text: string, kotlin: boolean) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-jvm-translation-'));
  roots.push(root);
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), text);
  return read(root, { projects: [PROJECT], kotlin }).filter(
    ({ rule }) => rule === 'PatternTranslation',
  );
}

function java(body: string) {
  return scan(
    'src/main/java/shop/Globs.java',
    `package shop;\nimport java.util.regex.Pattern;\nclass Globs {\n${body}\n}\n`,
    false,
  ).map(({ location }) => location.line);
}

function kotlin(body: string) {
  return scan('src/main/kotlin/shop/Globs.kt', `package shop\nclass Globs {\n${body}\n}\n`, true).map(
    ({ location }) => location.line,
  );
}

describe('Java pattern translation', () => {
  it('reports a glob turned into a regex without quoting', () => {
    expect(
      java(
        'Pattern compile(String glob) {\n  String regex = glob.replace("**", ".*").replace("*", "[^/]*");\n  return Pattern.compile("^" + regex + "$");\n}',
      ),
    ).toEqual([5]);
    expect(
      java(
        'Pattern direct(String glob) {\n  return Pattern.compile(glob.replaceAll("\\\\*", ".*").replaceAll("\\\\?", "."));\n}',
      ),
    ).toEqual([5]);
  });

  it('reports a pattern turned into LIKE without escaping', () => {
    expect(
      java('String like(String glob) {\n  return glob.replace("*", "%").replace("?", "_");\n}'),
    ).toEqual([5]);
  });

  it('leaves quoted, escaped, constant and unrelated chains alone', () => {
    expect(
      java(
        'Pattern quoted(String glob) {\n  return Pattern.compile(Pattern.quote(glob).replace("*", ".*").replace("?", "."));\n}',
      ),
    ).toEqual([]);
    expect(
      java(
        'String like(String glob) {\n  return glob.replace("%", "\\\\%").replace("_", "\\\\_").replace("*", "%");\n}',
      ),
    ).toEqual([]);
    expect(
      java(
        'Pattern constant() {\n  return Pattern.compile("src/**/*.java".replace("**", ".*").replace("*", "[^/]*"));\n}',
      ),
    ).toEqual([]);
    expect(
      java('String label(String glob) {\n  return glob.replace("**", ".*").replace("*", "[^/]*");\n}'),
    ).toEqual([]);
    expect(
      java('Pattern single(String glob) {\n  return Pattern.compile(glob.replace("*", ".*"));\n}'),
    ).toEqual([]);
    expect(
      java(
        'Pattern slug(String text) {\n  return Pattern.compile(text.replace(" ", "-").replace("_", "-"));\n}',
      ),
    ).toEqual([]);
  });
});

describe('Kotlin pattern translation', () => {
  it('reports a glob turned into a Regex and a LIKE pattern', () => {
    expect(
      kotlin(
        'fun compile(glob: String): Regex =\n  Regex(glob.replace("**", ".*").replace("*", "[^/]*"))',
      ),
    ).toEqual([4]);
    expect(
      kotlin('fun like(glob: String): String =\n  glob.replace("*", "%").replace("?", "_")'),
    ).toEqual([4]);
    expect(
      kotlin(
        'fun compile(glob: String): Regex {\n  val source = glob.replace("**", ".*").replace("*", "[^/]*")\n  return source.toRegex()\n}',
      ),
    ).toEqual([4]);
  });

  it('leaves a quoted value and a chain that is not a regex alone', () => {
    expect(
      kotlin(
        'fun compile(glob: String): Regex =\n  Regex(Regex.escape(glob).replace("\\\\*", ".*").replace("\\\\?", "."))',
      ),
    ).toEqual([]);
    expect(
      kotlin('fun label(glob: String): String =\n  glob.replace("**", ".*").replace("*", "[^/]*")'),
    ).toEqual([]);
  });
});
