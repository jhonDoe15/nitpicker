import { describe, expect, it } from 'vitest';
import { parseSource as untypedParse } from '../max-value-sums/source-file.mjs';
import { findAffixChecks as untypedFind } from './affix-calls.mjs';

type Check = { readonly line: number; readonly kind: string };

const parse: (text: string, options: { file: string; kotlin: boolean }) => unknown = untypedParse;
const find: (source: unknown) => Check[] = untypedFind;

function java(body: string) {
  const text =
    `class Files {\n  void check(String pathname, String base, ` +
    `String hostname, String domain) {\n${body}\n  }\n}\n`;
  return find(parse(text, { file: 'Files.java', kotlin: false })).map(({ kind }) => kind);
}

function kotlin(body: string) {
  const text =
    `class Files {\n  fun check(pathname: String, base: String, ` +
    `hostname: String, domain: String) {\n${body}\n  }\n}\n`;
  return find(parse(text, { file: 'Files.kt', kotlin: true })).map(({ kind }) => kind);
}

describe('AffixWithoutBoundary in Java', () => {
  it('reports a prefix, suffix and origin check without a boundary', () => {
    expect(java('if (pathname.startsWith(base)) { }')).toEqual(['prefix']);
    expect(java('boolean in = pathname.startsWith(this.base);')).toEqual(['prefix']);
    expect(java('if (hostname.endsWith(domain)) { }')).toEqual(['suffix']);
    expect(java('if (hostname.endsWith("example.com")) { }')).toEqual(['suffix']);
    expect(java('if (pathname.startsWith("http://localhost")) { }')).toEqual(['origin']);
    expect(java('if (pathname.startsWith("/repos/" + base)) { }')).toEqual(['prefix']);
    expect(java('if (request.getPath().startsWith(base)) { }')).toEqual(['prefix']);
    expect(java('if (path.toString().startsWith(base)) { }')).toEqual(['prefix']);
  });

  it('allows a separator boundary, an equality test and non-path names', () => {
    expect(java('if (pathname.startsWith(base + "/")) { }')).toEqual([]);
    expect(java('if (pathname.startsWith(base + File.separator)) { }')).toEqual([]);
    expect(java('if (pathname.equals(base) || pathname.startsWith(base + "/")) { }')).toEqual([]);
    expect(java('if (pathname.equals(base) || pathname.startsWith(base)) { }')).toEqual([]);
    expect(java('String prefix = base + "/"; if (pathname.startsWith(prefix)) { }')).toEqual([]);
    expect(java('if (pathname.startsWith("/api/")) { }')).toEqual([]);
    expect(java('if (pathname.startsWith("/maintenance")) { }')).toEqual([]);
    expect(java('if (hostname.equals(domain) || hostname.endsWith("." + domain)) { }')).toEqual([]);
    expect(java('if (hostname.endsWith(".example.com")) { }')).toEqual([]);
    expect(java('if (domain.startsWith(".") && hostname.endsWith(domain)) { }')).toEqual([]);
    expect(java('if (pathname.contains("node_modules")) { }')).toEqual([]);
    expect(java('if (!hostname.startsWith("[") && !hostname.endsWith("]")) { }')).toEqual([]);
    expect(
      java("if (pathname.startsWith(base) && pathname.charAt(base.length()) == '/') { }"),
    ).toEqual([]);
    expect(
      java('if (pathname.startsWith(base) && pathname.length() == base.length()) { }'),
    ).toEqual([]);
    expect(
      java('String b = base; b = b.endsWith("/") ? b : b + "/"; if (pathname.startsWith(b)) { }'),
    ).toEqual([]);
    expect(java('String b = base; b += "/"; if (pathname.startsWith(b)) { }')).toEqual([]);
    expect(java('if (pathname.contains("/node_modules/")) { }')).toEqual([]);
    expect(java('if (pathname.startsWith(base, 2)) { }')).toEqual([]);
    expect(java('if (pathname.startsWith("http://localhost/")) { }')).toEqual([]);
    expect(java('if (name.startsWith(prefix)) { }')).toEqual([]);
    expect(java('if (hostname.endsWith(pattern.substring(1))) { }')).toEqual([]);
  });

  it('leaves a Path alone, since Path.startsWith compares whole segments', () => {
    const text =
      'class A {\n  boolean in(Path file, Path base) { return file.startsWith(base); }\n}\n';
    expect(find(parse(text, { file: 'A.java', kotlin: false }))).toEqual([]);
  });
});

describe('AffixWithoutBoundary in Kotlin', () => {
  it('reports the same forms', () => {
    expect(kotlin('if (pathname.startsWith(base)) { }')).toEqual(['prefix']);
    expect(kotlin('if (hostname.endsWith(domain)) { }')).toEqual(['suffix']);
    expect(kotlin('if (pathname.startsWith("/repos/$base")) { }')).toEqual(['prefix']);
    expect(kotlin('if (pathname.startsWith("http://localhost")) { }')).toEqual(['origin']);
  });

  it('allows the boundary forms', () => {
    expect(kotlin('if (pathname.startsWith("$base/")) { }')).toEqual([]);
    expect(kotlin('if (pathname == base || pathname.startsWith("$base/")) { }')).toEqual([]);
    expect(kotlin('if (hostname.endsWith(".$domain")) { }')).toEqual([]);
    expect(kotlin('if (pathname.startsWith("/maintenance")) { }')).toEqual([]);
  });
});
