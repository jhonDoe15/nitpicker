import { describe, expect, it } from 'vitest';
import { comparisonKey } from '../../../core/diff/comparison/fingerprint.mjs';
import { ingestCheckstyle } from './formatting/checkstyle.mjs';
import { ingestJacoco } from './coverage-reports/jacoco.mjs';

const ROOT = '/work/app';

function checkstyleReport(file, line) {
  return `<checkstyle version="10.12.0"><file name="${ROOT}/${file}">
    <error line="${String(line)}" column="5" severity="error" message="Abbreviation in name &apos;loadXMLFile&apos; must contain no more than &apos;1&apos; consecutive capital letters." source="com.puppycrawl.tools.checkstyle.checks.naming.AbbreviationAsWordInNameCheck"/>
    <error line="${String(line + 4)}" severity="error" message="All overloaded methods should be placed next to each other. Previous overloaded method located at line &apos;${String(line)}&apos;." source="com.puppycrawl.tools.checkstyle.checks.coding.OverloadMethodsDeclarationOrderCheck"/>
  </file></checkstyle>`;
}

function jacocoReport(packageName, { sourceFile, className, method }) {
  const slashed = packageName.replaceAll('.', '/');
  return `<report name="demo"><package name="${slashed}"><class name="${slashed}/${className}" sourcefilename="${sourceFile}">
    <method name="${method}" desc="(L${slashed}/Request;I)Ljava/lang/String;" line="9"><counter type="LINE" missed="3" covered="0"/></method>
  </class></package></report>`;
}

function keys(findings, renames) {
  return findings.map((finding) => comparisonKey(finding, renames));
}

describe('findings of classes moved to another package', () => {
  it('keeps Checkstyle findings of a moved and renamed file, whatever line they moved to', () => {
    const before = 'src/main/java/shop/service/Audit.java';
    const after = 'src/main/java/shop/audit/AuditLog.java';
    const base = ingestCheckstyle(checkstyleReport(before, 12), { root: ROOT }).findings;
    const head = ingestCheckstyle(checkstyleReport(after, 30), { root: ROOT }).findings;

    expect(keys(base, new Map([[before, after]]))).toEqual(keys(head));
    expect(keys(base)).not.toEqual(keys(head));
  });

  it.each([
    { language: 'Java', root: 'src/main/java', sourceFile: 'Audit.java', className: 'Audit' },
    { language: 'Kotlin', root: 'src/main/kotlin', sourceFile: 'Audit.kt', className: 'AuditKt' },
  ])('keeps uncovered $language methods whose class and parameter types moved', (scenario) => {
    const file = (packageName, name = scenario.sourceFile) =>
      `${scenario.root}/${packageName.replaceAll('.', '/')}/${name}`;
    const ingest = (packageName) =>
      ingestJacoco(jacocoReport(packageName, { ...scenario, method: 'agent' }), {
        sourceRoot: scenario.root,
      }).findings;
    const renames = new Map([
      [file('shop.service'), file('shop.audit')],
      [file('shop.service', 'Request.java'), file('shop.audit', 'Request.java')],
    ]);
    const base = ingest('shop.service');
    const head = ingest('shop.audit');

    expect(head.map((finding) => finding.symbol)).toEqual([
      `shop.audit.${scenario.className}#agent(Lshop/audit/Request;I)Ljava/lang/String;`,
    ]);
    expect(keys(base, renames)).toEqual(keys(head));
  });

  it('keeps test-only and slow-test findings keyed by the class name', () => {
    const before = 'src/test/java/shop/service/AuditTest.java';
    const after = 'src/test/java/shop/audit/AuditTest.java';
    const finding = (packageName, path) => [
      {
        tool: 'coupling',
        rule: 'test-only-export',
        path,
        identity: `class:${packageName}.AuditTest`,
      },
      {
        tool: 'test-runtime',
        rule: 'slow-test',
        path,
        identity: `test:${packageName}.AuditTest#records`,
        symbol: `${packageName}.AuditTest`,
      },
    ];

    expect(keys(finding('shop.service', before), new Map([[before, after]]))).toEqual(
      keys(finding('shop.audit', after)),
    );
  });
});
