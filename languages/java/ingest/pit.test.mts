import { describe, expect, it } from 'vitest';
import { baseMoves, comparisonKey } from '../../../core/diff/comparison/fingerprint.mjs';
import { compareFindings } from '../../../core/diff/comparison/compare.mjs';
import { callUntyped, findingsOf } from '../adapters/typed/java-values.mts';
import { fieldOf } from '../../../shared/values/readers.mts';
import { ingestPit } from './pit.mts';
import { fixture, resolveJavaPath, resolveMainPath } from './__tests__/ingest-fixtures.mts';

describe('pit', () => {
  const { findings: reported } = ingestPit(fixture('pit-mutations.xml'), {
    resolvePath: resolveMainPath,
  });
  const findings = findingsOf(reported);
  const summary = (rule: string) => findings.filter((finding) => finding.rule === rule);

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

  it('names the equivalent-mutant cases in a survived mutant, whichever tool names it', () => {
    const message =
      'Survived ConditionalsBoundaryMutator: changed conditional boundary: no test fails when this code changes. Add an assertion that would. If no input can tell the two apart (a compareTo boundary, a discarded lambda return, a field set to the value it already has, a redundant trim() or sorted()), simplify the code so this mutant disappears.';
    const named = findingsOf(
      ingestPit(fixture('pit-mutations.xml'), { tool: 'custom', resolvePath: resolveMainPath })
        .findings,
    );

    expect([findings[0]?.message, named[0]?.message]).toEqual([message, message]);
  });

  it('identifies mutants by class, method, mutator and description, never by line', () => {
    expect(findings.slice(0, 2).map((finding) => finding.identity)).toEqual([
      'Calc|clamp(I)I|ConditionalsBoundaryMutator|changed conditional boundary#1',
      'Calc|clamp(I)I|ConditionalsBoundaryMutator|changed conditional boundary#2',
    ]);
    expect(findings[2]?.identity).toEqual(
      'Greeter|shout(LString;)LString;|EmptyObjectReturnValsMutator|replaced return value with "" for Greeter::shout#1',
    );
    expect(findings.every((finding) => !/line/i.test(finding.identity ?? ''))).toBe(true);
  });

  it('numbers repeated mutants in source order whatever order PIT reports them in', () => {
    const lines = fixture('pit-mutations.xml')
      .split('\n')
      .filter((line) => line.includes('changed conditional boundary'));
    const [first = '', second = ''] = lines;
    const swapped = fixture('pit-mutations.xml')
      .replace(first, '@@')
      .replace(second, first)
      .replace('@@', second);
    const identityAtLine = (report: string, line: number): string | undefined =>
      findingsOf(ingestPit(report, { resolvePath: resolveMainPath }).findings).find(
        (finding) => finding.location?.line === line,
      )?.identity;

    expect(identityAtLine(swapped, 5)).toBe(identityAtLine(fixture('pit-mutations.xml'), 5));
    expect(identityAtLine(swapped, 9)).toBe(identityAtLine(fixture('pit-mutations.xml'), 9));
  });

  it('names the declaration a lambda of an initializer sits in, not the constructor', () => {
    const report = (method: string): string =>
      `<mutations><mutation detected='false' status='SURVIVED'><sourceFile>Wide.java</sourceFile><mutatedClass>demo.Wide</mutatedClass><mutatedMethod>${method}</mutatedMethod><methodDescription>()I</methodDescription><lineNumber>7</lineNumber><mutator>org.pitest.mutationtest.engine.gregor.mutators.ConditionalsBoundaryMutator</mutator><description>changed conditional boundary</description></mutation></mutations>`;
    const symbolOf = (
      method: string,
      functionAt?: (file: string, line: number) => string,
    ): unknown =>
      fieldOf(
        ingestPit(report(method), {
          resolvePath: resolveMainPath,
          ...(functionAt === undefined ? {} : { functionAt }),
        }).findings[0],
        'symbol',
      );
    const functionAt = (file: string, line: number): string => `${file}:${String(line)}:Wide.field`;

    expect(symbolOf('lambda$new$0', functionAt)).toBe('src/main/java/demo/Wide.java:7:Wide.field');
    expect(symbolOf('lambda$new$0')).toBe('Wide#lambda$new$0()I');
    expect(symbolOf('lambda$run$0', functionAt)).toBe('Wide#lambda$run$0()I');
  });

  it('keeps the identity of a lambda or anonymous class mutant when javac renumbers it', () => {
    const mutant = (className: string, method: string, line: number): string =>
      `<mutation detected='false' status='SURVIVED'><sourceFile>Idioms.java</sourceFile><mutatedClass>demo.${className}</mutatedClass><mutatedMethod>${method}</mutatedMethod><methodDescription>(Ljava/lang/String;)Z</methodDescription><lineNumber>${String(line)}</lineNumber><mutator>org.pitest.mutationtest.engine.gregor.mutators.returns.BooleanTrueReturnValsMutator</mutator><description>replaced boolean return with true for demo/${className}::${method}</description></mutation>`;
    const identities = (mutants: readonly string[]): (string | undefined)[] =>
      findingsOf(
        ingestPit(`<mutations>${mutants.join('')}</mutations>`, { resolvePath: resolveMainPath })
          .findings,
      )
        .filter((finding) => (finding.location?.line ?? 0) > 8)
        .map((finding) => finding.identity);

    expect(
      identities([mutant('Idioms', 'lambda$count$0', 9), mutant('Idioms$1', 'test', 14)]),
    ).toEqual(
      identities([
        mutant('Idioms', 'lambda$other$0', 5),
        mutant('Idioms$1', 'apply', 6),
        mutant('Idioms', 'lambda$count$1', 9),
        mutant('Idioms$2', 'test', 14),
      ]),
    );
    expect(identities([mutant('Idioms', 'lambda$count$0', 9)])).toEqual([
      'Idioms|lambda$count(LString;)Z|BooleanTrueReturnValsMutator|replaced boolean return with true for Idioms::lambda$count#1',
    ]);
  });

  it('matches the mutants of a class moved to another package, as a git rename', () => {
    const report = (packageName: string): string =>
      `<mutations><mutation detected='false' status='NO_COVERAGE'><sourceFile>AuditService.java</sourceFile><mutatedClass>shop.${packageName}.AuditService</mutatedClass><mutatedMethod>agent</mutatedMethod><methodDescription>(Lshop/${packageName}/Request;)Ljava/lang/String;</methodDescription><lineNumber>9</lineNumber><mutator>org.pitest.mutationtest.engine.gregor.mutators.EmptyObjectReturnValsMutator</mutator><description>replaced return value with &quot;&quot; for shop/${packageName}/AuditService::agent</description></mutation></mutations>`;
    const keys = (packageName: string, renames?: Map<string, string>): unknown[] =>
      findingsOf(ingestPit(report(packageName), { resolvePath: resolveJavaPath }).findings)
        .filter((finding) => finding.rule === 'mutant-nocoverage')
        .map((finding) => comparisonKey(finding, renames && baseMoves(renames)));
    const moved = 'src/main/java/shop/audit/AuditService.java';

    expect(
      keys('service', new Map([['src/main/java/shop/service/AuditService.java', moved]])),
    ).toEqual(keys('audit'));
  });

  it('keeps a mutant whose method was renamed or given a parameter, on an unchanged line', () => {
    const report = (className: string, method: string, descriptor: string): string =>
      `<mutations><mutation detected='false' status='SURVIVED'><sourceFile>${className}.java</sourceFile><mutatedClass>shop.${className}</mutatedClass><mutatedMethod>${method}</mutatedMethod><methodDescription>${descriptor}</methodDescription><lineNumber>9</lineNumber><mutator>org.pitest.mutationtest.engine.gregor.mutators.EmptyObjectReturnValsMutator</mutator><description>replaced return value with &quot;&quot; for shop/${className}::${method}</description></mutation></mutations>`;
    const findings = (
      className: string,
      method: string,
      descriptor: string,
      line = 'return name;',
    ): unknown[] =>
      findingsOf(
        ingestPit(report(className, method, descriptor), {
          resolvePath: resolveJavaPath,
          sourceText: () => `${'\n'.repeat(8)}    ${line}\n`,
        }).findings,
      ).filter((finding) => finding.rule === 'mutant-survived');
    const compare = (head: unknown[], changedLine: number): number =>
      findingsOf(
        fieldOf(
          callUntyped(compareFindings, {
            unknownOnBase: undefined,
            baseFindings: findings('Audit', 'agent', '()Ljava/lang/String;'),
            headFindings: head,
            baseToHeadRenames: new Map([
              ['src/main/java/shop/Audit.java', 'src/main/java/shop/Log.java'],
            ]),
            touchedCode: {
              changedLines: new Map([
                [
                  'src/main/java/shop/Log.java',
                  { added: false, ranges: [[changedLine, changedLine]] },
                ],
              ]),
              isStrictRule: () => false,
            },
          }),
          'newFindings',
        ),
      ).length;

    expect(compare(findings('Log', 'user', '(I)Ljava/lang/String;'), 8)).toBe(0);
    expect(compare(findings('Log', 'user', '(I)Ljava/lang/String;'), 9)).toBe(1);
    expect(compare(findings('Log', 'user', '(I)Ljava/lang/String;', 'return label;'), 8)).toBe(1);
  });

  it('numbers the mutants of same-named classes in different packages independently', () => {
    const mutant = (packageName: string, line: number, status: string): string =>
      `<mutation detected='false' status='${status}'><sourceFile>Mapper.java</sourceFile><mutatedClass>shop.${packageName}.Mapper</mutatedClass><mutatedMethod>map</mutatedMethod><methodDescription>()I</methodDescription><lineNumber>${String(line)}</lineNumber><mutator>org.pitest.mutationtest.engine.gregor.mutators.MathMutator</mutator><description>Replaced integer addition with subtraction</description></mutation>`;
    const billing = (ordersStatus: string) =>
      findingsOf(
        ingestPit(
          `<mutations>${mutant('orders', 10, ordersStatus)}${mutant('billing', 20, 'SURVIVED')}</mutations>`,
          { resolvePath: resolveJavaPath },
        ).findings,
      ).filter((finding) => finding.path === 'src/main/java/shop/billing/Mapper.java');

    expect(billing('SURVIVED').map((finding) => finding.identity)).toEqual([
      'Mapper|map()I|MathMutator|Replaced integer addition with subtraction#1',
    ]);
    expect(billing('KILLED')).toEqual(billing('SURVIVED'));
  });

  it('summarizes status counts as descriptive metrics and skips unresolvable sources', () => {
    expect(
      summary('mutation-summary').map((finding) => [
        fieldOf(finding['metric'], 'name'),
        fieldOf(finding['metric'], 'value'),
      ]),
    ).toEqual([
      ['Survived', 3],
      ['Killed', 1],
      ['NoCoverage', 1],
      ['Timeout', 1],
    ]);
    expect(findings.some((finding) => finding.identity?.includes('Generated'))).toBe(false);
    expect(() => ingestPit('<report/>')).toThrow('<mutations>');
    expect(ingestPit('<mutations/>').findings).toEqual([]);
  });
});
