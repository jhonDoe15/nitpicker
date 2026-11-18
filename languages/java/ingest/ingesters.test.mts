import { describe, expect, it } from 'vitest';
import { parseAnalyzerReport } from '../../../core/diff/comparison/finding-schema.mjs';
import { ingestArchunit } from './archunit.mts';
import { ingestCheckstyle } from './formatting/checkstyle.mts';
import { decodeEntities as untypedDecodeEntities } from '../../../shared/ingest/common.mjs';
import { parseXml } from '../../../shared/values/xml.mts';
import { ingestGoCoverprofile } from './coverage-reports/gocover.mts';
import { ingestJacoco } from './coverage-reports/jacoco.mts';
import { ingestLcov } from './coverage-reports/lcov.mts';
import { ingestPit } from './pit.mts';
import { fixture, resolveJavaPath, resolveMainPath } from './__tests__/ingest-fixtures.mts';
import { findingsOf } from '../adapters/typed/java-values.mts';
import { fieldOf } from '../../../shared/values/readers.mts';

type Shift = (text: string) => string;
type Format = {
  readonly name: keyof typeof shifters;
  readonly file: string;
  readonly ingest: (text: string) => { readonly findings: readonly unknown[] };
  readonly count: number;
};

const decodeEntities: (text: string) => string = untypedDecodeEntities;

// Simulates edits above every finding: all line numbers in the report move down.
const SHIFT = 17;
const shifters: Record<string, Shift> = {
  checkstyle: (text: string) =>
    text.replace(/line="(\d+)"/g, (_: string, n: string) => `line="${String(Number(n) + SHIFT)}"`),
  lcov: (text: string) =>
    text.replace(
      /^(DA|FN):(\d+)/gm,
      (_: string, kind: string, n: string) => `${kind}:${String(Number(n) + SHIFT)}`,
    ),
  jacoco: (text: string) =>
    text.replace(
      / (line|nr)="(\d+)"/g,
      (_: string, attr: string, n: string) => ` ${attr}="${String(Number(n) + SHIFT)}"`,
    ),
  archunit: (text: string) =>
    text.replace(
      /(\.java:)(\d+)/g,
      (_: string, head: string, n: string) => `${head}${String(Number(n) + SHIFT)}`,
    ),
  pit: (text: string) =>
    text.replace(
      /<lineNumber>(\d+)/g,
      (_: string, n: string) => `<lineNumber>${String(Number(n) + SHIFT)}`,
    ),
  gocover: (text: string) =>
    text.replace(
      /:(\d+)\.(\d+),(\d+)\./g,
      (_: string, a: string, b: string, c: string) =>
        `:${String(Number(a) + SHIFT)}.${b},${String(Number(c) + SHIFT)}.`,
    ),
};

const formats: Format[] = [
  {
    name: 'checkstyle',
    file: 'checkstyle.xml',
    ingest: (text: string) => ingestCheckstyle(text, { root: '/work/app' }),
    count: 4,
  },
  {
    name: 'lcov',
    file: 'lcov.info',
    ingest: (text: string) => ingestLcov(text, { root: '/work/app' }),
    count: 3,
  },
  {
    name: 'jacoco',
    file: 'jacoco.xml',
    ingest: (text: string) => ingestJacoco(text, { sourceRoot: 'src/main/java' }),
    count: 2,
  },
  {
    name: 'archunit',
    file: 'archunit-junit.xml',
    ingest: (text: string) => ingestArchunit(text, { resolvePath: resolveJavaPath }),
    count: 3,
  },
  {
    name: 'pit',
    file: 'pit-mutations.xml',
    ingest: (text: string) => ingestPit(text, { resolvePath: resolveMainPath }),
    count: 8,
  },
  {
    name: 'gocover',
    file: 'coverage.out',
    ingest: (text: string) => ingestGoCoverprofile(text, { modulePath: 'github.com/acme/app' }),
    count: 2,
  },
];

