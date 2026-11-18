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
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-jvm-replacement-'));
  roots.push(root);
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), text);
  return read(root, { projects: [PROJECT], kotlin }).filter(
    ({ rule }) => rule === 'ExpandingReplacement',
  );
}

function java(body: string) {
  return scan(
    'src/main/java/shop/Fill.java',
    `package shop;\nimport java.util.regex.Matcher;\nclass Fill {\n${body}\n}\n`,
    false,
  ).map(({ location }) => location.line);
}

function kotlin(body: string) {
  return scan('src/main/kotlin/shop/Fill.kt', `package shop\nclass Fill {\n${body}\n}\n`, true).map(
    ({ location }) => location.line,
  );
}

describe('Java expanding replacements', () => {
  it('reports a runtime replacement given to replaceAll or replaceFirst', () => {
    expect(
      java(
        'String fill(String text, String name) {\n  return text.replaceAll("\\\\{name}", name);\n}',
      ),
    ).toEqual([5]);
    expect(
      java(
        'String fill(String path, String ns) {\n  return path.replaceFirst("^/api", "/" + ns + "/api");\n}',
      ),
    ).toEqual([5]);
    expect(
      java(
        'String fill(Matcher matcher, String name) {\n  return matcher.replaceAll(name.trim());\n}',
      ),
    ).toEqual([5]);
  });

  it('leaves constants, quoted values and literal replace alone', () => {
    expect(java('String fill(String text) {\n  return text.replaceAll("(a)", "$1b");\n}')).toEqual(
      [],
    );
    expect(
      java(
        'static final String NAME = "x";\nString fill(String text) {\n  return text.replaceAll("a", NAME);\n}',
      ),
    ).toEqual([]);
    expect(
      java(
        'String fill(String text, String name) {\n  return text.replaceAll("a", Matcher.quoteReplacement(name));\n}',
      ),
    ).toEqual([]);
    expect(
      java('String fill(String text, String name) {\n  return text.replace("{name}", name);\n}'),
    ).toEqual([]);
    expect(
      java(
        'String fill(String text, boolean on, int n) {\n  return text.replaceAll("a", String.format("x: %s %d\\n", on, n));\n}',
      ),
    ).toEqual([]);
    expect(
      java(
        'String fill(String text, boolean on) {\n  return text.replaceAll("a", "x: %s".formatted(on));\n}',
      ),
    ).toEqual([]);
    expect(
      java('String fill(String text, Kind kind) {\n  return text.replaceAll("a", kind.name());\n}'),
    ).toEqual([]);
    expect(
      java(
        'enum Kind { A }\nString fill(String text, Kind kind) {\n  return text.replaceAll("a", kind.value());\n}',
      ),
    ).toEqual([]);
    expect(
      java(
        'String fill(Matcher matcher) {\n  return matcher.replaceAll(result -> result.group(1));\n}',
      ),
    ).toEqual([]);
    expect(
      java(
        'void fill(java.util.List<String> items, java.util.function.UnaryOperator<String> op) {\n  items.replaceAll(op);\n}',
      ),
    ).toEqual([]);
  });
});

describe('Kotlin expanding replacements', () => {
  it('reports a runtime replacement given to a Regex', () => {
    expect(
      kotlin('fun fill(text: String, name: String): String =\n  text.replace(Regex("a"), name)'),
    ).toEqual([4]);
    expect(
      kotlin(
        'val PLACEHOLDER = Regex("a")\nfun fill(text: String, name: String): String =\n  PLACEHOLDER.replace(text, "<$name>")',
      ),
    ).toEqual([5]);
    expect(
      kotlin(
        'fun fill(text: String, name: String): String =\n  text.replaceFirst("a".toRegex(), name)',
      ),
    ).toEqual([4]);
  });

  it('leaves constants, escaped values, lambdas and string replace alone', () => {
    expect(kotlin('fun fill(text: String): String =\n  text.replace(Regex("(a)"), "$1b")')).toEqual(
      [],
    );
    expect(
      kotlin(
        'fun fill(text: String, name: String): String =\n  text.replace(Regex("a"), Regex.escapeReplacement(name))',
      ),
    ).toEqual([]);
    expect(
      kotlin('fun fill(text: String, name: String): String =\n  text.replace(Regex("a")) { name }'),
    ).toEqual([]);
    expect(
      kotlin('fun fill(text: String, name: String): String =\n  text.replace("{name}", name)'),
    ).toEqual([]);
  });
});
