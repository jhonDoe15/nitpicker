import { describe, expect, it } from 'vitest';
import { compareFindings } from '../../../core/diff/comparison/compare.mjs';
import { baseMoves, comparisonKey } from '../../../core/diff/comparison/fingerprint.mjs';
import { ingestCheckstyle } from './formatting/checkstyle.mjs';
import { ingestErrorProne } from './errorprone/errorprone.mts';
import { ingestJacoco } from './coverage-reports/jacoco.mts';

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
  return findings.map((finding) => comparisonKey(finding, renames && baseMoves(renames)));
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
    {
      language: 'Kotlin non-file',
      root: 'src/main/kotlin',
      sourceFile: 'Models.kt',
      className: 'Order',
    },
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

describe('findings whose message names a class of a package that moved', () => {
  const MOVE = new Map([
    ['src/main/java/shop/service/Request.java', 'src/main/java/shop/audit/Request.java'],
  ]);
  const FILE = 'src/main/java/shop/Audit.java';

  function compared(base, head) {
    const { newFindings, unchangedFindings } = compareFindings({
      baseFindings: base,
      headFindings: head,
      baseToHeadRenames: MOVE,
    });
    return { fresh: newFindings.length, kept: unchangedFindings.length };
  }

  function unusedImports(...names) {
    const errors = names.map(
      (name, index) =>
        `<error line="${String(3 + index)}" severity="error" message="Unused import - ${name}." source="com.puppycrawl.tools.checkstyle.checks.imports.UnusedImportsCheck"/>`,
    );
    return ingestCheckstyle(
      `<checkstyle version="10.12.0"><file name="${ROOT}/${FILE}">${errors.join('')}</file></checkstyle>`,
      { root: ROOT },
    ).findings;
  }

  function errorProne(typeName) {
    const diagnostic = {
      file: `/project/${FILE}`,
      line: 7,
      message: `[UnusedVariable] The field 'request' of type ${typeName} is never read.`,
    };
    return ingestErrorProne(JSON.stringify([diagnostic]), {
      resolvePath: (file) => file.slice('/project/'.length),
    }).findings;
  }

  it('keeps an unused import of a class that moved, whose import line the move rewrote', () => {
    expect(
      compared(
        unusedImports('shop.service.Request', 'java.util.List'),
        unusedImports('shop.audit.Request', 'java.util.List'),
      ),
    ).toEqual({ fresh: 0, kept: 2 });
  });

  it('keeps an Error Prone finding that names a class that moved', () => {
    expect(compared(errorProne('shop.service.Request'), errorProne('shop.audit.Request'))).toEqual({
      fresh: 0,
      kept: 1,
    });
  });

  it('reports an unused import swapped for another class of the same name as new', () => {
    expect(compared(unusedImports('a.Foo'), unusedImports('b.Foo'))).toEqual({
      fresh: 1,
      kept: 0,
    });
    expect(compared(errorProne('a.Foo'), errorProne('b.Foo'))).toEqual({ fresh: 1, kept: 0 });
  });

  it('reports an unused import of a class that did not move as new when it names another one', () => {
    expect(
      compared(unusedImports('shop.service.Other'), unusedImports('shop.audit.Other')),
    ).toEqual({ fresh: 1, kept: 0 });
  });
});