describe.each(formats)('$name ingester', ({ name, file, ingest, count }) => {
  const base = findingsOf(ingest(fixture(file)).findings);

  it('produces findings that satisfy the findings schema', () => {
    expect(base).toHaveLength(count);
    expect(parseAnalyzerReport({ findings: base }, name).findings).toEqual(base);
  });

  it('keeps identities stable when lines move', () => {
    const shift = shifters[name] ?? ((text: string) => text);
    const head = findingsOf(ingest(shift(fixture(file))).findings);
    expect(shift(fixture(file))).not.toBe(fixture(file));
    expect(head.map((finding) => finding.identity)).toEqual(
      base.map((finding) => finding.identity),
    );
    expect(head.map((finding) => finding.path)).toEqual(base.map((finding) => finding.path));
  });

  it('has unique comparison keys', () => {
    const keys = base.map((finding) =>
      [finding.rule, finding.path, finding['symbol'], finding.identity].join('|'),
    );
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('checkstyle', () => {
  const { findings } = ingestCheckstyle(fixture('checkstyle.xml'), { root: '/work/app' });

  it('relativizes paths, drops files outside the root and decodes entities', () => {
    expect(findings.every((finding) => finding.path === 'src/main/java/com/acme/Foo.java')).toBe(
      true,
    );
    expect(findings[0]?.message).toBe("'42' is a magic number.");
    expect(findings[2]?.message).toEqual('Line is longer than 100 characters <found 120>.');
  });

  it('maps severities and numbers repeated messages without using lines', () => {
    expect(findings.map((finding) => finding.classification)).toEqual([
      'enforceable',
      'enforceable',
      'enforceable',
      'descriptive',
    ]);
    expect(findings[1]?.identity).toBe(`${findings[0]?.identity ?? ''}#2`);
    expect(findings[0]?.location).toEqual({ line: 12, column: 9 });
  });

  it('rejects other documents', () => {
    expect(() => ingestCheckstyle('<report/>')).toThrow('<checkstyle>');
  });
});

describe('archunit', () => {
  const { findings } = ingestArchunit(fixture('archunit-junit.xml'), {
    resolvePath: resolveJavaPath,
  });

  it('reports one enforceable finding per violated rule and offending class', () => {
    expect(
      findings.map(({ rule, path: file, identity, classification }) => [
        rule,
        file,
        identity,
        classification,
      ]),
    ).toEqual([
      [
        'services_do_not_use_dao',
        'src/main/java/demo/service/OrderService.java',
        'demo.service.OrderService',
        'enforceable',
      ],
      [
        'services_do_not_use_dao',
        'src/main/java/demo/service/Audit.java',
        'demo.service.Audit$Entry',
        'enforceable',
      ],
      [
        'no_cycles',
        'src/test/java/demo/ArchitectureTest.java',
        'demo.ArchitectureTest:test-failure',
        'enforceable',
      ],
    ]);
    expect(findings[0]?.message).toEqual(
      'ArchUnit rule services_do_not_use_dao violated by demo.service.OrderService (3 violations): Constructor <demo.service.OrderService.<init>(demo.dao.OrderDao)> has parameter of type <demo.dao.OrderDao>',
    );
    expect(findings[0]?.message).not.toMatch(/\.java:\d/);
  });

  it('passes the Kotlin or Groovy file a violation names to the path resolver', () => {
    const resolved: unknown[] = [];
    const report = (fileName: string): string =>
      `<testsuite name="demo.NamingArchTest"><testcase name="servicesOnly" classname="demo.NamingArchTest"><failure message="Rule violated (1 times):&#10;Class &lt;demo.Calc&gt; does not have simple name ending with 'Service' in (${fileName}:0)"/></testcase></testsuite>`;
    for (const fileName of ['Calc.kt', 'Calc.groovy']) {
      ingestArchunit(report(fileName), {
        resolvePath: (className: string, sourceFile: string | undefined) => {
          resolved.push([className, sourceFile]);
          return undefined;
        },
      });
    }

    expect(resolved).toEqual([
      ['demo.NamingArchTest', undefined],
      ['demo.Calc', 'Calc.kt'],
      ['demo.NamingArchTest', undefined],
      ['demo.Calc', 'Calc.groovy'],
    ]);
  });

  it('reports a rule that failed and passed on a rerun', () => {
    const xml =
      '<testsuite name="demo.NamingArchTest"><testcase name="servicesOnly" classname="demo.NamingArchTest"><flakyFailure message="Rule violated (1 times):&#10;Class &lt;demo.Calc&gt; does not have simple name ending with \'Service\'"/></testcase></testsuite>';
    const { findings: flaky } = ingestArchunit(xml, { resolvePath: () => 'src/Calc.java' });

    expect(flaky.map(({ rule, symbol }) => [rule, symbol])).toEqual([
      ['servicesOnly', 'demo.Calc'],
    ]);
  });

  it('ignores passing test cases and rejects other documents', () => {
    expect(findings.some((finding) => finding.rule === 'layers_are_respected')).toBe(false);
    expect(() => ingestArchunit('<report/>')).toThrow('<testsuite>');
  });
});

describe('coverage ingesters', () => {
  it('lcov reports line coverage and uncovered functions by name', () => {
    const { findings } = ingestLcov(fixture('lcov.info'), { root: '/work/app' });
    expect(findings[0]).toEqual({
      tool: 'lcov',
      rule: 'line-coverage',
      path: 'src/util.js',
      identity: 'line-coverage',
      message: 'line-coverage 50% (2/4)',
      classification: 'descriptive',
      metric: { name: 'line-coverage', value: 50 },
    });
    expect(findings[1]).toEqual({
      tool: 'lcov',
      rule: 'uncovered-function',
      path: 'src/util.js',
      identity: 'cov:format',
      message: 'Function format is not covered',
      classification: 'descriptive',
      symbol: 'format',
    });
    expect(findings[2]?.path).toBe('src/other.js');
  });

  it('jacoco reports source file coverage and uncovered methods', () => {
    const { findings } = ingestJacoco(fixture('jacoco.xml'), { sourceRoot: 'src/main/java' });
    expect(findings[0]).toEqual({
      tool: 'jacoco',
      rule: 'line-coverage',
      path: 'src/main/java/com/acme/Foo.java',
      identity: 'line-coverage',
      message: 'line-coverage 60% (3/5)',
      classification: 'descriptive',
      metric: { name: 'line-coverage', value: 60 },
    });
    expect(findings[1]).toEqual({
      tool: 'jacoco',
      rule: 'uncovered-method',
      path: 'src/main/java/com/acme/Foo.java',
      identity: 'cov:com.acme.Foo#unused(I)I',
      message: 'Method com.acme.Foo#unused(I)I is not covered',
      classification: 'descriptive',
      symbol: 'com.acme.Foo#unused(I)I',
    });
    expect(() => ingestJacoco('<x/>')).toThrow('<report>');
  });

  it('go coverprofile aggregates statements per file', () => {
    const { findings } = ingestGoCoverprofile(fixture('coverage.out'), {
      modulePath: 'github.com/acme/app',
    });
    expect(
      findings.map((finding) => [
        fieldOf(finding, 'path'),
        fieldOf(fieldOf(finding, 'metric'), 'value'),
      ]),
    ).toEqual([
      ['pkg/a.go', 60],
      ['main.go', 0],
    ]);
  });
});

describe('parseXml', () => {
  it('handles CDATA, comments, self-closing tags and single-quoted attributes', () => {
    const root = parseXml(
      "<?xml version='1.0'?><a x='1'><!-- c --><![CDATA[<b/>]]><c y=\"&amp;\"/></a>",
    );
    expect(root.attrs).toEqual({ x: '1' });
    expect(root.children).toHaveLength(1);
    expect(root.children[0]?.attrs['y']).toBe('&');
  });

  it('rejects malformed documents', () => {
    expect(() => parseXml('<a><b></a>')).toThrow('does not match');
    expect(() => parseXml('<a>')).toThrow('not closed');
    expect(() => parseXml('')).toThrow('no root');
  });

  it('skips a document type with an internal subset and reads a slash-closed root', () => {
    const root = parseXml('<!DOCTYPE r [<!ENTITY e "x">] ><r a="1" b=\'/\'/>');
    expect(root.name).toBe('r');
    expect(root.attrs).toEqual({ a: '1', b: '/' });
  });

  it('gives up on a long unclosed tag without backtracking over its name', () => {
    expect(() => parseXml(`<r><${'a'.repeat(100_000)}`)).toThrow('<r> is not closed');
  });

  it('decodes numeric entities and leaves unknown ones', () => {
    expect(decodeEntities('&#65;&#x42;&bogus;&#0;')).toBe('AB&bogus;&#0;');
  });
});
