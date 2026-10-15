import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseAnalyzerReport } from '../../../core/diff/finding-schema.mjs';
import { comparisonKey } from '../../../core/diff/fingerprint.mjs';
import { ingestArchunit } from './archunit.mjs';
import { ingestCheckstyle } from './checkstyle.mjs';
import { decodeEntities, parseXml } from './common.mjs';
import { ingestGoCoverprofile } from './gocover.mjs';
import { ingestJacoco } from './jacoco.mjs';
import { ingestLcov } from './lcov.mjs';
import { ingestPit } from './pit.mjs';

const fixture = (name) => readFileSync(path.resolve(import.meta.dirname, 'fixtures', name), 'utf8');

// Simulates edits above every finding: all line numbers in the report move down.
const SHIFT = 17;
const shifters = {
  checkstyle: (text) => text.replace(/line="(\d+)"/g, (_, n) => `line="${Number(n) + SHIFT}"`),
  lcov: (text) => text.replace(/^(DA|FN):(\d+)/gm, (_, kind, n) => `${kind}:${Number(n) + SHIFT}`),
  jacoco: (text) =>
    text.replace(/ (line|nr)="(\d+)"/g, (_, attr, n) => ` ${attr}="${Number(n) + SHIFT}"`),
  archunit: (text) =>
    text.replace(/(\.java:)(\d+)/g, (_, head, n) => `${head}${Number(n) + SHIFT}`),
  pit: (text) => text.replace(/<lineNumber>(\d+)/g, (_, n) => `<lineNumber>${Number(n) + SHIFT}`),
  gocover: (text) =>
    text.replace(
      /:(\d+)\.(\d+),(\d+)\./g,
      (_, a, b, c) => `:${Number(a) + SHIFT}.${b},${Number(c) + SHIFT}.`,
    ),
};

// Stands in for the Java glue: `demo.service.Foo$Inner` -> src/main/java/demo/service/Foo.java
// (test classes live under src/test/java).
const resolveJavaPath = (className, fileName) => {
  const parts = className.split('.');
  const simple = parts.pop().split('$')[0];
  const root = simple.endsWith('Test') ? 'src/test/java' : 'src/main/java';
  return [root, ...parts, fileName ?? `${simple}.java`].join('/');
};
// Stands in for the Java glue: demo.Calc + Calc.java -> src/main/java/demo/Calc.java, and nothing for
// classes without a source file in the project (generated code).
const resolveMainPath = (className, sourceFile) =>
  className === 'demo.Generated'
    ? undefined
    : `src/main/java/${className.split('.').slice(0, -1).join('/')}/${sourceFile}`;

const formats = [
  {
    name: 'checkstyle',
    file: 'checkstyle.xml',
    ingest: (text) => ingestCheckstyle(text, { root: '/work/app' }),
    count: 4,
  },
  {
    name: 'lcov',
    file: 'lcov.info',
    ingest: (text) => ingestLcov(text, { root: '/work/app' }),
    count: 3,
  },
  {
    name: 'jacoco',
    file: 'jacoco.xml',
    ingest: (text) => ingestJacoco(text, { sourceRoot: 'src/main/java' }),
    count: 2,
  },
  {
    name: 'archunit',
    file: 'archunit-junit.xml',
    ingest: (text) => ingestArchunit(text, { resolvePath: resolveJavaPath }),
    count: 3,
  },
  {
    name: 'pit',
    file: 'pit-mutations.xml',
    ingest: (text) => ingestPit(text, { resolvePath: resolveMainPath }),
    count: 8,
  },
  {
    name: 'gocover',
    file: 'coverage.out',
    ingest: (text) => ingestGoCoverprofile(text, { modulePath: 'github.com/acme/app' }),
    count: 2,
  },
];

