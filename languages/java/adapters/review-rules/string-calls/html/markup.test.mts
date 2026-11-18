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
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-jvm-markup-'));
  roots.push(root);
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), text);
  return read(root, { projects: [PROJECT], kotlin }).filter(
    ({ rule }) => rule === 'UnescapedHtmlValue',
  );
}

function java(body: string) {
  return scan(
    'src/main/java/shop/Pages.java',
    `package shop;\nclass Pages {\n${body}\n}\n`,
    false,
  ).map(({ location }) => location.line);
}

function kotlin(body: string) {
  return scan(
    'src/main/kotlin/shop/Pages.kt',
    `package shop\nclass Pages {\n${body}\n}\n`,
    true,
  ).map(({ location }) => location.line);
}

describe('Java HTML strings', () => {
  it('reports a value concatenated or formatted into markup without escaping', () => {
    expect(
      java(
        'String link(String url, String title) {\n  return "<a href=\\"" + url + "\\">" + title + "</a>";\n}',
      ),
    ).toEqual([4]);
    expect(
      java('String row(String name) {\n  return String.format("<td>%s</td>", name);\n}'),
    ).toEqual([4]);
    expect(java('String row(String name) {\n  return "<td>%s</td>".formatted(name);\n}')).toEqual([
      4,
    ]);
    expect(
      java(
        'void write(StringBuilder out, String alt) {\n  out.append("<img alt=\\"" + alt + "\\">");\n}',
      ),
    ).toEqual([4]);
  });

  it('leaves escaped, numeric, constant and non-markup strings alone', () => {
    expect(
      java('String row(String name) {\n  return "<td>" + HtmlUtils.htmlEscape(name) + "</td>";\n}'),
    ).toEqual([]);
    expect(
      java(
        'String row(String name) {\n  return String.format("<td>%s</td>", escapeHtml(name));\n}',
      ),
    ).toEqual([]);
    expect(
      java(
        'String row(java.util.List<String> names) {\n  return "<td>" + names.size() + "</td>";\n}',
      ),
    ).toEqual([]);
    expect(
      java('String row(int count) {\n  return String.format("<td>%d</td>", count);\n}'),
    ).toEqual([]);
    expect(java('String row() {\n  return "<td>" + "static" + "</td>";\n}')).toEqual([]);
    expect(java('String row(int n) {\n  return "<td>" + n + "</td>";\n}')).toEqual([]);
    expect(java('String row(long n) {\n  return String.format("<td>%s</td>", n);\n}')).toEqual([]);
    expect(
      java(
        'void check(String to) {\n  throw new IllegalStateException("<Link to=\\"" + to + "\\"> is bad: <div>");\n}',
      ),
    ).toEqual([]);
    expect(
      java('void check(String to) {\n  log.warn("<div> in " + to + " is not allowed");\n}'),
    ).toEqual([]);
    expect(java('String row(String to) {\n  return "<Link to=" + to + ">";\n}')).toEqual([]);
    expect(java('String compare(String left) {\n  return "if a<b then " + left;\n}')).toEqual([]);
    expect(java('String row(String name) {\n  return "name: " + name;\n}')).toEqual([]);
  });
});

describe('Kotlin HTML strings', () => {
  it('reports a template that puts a value into markup', () => {
    expect(kotlin('fun row(name: String): String =\n  "<td>$name</td>"')).toEqual([4]);
    expect(kotlin('fun link(user: User): String =\n  "<a href=\\"${user.url}\\">x</a>"')).toEqual([
      4,
    ]);
  });

  it('leaves escaped and numeric template parts alone', () => {
    expect(kotlin('fun row(name: String): String =\n  "<td>${escapeHtml(name)}</td>"')).toEqual([]);
    expect(kotlin('fun row(items: List<String>): String =\n  "<td>${items.size}</td>"')).toEqual(
      [],
    );
    expect(kotlin('fun row(): String =\n  "<td>static</td>"')).toEqual([]);
    expect(kotlin('fun row(n: Int): String =\n  "<td>$n</td>"')).toEqual([]);
    expect(
      kotlin('fun row(to: String): Nothing =\n  throw IllegalStateException("<div id=$to>")'),
    ).toEqual([]);
  });
});
