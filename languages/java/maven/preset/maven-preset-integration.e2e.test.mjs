import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { collectJavaFindings } from '../../adapters/java-diff.mjs';
import {
  useMavenPresetProject,
  enabled,
  maven,
  fixtures,
  copyOf,
  copiedTestCases,
  lineCoverage,
} from '../__tests__/maven-preset-project.mjs';

describe.skipIf(!enabled)('Java preset on Maven builds', () => {
  useMavenPresetProject();
  it('runs verify when Failsafe is bound, counting its tests for coverage and the integration budget', () => {
    const project = copyOf(path.join(fixtures, 'failsafe'));
    const findings = collectJavaFindings(project, {
      maven,
      policy: { testSeconds: { integrationTestSeconds: -1 } },
    });
    const cases = copiedTestCases(project);
    const seconds = cases[0].seconds.toFixed(1);
    const exception =
      '{"rule":"slow-test","paths":["src/test/java/demo/GreeterIT.java"],"reason":"..."}';

    expect(cases.map(({ task, className, name }) => `${task} ${className}#${name}`)).toEqual([
      'failsafe demo.GreeterIT#saysGoodbye',
      'surefire demo.GreeterTest#greets',
    ]);
    expect(existsSync(path.join(project, 'target/greeter-1.0.jar'))).toBe(true);
    expect(findings.filter((finding) => finding.tool === 'jacoco')).toEqual([
      lineCoverage('100% (3/3)', 100),
    ]);
    expect(findings.filter((finding) => finding.tool === 'test-runtime')).toEqual([
      {
        tool: 'test-runtime',
        rule: 'slow-test',
        path: 'src/test/java/demo/GreeterIT.java',
        identity: 'test:demo.GreeterIT#saysGoodbye',
        location: { line: 9 },
        message:
          `GreeterIT saysGoodbye took ${seconds} s; an integration test may take -1 s. ` +
          'Remove Thread.sleep and other waits, start a smaller Spring context or a test slice. ' +
          `If this is intended, add ${exception} to "exceptions" in nitpicker.config.json.`,
        classification: 'enforceable',
      },
    ]);
  }, 180_000);
  it('stays on test when the project keeps its integration tests off with skipITs', () => {
    const project = copyOf(path.join(fixtures, 'failsafe'));
    const pom = path.join(project, 'pom.xml');
    writeFileSync(
      pom,
      readFileSync(pom, 'utf8').replace('<properties>', '<properties><skipITs>true</skipITs>'),
    );
    const findings = collectJavaFindings(project, { maven, policy: {} });

    expect(
      copiedTestCases(project).map(({ task, className, name }) => `${task} ${className}#${name}`),
    ).toEqual(['surefire demo.GreeterTest#greets']);
    expect(
      ['target/failsafe-reports', 'target/greeter-1.0.jar'].map((file) =>
        existsSync(path.join(project, file)),
      ),
    ).toEqual([false, false]);
    expect(findings.filter((finding) => finding.tool === 'jacoco')).toEqual([
      lineCoverage('66.67% (2/3)', 66.67),
      {
        tool: 'jacoco',
        rule: 'uncovered-method',
        path: 'src/main/java/demo/Greeter.java',
        identity: 'cov:a14fde8c431ba476',
        symbol: 'demo.Greeter#farewell(Ljava/lang/String;)Ljava/lang/String;',
        message:
          'Method demo.Greeter#farewell(Ljava/lang/String;)Ljava/lang/String; is not covered',
        classification: 'descriptive',
      },
    ]);
  }, 180_000);
});
