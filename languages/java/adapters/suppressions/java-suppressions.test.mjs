import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  nestedCheckout,
  useGitCheckouts,
} from '../../../../core/diff/git/test-support/git-checkout.mjs';
import { afterEach, describe, expect, it } from 'vitest';
import { ERROR_PRONE_MESSAGE } from './errorprone/errorprone-escapes.mjs';
import {
  INLINE_SUPPRESSIBLE_RULES,
  fileFindings,
  readInlineSuppressionFindings,
} from './java-suppressions.mjs';

const roots = [];
const { gitCheckout } = useGitCheckouts();
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

const MESSAGE =
  'Do not silence PMD inline: fix the finding. PMD also honors "all", "unused", "serial" and "fallthrough". The one accepted marker is @SuppressWarnings("PMD.SpringDataNativeQuery") on a repository method that needs native SQL.';

const route = (rule, file) =>
  `If this is intended, add {"rule":"${rule}","paths":["${file}"],"reason":"..."} to "exceptions" in nitpicker.config.json.`;
const ERROR_PRONE_ROUTE = route('errorprone/InlineSuppression', 'A.java');
const PMD_ROUTE = route('pmd/InlineSuppression', 'A.java');
const afterMessage = (message, prefix) =>
  message.slice(prefix.length, message.indexOf(' If this is intended'));

const lines = (findings) => findings.map((finding) => finding.location.line);

describe('fileFindings', () => {
  it('accepts the native-query marker on a repository method', () => {
    expect(fileFindings(REPOSITORY, 'Products.java')).toEqual([]);
  });

  it('reports the native-query marker on a type, where it would cover every method', () => {
    const source = `@SuppressWarnings("PMD.SpringDataNativeQuery")\ninterface Products extends Repository<Product, Long> {}\n`;
    expect(lines(fileFindings(source, 'Products.java'))).toEqual([1]);
  });

  it('reports every other PMD suppression, but not compiler warnings or NOPMD comments, which PMD is told to ignore', () => {
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

    expect(lines(findings)).toEqual([2, 4, 6, 9]);
    expect(findings[0]).toEqual({
      tool: 'pmd',
      rule: 'InlineSuppression',
      path: 'src/main/java/A.java',
      identity: expect.stringMatching(/^InlineSuppression:\w+$/),
      message: `${MESSAGE} Found: "PMD.UnusedPrivateField". ${route('pmd/InlineSuppression', 'src/main/java/A.java')}`,
      classification: 'enforceable',
      location: { line: 2 },
    });
    expect(findings.map((finding) => afterMessage(finding.message, MESSAGE))).toEqual([
      ' Found: "PMD.UnusedPrivateField".',
      ' Found: "PMD".',
      ' Found: "all".',
      ' Found: "PMD.SpringDataNativeQuery", "PMD.UnusedFormalParameter".',
    ]);
  });

  it('ignores suppressions that only appear inside strings and comments', () => {
    const source = [
      'class A {',
      '  /** Never write @SuppressWarnings("PMD") here. */',
      '  String a = "// NOPMD";',
      '  String b = """',
      '      @SuppressWarnings("PMD") { ;',
      '      """;',
      '  /* @SuppressWarnings("all") */ void c() {}',
      '}',
    ].join('\n');

    expect(fileFindings(source, 'A.java')).toEqual([]);
  });

  it('reads suppressions written with unicode escapes, constants or PMD warning names', () => {
    const source = [
      'class A {',
      '  @\\u0053uppressWarnings("PMD.X") void a() {}',
      '  @SuppressWarnings("\\u0050MD.X") void b() {}',
      '  @SuppressWarnings(NAME) void c() {}',
      '  @SuppressWarnings("PMD" + ".X") void d() {}',
      '  @SuppressWarnings({"x)", "PMD.X"}) void e() {}',
      '  @SuppressWarnings(value = {"unused", "serial"}) void f() {}',
      '  @SuppressWarnings(value = "unchecked") void g() {}',
      '}',
    ].join('\n');

    expect(
      fileFindings(source, 'A.java')
        .filter((finding) => finding.tool === 'pmd')
        .map(
          (finding) => `${String(finding.location.line)}${afterMessage(finding.message, MESSAGE)}`,
        ),
    ).toEqual([
      '2 Found: "PMD.X".',
      '3 Found: "PMD.X".',
      '4 Found: a constant expression.',
      '5 Found: a constant expression.',
      '6 Found: "PMD.X".',
      '7 Found: "unused", "serial".',
    ]);
  });

  it('reports the native-query marker on a type behind comments and nested annotation arguments', () => {
    const source = [
      '@SuppressWarnings("PMD.SpringDataNativeQuery")',
      '// legacy (see X)',
      '@Foo(a = (1))',
      'public interface R extends JpaRepository<P, Long> {}',
    ].join('\n');
    expect(lines(fileFindings(source, 'R.java'))).toEqual([1]);
  });

  it('reports the native-query marker on a field, even one initialized by a call', () => {
    const source =
      'class A {\n  @SuppressWarnings("PMD.SpringDataNativeQuery")\n  private final B b = make();\n}\n';
    expect(lines(fileFindings(source, 'A.java'))).toEqual([2]);
  });

  it('accepts the native-query marker when the query text holds braces and semicolons', () => {
    const source = REPOSITORY.replace('for update skip locked', "and note = '{;}'");
    expect(fileFindings(source, 'Products.java')).toEqual([]);
  });
});

