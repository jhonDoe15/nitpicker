import { describe, it, expect } from 'vitest';
import { runJavaDiff } from '../../../java-diff.mjs';
import { runGitIn } from '../../../test-support/gradle-e2e.mjs';
import {
  useJavaPresetProject,
  enabled,
  gradle,
  repository,
} from '../../__tests__/java-preset-project.mjs';

describe.skipIf(!enabled)('Java preset end to end', () => {
  const fixture = useJavaPresetProject();
  it('fails a package depending on a less stable package and reports coupling metrics as descriptive', () => {
    const result = fixture.diffOf('stability');

    expect(result.failed).toBe(true);
    const coupling = (findings) => findings.filter((finding) => finding.tool === 'coupling');
    expect(
      coupling(result.newEnforceable).map(({ rule, identity, message }) => ({
        rule,
        identity,
        message,
      })),
    ).toEqual([
      {
        rule: 'stability-direction',
        identity: 'package-edge:stable->churn',
        message:
          'stable depends on less stable package churn. If this is intended, add {"rule":"stability-direction","paths":["stable"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
      },
    ]);
    const metrics = coupling(result.newFindings).filter(
      (finding) => finding.classification === 'descriptive',
    );
    expect(
      metrics.find((finding) => finding.identity === 'package:stable:instability').metric,
    ).toEqual({ name: 'instability', value: expect.closeTo(0.3333, 10) });
    expect(
      metrics.find((finding) => finding.identity === 'package:churn:instability').metric,
    ).toEqual({ name: 'instability', value: expect.closeTo(0.5, 10) });
  }, 180_000);
  it('keeps an existing stability-direction violation baselined when the package is edited', () => {
    runGitIn(repository, 'checkout', '-q', 'stability-edited');
    const result = runJavaDiff({
      repositoryRoot: repository,
      requestedBaseRef: 'stability',
      gradle,
    });

    expect(result.newFindings.filter((finding) => finding.tool === 'coupling')).toEqual([]);
    expect(
      result.unchangedFindings
        .filter((finding) => finding.rule === 'stability-direction')
        .map((finding) => finding.identity),
    ).toEqual(['package-edge:stable->churn']);
  }, 180_000);
});