describe.each(formats)('$name ingester', ({ name, file, ingest, count }) => {
  const base = ingest(fixture(file)).findings;

  it('produces findings that satisfy the findings schema', () => {
    expect(base).toHaveLength(count);
    expect(parseAnalyzerReport({ findings: base }, name).findings).toEqual(base);
  });

  it('keeps identities stable when lines move', () => {
    const head = ingest(shifters[name](fixture(file))).findings;
    expect(shifters[name](fixture(file))).not.toBe(fixture(file));
    expect(head.map((finding) => finding.identity)).toEqual(
      base.map((finding) => finding.identity),
    );
    expect(head.map((finding) => finding.path)).toEqual(base.map((finding) => finding.path));
  });

  it('has unique comparison keys', () => {
    const keys = base.map((finding) =>
      [finding.rule, finding.path, finding.symbol, finding.identity].join('|'),
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
    expect(findings[0].message).toBe("'42' is a magic number.");
    expect(findings[2].message).toContain('<found 120>');
  });

  it('maps severities and numbers repeated messages without using lines', () => {
    expect(findings.map((finding) => finding.classification)).toEqual([
      'enforceable',
      'enforceable',
      'enforceable',
      'descriptive',
    ]);
    expect(findings[1].identity).toBe(`${findings[0].identity}#2`);
    expect(findings[0].location).toEqual({ line: 12, column: 9 });
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
    expect(findings[0].message).toContain('3 violations');
    expect(findings[0].message).not.toMatch(/\.java:\d/);
  });

  it('ignores passing test cases and rejects other documents', () => {
    expect(findings.some((finding) => finding.rule === 'layers_are_respected')).toBe(false);
    expect(() => ingestArchunit('<report/>')).toThrow('<testsuite>');
  });
});

describe('pit', () => {
  const { findings } = ingestPit(fixture('pit-mutations.xml'), { resolvePath: resolveMainPath });
  const summary = (rule) => findings.filter((finding) => finding.rule === rule);

  it('enforces survived and uncovered mutants; other statuses only describe', () => {
    expect(
      findings
        .filter((finding) => finding.rule !== 'mutation-summary')
        .map(({ rule, classification, path: file }) => [rule, classification, file]),
    ).toEqual([
      ['mutant-survived', 'enforceable', 'src/main/java/demo/Calc.java'],
      ['mutant-survived', 'enforceable', 'src/main/java/demo/Calc.java'],
      ['mutant-nocoverage', 'enforceable', 'src/main/java/demo/Greeter.java'],
      ['mutant-timeout', 'descriptive', 'src/main/java/demo/Greeter.java'],
    ]);
  });

  it('identifies mutants by class, method, mutator and description, never by line', () => {
    expect(findings.slice(0, 2).map((finding) => finding.identity)).toEqual([
      'Calc|clamp(I)I|ConditionalsBoundaryMutator|changed conditional boundary#1',
      'Calc|clamp(I)I|ConditionalsBoundaryMutator|changed conditional boundary#2',
    ]);
    expect(findings[2].identity).toBe(
      'Greeter|shout(LString;)LString;|EmptyObjectReturnValsMutator|replaced return value with "" for Greeter::shout#1',
    );
    expect(findings.every((finding) => !/line/i.test(finding.identity))).toBe(true);
  });

  it('numbers repeated mutants in source order whatever order PIT reports them in', () => {
    const [first, second] = fixture('pit-mutations.xml')
      .split('\n')
      .filter((line) => line.includes('changed conditional boundary'));
    const swapped = fixture('pit-mutations.xml')
      .replace(first, '@@')
      .replace(second, first)
      .replace('@@', second);
    const identityAtLine = (report, line) =>
      ingestPit(report, { resolvePath: resolveMainPath }).findings.find(
        (finding) => finding.location?.line === line,
      ).identity;

    expect(identityAtLine(swapped, 5)).toBe(identityAtLine(fixture('pit-mutations.xml'), 5));
    expect(identityAtLine(swapped, 9)).toBe(identityAtLine(fixture('pit-mutations.xml'), 9));
  });

  it('matches the mutants of a class moved to another package, as a git rename', () => {
    const report = (packageName) =>
      `<mutations><mutation detected='false' status='NO_COVERAGE'><sourceFile>AuditService.java</sourceFile><mutatedClass>shop.${packageName}.AuditService</mutatedClass><mutatedMethod>agent</mutatedMethod><methodDescription>(Lshop/${packageName}/Request;)Ljava/lang/String;</methodDescription><lineNumber>9</lineNumber><mutator>org.pitest.mutationtest.engine.gregor.mutators.EmptyObjectReturnValsMutator</mutator><description>replaced return value with &quot;&quot; for shop/${packageName}/AuditService::agent</description></mutation></mutations>`;
    const keys = (packageName, renames) =>
      ingestPit(report(packageName), { resolvePath: resolveJavaPath })
        .findings.filter((finding) => finding.rule === 'mutant-nocoverage')
        .map((finding) => comparisonKey(finding, renames));
    const moved = 'src/main/java/shop/audit/AuditService.java';

    expect(
      keys('service', new Map([['src/main/java/shop/service/AuditService.java', moved]])),
    ).toEqual(keys('audit'));
  });

  it('summarizes status counts as descriptive metrics and skips unresolvable sources', () => {
    expect(
      summary('mutation-summary').map((finding) => [finding.metric.name, finding.metric.value]),
    ).toEqual([
      ['Survived', 3],
      ['Killed', 1],
      ['NoCoverage', 1],
      ['Timeout', 1],
    ]);
    expect(findings.some((finding) => finding.identity.includes('Generated'))).toBe(false);
    expect(() => ingestPit('<report/>')).toThrow('<mutations>');
    expect(ingestPit('<mutations/>').findings).toEqual([]);
  });
});

describe('coverage ingesters', () => {
  it('lcov reports line coverage and uncovered functions by name', () => {
    const { findings } = ingestLcov(fixture('lcov.info'), { root: '/work/app' });
    expect(findings[0]).toMatchObject({
      path: 'src/util.js',
      rule: 'line-coverage',
      classification: 'descriptive',
      metric: { name: 'line-coverage', value: 50 },
    });
    expect(findings[1]).toMatchObject({ rule: 'uncovered-function', symbol: 'format' });
    expect(findings[2].path).toBe('src/other.js');
  });

  it('jacoco reports source file coverage and uncovered methods', () => {
    const { findings } = ingestJacoco(fixture('jacoco.xml'), { sourceRoot: 'src/main/java' });
    expect(findings[0]).toMatchObject({
      path: 'src/main/java/com/acme/Foo.java',
      metric: { name: 'line-coverage', value: 60 },
    });
    expect(findings[1]).toMatchObject({
      rule: 'uncovered-method',
      symbol: 'com.acme.Foo#unused(I)I',
    });
    expect(() => ingestJacoco('<x/>')).toThrow('<report>');
  });

  it('go coverprofile aggregates statements per file', () => {
    const { findings } = ingestGoCoverprofile(fixture('coverage.out'), {
      modulePath: 'github.com/acme/app',
    });
    expect(findings.map((finding) => [finding.path, finding.metric.value])).toEqual([
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
    expect(root.children[0].attrs.y).toBe('&');
  });

  it('rejects malformed documents', () => {
    expect(() => parseXml('<a><b></a>')).toThrow('does not match');
    expect(() => parseXml('<a>')).toThrow('not closed');
    expect(() => parseXml('')).toThrow('no root');
  });

  it('decodes numeric entities and leaves unknown ones', () => {
    expect(decodeEntities('&#65;&#x42;&bogus;&#0;')).toBe('AB&bogus;&#0;');
  });
});