describe('fileFindings for SpotBugs', () => {
  const SPOTBUGS_MESSAGE = 'Do not silence SpotBugs inline: fix the bug.';
  const prefixOf = (tool) => (tool === 'pmd' ? MESSAGE : SPOTBUGS_MESSAGE);
  const found = (findings) =>
    findings.map(
      ({ tool, location, message }) =>
        `${tool} ${String(location.line)}${afterMessage(message, prefixOf(tool))}`,
    );

  it('reports every @SuppressFBWarnings, without the justification, and not inside comments or strings', () => {
    const source = [
      'import edu.umd.cs.findbugs.annotations.SuppressFBWarnings;',
      'class A {',
      '  @SuppressFBWarnings(value = {"EI_EXPOSE_REP", "NP_NULL"}, justification = "it is fine")',
      '  int[] a() { return x; }',
      '  @SuppressFBWarnings void b() {}',
      '  @edu.umd.cs.findbugs.annotations.SuppressFBWarnings("X") void c() {}',
      '  @SuppressWarnings("PMD") void d() {}',
      '  /* @SuppressFBWarnings */ String e = "@SuppressFBWarnings";',
      '}',
    ].join('\n');

    const findings = fileFindings(source, 'src/main/java/A.java');

    expect(found(findings)).toEqual([
      'spotbugs 3 Found: "EI_EXPOSE_REP", "NP_NULL".',
      'spotbugs 5 Found: a suppression of every bug pattern.',
      'spotbugs 6 Found: "X".',
      'pmd 7 Found: "PMD".',
    ]);
    expect(findings[0]).toEqual({
      tool: 'spotbugs',
      rule: 'InlineSuppression',
      path: 'src/main/java/A.java',
      identity: expect.stringMatching(/^InlineSuppression:\w+$/),
      message: `${SPOTBUGS_MESSAGE} Found: "EI_EXPOSE_REP", "NP_NULL". ${route('spotbugs/InlineSuppression', 'src/main/java/A.java')}`,
      classification: 'enforceable',
      location: { line: 3 },
    });
  });

  it("reads @SuppressWarnings as SpotBugs' own when the file imports it", () => {
    const source = [
      'import edu.umd.cs.findbugs.annotations.SuppressWarnings;',
      'class B {',
      '  @SuppressWarnings("NP") void a() {}',
      '  @edu.umd.cs.findbugs.annotations.SuppressWarnings void b() {}',
      '}',
    ].join('\n');

    expect(found(fileFindings(source, 'B.java'))).toEqual([
      'spotbugs 3 Found: "NP".',
      'spotbugs 4 Found: a suppression of every bug pattern.',
    ]);
  });

  it('still reads java.lang.SuppressWarnings as PMD when the file imports the SpotBugs one', () => {
    const source = [
      'import edu.umd.cs.findbugs.annotations.*;',
      'class B {',
      '  @java.lang.SuppressWarnings("PMD") void a() {}',
      '  @java.lang.SuppressWarnings("unchecked") void b() {}',
      '  @SuppressWarnings("NP") void c() {}',
      '}',
    ].join('\n');

    expect(found(fileFindings(source, 'B.java'))).toEqual([
      'pmd 3 Found: "PMD".',
      'spotbugs 5 Found: "NP".',
    ]);
  });

  it('reports the annotation names SpotBugs honors by suffix, with whitespace after the @', () => {
    const source = [
      'class C {',
      '  @MySuppressFBWarnings("EI") void a() {}',
      '  @AcmeSuppressWarnings("EI") void b() {}',
      '  @ SuppressFBWarnings("NP") void c() {}',
      '  @/* x */edu . umd.cs.findbugs.annotations . SuppressWarnings void d() {}',
      '  @ SuppressWarnings("PMD") void e() {}',
      '}',
    ].join('\n');

    expect(found(fileFindings(source, 'C.java'))).toEqual([
      'spotbugs 2 Found: "EI".',
      'spotbugs 3 Found: "EI".',
      'spotbugs 4 Found: "NP".',
      'spotbugs 5 Found: a suppression of every bug pattern.',
      'pmd 6 Found: "PMD".',
    ]);
  });
});

