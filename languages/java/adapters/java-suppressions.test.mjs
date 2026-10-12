import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fileFindings, readInlineSuppressionFindings } from './java-suppressions.mjs';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const REPOSITORY = `interface Products extends Repository<Product, Long> {
  @SuppressWarnings("PMD.SpringDataNativeQuery")
  @Query(value = """
      select * from product where name like concat(:prefix, '%') for update skip locked
      """, nativeQuery = true)
  List<Product> lockByPrefix(String prefix);
}
`;

const lines = (findings) => findings.map((finding) => finding.location.line);

describe('fileFindings', () => {
  it('accepts the native-query marker on a repository method', () => {
    expect(fileFindings(REPOSITORY, 'Products.java')).toEqual([]);
  });

  it('reports the native-query marker on a type, where it would cover every method', () => {
    const source = `@SuppressWarnings("PMD.SpringDataNativeQuery")\ninterface Products extends Repository<Product, Long> {}\n`;
    expect(lines(fileFindings(source, 'Products.java'))).toEqual([1]);
  });

  it('reports every other PMD suppression and NOPMD comment, but not compiler warnings', () => {
    const source = [
      'class A {',
      '  @SuppressWarnings({"PMD.UnusedPrivateField", "unchecked"})',
      '  private int a;',
      '  @SuppressWarnings("PMD")',
      '  void b() {}',
      '  @SuppressWarnings("all") void c() {}',
      '  private int d; // NOPMD - generated',
      '  @SuppressWarnings({"unchecked", "rawtypes"}) void e() {}',
      '  @SuppressWarnings({"PMD.SpringDataNativeQuery", "PMD.UnusedFormalParameter"}) void f(int x) {}',
      '}',
    ].join('\n');

    const findings = fileFindings(source, 'src/main/java/A.java');

    expect(lines(findings)).toEqual([2, 4, 6, 7, 9]);
    expect(findings[0]).toMatchObject({
      tool: 'pmd',
      rule: 'InlineSuppression',
      path: 'src/main/java/A.java',
      classification: 'enforceable',
    });
    expect(findings[0].message).toContain('"PMD.UnusedPrivateField"');
    expect(findings[3].message).toContain('NOPMD');
  });

  it('keeps identities when lines shift and tells repeated suppressions apart', () => {
    const source =
      'class A {\n  @SuppressWarnings("PMD") void a() {}\n  @SuppressWarnings("PMD") void a() {}\n}\n';
    const shifted = `// header\n\n${source}`;

    const identities = fileFindings(source, 'A.java').map((finding) => finding.identity);

    expect(new Set(identities).size).toBe(2);
    expect(fileFindings(shifted, 'A.java').map((finding) => finding.identity)).toEqual(identities);
  });
});

describe('readInlineSuppressionFindings', () => {
  it('scans the Java files under the main source roots', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-suppressions-'));
    roots.push(root);
    mkdirSync(path.join(root, 'src/main/java/shop'), { recursive: true });
    writeFileSync(
      path.join(root, 'src/main/java/shop/A.java'),
      'class A {\n  @SuppressWarnings("PMD") void a() {}\n}\n',
    );
    writeFileSync(path.join(root, 'src/main/java/shop/Products.java'), REPOSITORY);
    writeFileSync(path.join(root, 'src/main/java/shop/notes.txt'), '@SuppressWarnings("PMD")');

    expect(
      readInlineSuppressionFindings(root, ['src/main/java', 'src/missing']).map(
        (finding) => `${finding.path}:${String(finding.location.line)}`,
      ),
    ).toEqual(['src/main/java/shop/A.java:2']);
  });
});
