import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { collectJavaFindings } from '../../../adapters/java-diff.mts';
import { createJavaAnalyzer } from '../../../adapters/java-analyzer.mts';
import { reportFromAnalyzerOutput } from '../../../../../core/diff/execution/report/analyzer-report.mts';
import { renderSnapshotConsole } from '../../../../../core/diff/reporting/summary.mts';
import { entriesOf } from '../../../../../shared/values/findings.mts';
import {
  useMavenPresetProject,
  enabled,
  maven,
  fixtures,
  copyOf,
} from '../../__tests__/maven-preset-project.mts';

const FAILING_STEP = `<build>
    <plugins>
      <plugin>
        <groupId>org.apache.maven.plugins</groupId>
        <artifactId>maven-enforcer-plugin</artifactId>
        <version>3.5.0</version>
        <executions>
          <execution>
            <id>frontend</id>
            <goals><goal>enforce</goal></goals>
            <configuration><rules><alwaysFail /></rules></configuration>
          </execution>
        </executions>
      </plugin>
    </plugins>
  </build>
</project>`;

describe.skipIf(!enabled)('Java preset on a Maven reactor with a module that fails', () => {
  useMavenPresetProject();
  it('keeps the findings of the modules that built and names the failed module', () => {
    const project = copyOf(path.join(fixtures, 'multi-module'));
    const pom = path.join(project, 'checks', 'pom.xml');
    writeFileSync(pom, readFileSync(pom, 'utf8').replace('</project>', FAILING_STEP));

    const findings = collectJavaFindings(project, {
      maven,
      policy: { testSeconds: { unitTestSeconds: -1 } },
    });

    expect(
      findings
        .filter((finding) => finding.classification === 'tool-error')
        .map(({ tool, rule, path: file, message }) => [
          tool,
          rule,
          file,
          message.includes('maven-enforcer-plugin'),
        ]),
    ).toEqual([['maven', 'module-build-failed', 'checks', true]]);
    expect(
      findings
        .filter((finding) => ['errorprone', 'pmd'].includes(finding.tool))
        .map(({ tool, rule, path: file }) => `${tool} ${rule} ${file}`),
    ).toEqual([
      'errorprone PrivateConstructorForUtilityClass app/src/main/java/demo/app/Main.java',
    ]);
    expect(findings.some((finding) => finding.path.startsWith('checks/'))).toBe(false);

    const report = reportFromAnalyzerOutput(
      { ...createJavaAnalyzer(), acceptedExitCodes: [0] },
      { status: 0, signal: null, stdoutText: JSON.stringify({ findings }), stderrText: '' },
    );
    const parsedFindings = entriesOf(report.findings);
    const summary = renderSnapshotConsole(
      {
        summary: {},
        findings: parsedFindings.filter(({ classification }) => classification !== 'tool-error'),
        toolErrors: parsedFindings.filter(({ classification }) => classification === 'tool-error'),
      },
      { color: false, details: false, projectRoot: project },
    );

    expect(summary).toContain('maven: Maven could not build module checks,');
  }, 180_000);
});