describe('fileFindings for Error Prone', () => {
  it('reports @SuppressWarnings naming NullAway or a check nitpicker runs, by name or alternative name', () => {
    const source = [
      'class A {',
      '  @SuppressWarnings("NullAway") String a() { return null; }',
      '  @SuppressWarnings({"NullAway.Init", "unchecked"}) private String b;',
      '  @SuppressWarnings("FutureReturnValueIgnored") void c() {}',
      '  @SuppressWarnings("NullAwayLike") void d() {}',
      '  @SuppressWarnings({"dep-ann", "Varifier"}) void e() {}',
      '}',
    ].join('\n');

    expect(
      fileFindings(source, 'A.java').map((finding) => [
        finding.tool,
        finding.rule,
        finding.location.line,
        finding.message,
      ]),
    ).toEqual([
      [
        'errorprone',
        'InlineSuppression',
        2,
        `${ERROR_PRONE_MESSAGE} Found: "NullAway". ${ERROR_PRONE_ROUTE}`,
      ],
      [
        'errorprone',
        'InlineSuppression',
        3,
        `${ERROR_PRONE_MESSAGE} Found: "NullAway.Init". ${ERROR_PRONE_ROUTE}`,
      ],
      [
        'errorprone',
        'InlineSuppression',
        4,
        `${ERROR_PRONE_MESSAGE} Found: "FutureReturnValueIgnored". ${ERROR_PRONE_ROUTE}`,
      ],
      [
        'errorprone',
        'InlineSuppression',
        6,
        `${ERROR_PRONE_MESSAGE} Found: "dep-ann". ${ERROR_PRONE_ROUTE}`,
      ],
    ]);
  });

  it('reports a NullAway suppression next to a PMD one on the same annotation once per tool', () => {
    const source = 'class A {\n  @SuppressWarnings({"PMD", "NullAway"}) void a() {}\n}\n';

    expect(
      fileFindings(source, 'A.java').map((finding) => [finding.tool, finding.message]),
    ).toEqual([
      ['pmd', `${MESSAGE} Found: "PMD". ${PMD_ROUTE}`],
      ['errorprone', `${ERROR_PRONE_MESSAGE} Found: "NullAway". ${ERROR_PRONE_ROUTE}`],
    ]);
  });

  it('leaves "unused", which PMD also honors, to the PMD finding alone', () => {
    const source = 'class A {\n  @SuppressWarnings({"unused", "dep-ann"}) void a() {}\n}\n';

    expect(
      fileFindings(source, 'A.java').map((finding) => [finding.tool, finding.message]),
    ).toEqual([
      ['pmd', `${MESSAGE} Found: "unused". ${PMD_ROUTE}`],
      ['errorprone', `${ERROR_PRONE_MESSAGE} Found: "dep-ann". ${ERROR_PRONE_ROUTE}`],
    ]);
  });
});

describe('fileFindings identities', () => {
  it('keeps identities when lines shift and tells repeated suppressions apart', () => {
    const source =
      'class A {\n  @SuppressWarnings("PMD") void a() {}\n  @SuppressWarnings("PMD") void a() {}\n}\n';
    const shifted = `// header\n\n${source}`;

    const identities = fileFindings(source, 'A.java').map((finding) => finding.identity);

    expect(new Set(identities).size).toBe(2);
    expect(fileFindings(shifted, 'A.java').map((finding) => finding.identity)).toEqual(identities);
  });

  it('tells repeated SpotBugs suppressions apart', () => {
    const source =
      'class A {\n  @SuppressFBWarnings("NP") void a() {}\n  @SuppressFBWarnings("NP") void a() {}\n}\n';

    const identities = fileFindings(source, 'A.java').map((finding) => finding.identity);

    expect(identities).toEqual([identities[0], `${identities[0]}#2`]);
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

describe('the Java skill', () => {
  it('names every accepted marker as the exception to its never-suppress rule', () => {
    const skill = readFileSync(
      path.resolve(import.meta.dirname, '../../../../skills/nitpicker-java/SKILL.md'),
      'utf8',
    );
    const rule = /^\d+\. Never suppress:[\s\S]*?(?=\n\n|\n\d+\. )/mu.exec(skill)?.[0] ?? '';

    expect(
      INLINE_SUPPRESSIBLE_RULES.map((marker) => rule.includes(`@SuppressWarnings("${marker}")`)),
    ).toStrictEqual(INLINE_SUPPRESSIBLE_RULES.map(() => true));
  });
});

describe('readInlineSuppressionFindings in a Git checkout', () => {
  it('reads the files of the checkout, not ignored folders or nested checkouts', () => {
    const silenced = '@SuppressWarnings("PMD")\nclass A {}\n';
    const root = gitCheckout(
      {
        'src/main/java/A.java': silenced,
        'src/main/java/gen/G.java': silenced,
        ...nestedCheckout('src/main/java/agent', { 'X.java': silenced }),
      },
      ['src/main/java/gen/'],
    );

    expect(
      readInlineSuppressionFindings(root, ['src/main/java']).map(({ path: file }) => file),
    ).toEqual(['src/main/java/A.java']);
  });
});
