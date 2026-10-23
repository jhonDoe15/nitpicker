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
    ).toEqual({ name: 'instability', value: 0.3333 });
    expect(
      metrics.find((finding) => finding.identity === 'package:churn:instability').metric,
    ).toEqual({ name: 'instability', value: 0.5 });
  }, 180_000);
  it('fails a feature internal import, a feature cycle and a package cycle from the class graph', () => {
    const result = fixture.diffOf('features');
    const rules = ['feature-internal-import', 'feature-cycle', 'package-cycle'];

    expect(
      result.newEnforceable
        .filter((finding) => finding.tool === 'coupling' && rules.includes(finding.rule))
        .map(({ rule, path, identity }) => `${rule} ${path} ${identity}`)
        .toSorted(),
    ).toEqual([
      'feature-cycle src/main/java/shop/features/billing/Invoice.java src/main/java/shop/features/shipping|feature-cycle',
      'feature-cycle src/main/java/shop/features/shipping/ShippingApi.java src/main/java/shop/features/billing|feature-cycle',
      'feature-internal-import src/main/java/shop/features/billing/Invoice.java feature-internal:src/main/java/shop/features/shipping/internal/Writer.java',
      'package-cycle src/main/java/shop/catalog/Catalog.java cycle:shop.catalog',
      'package-cycle src/main/java/shop/pricing/Prices.java cycle:shop.pricing',
    ]);
  }, 180_000);
  it("fails domain infrastructure use and another feature's persistence from the class graph", () => {
    const result = fixture.diffOf('domain');
    const root = 'src/main/java/shop';

    expect(
      result.newEnforceable
        .filter(({ rule }) => rule.startsWith('domain-') || rule === 'foreign-feature-persistence')
        .map(({ rule, path, identity }) => `${rule} ${path} ${identity}`)
        .toSorted(),
    ).toEqual([
      `domain-imports-io ${root}/orders/domain/OrderNumbers.java library:java.nio.file`,
      `domain-imports-random ${root}/orders/domain/OrderNumbers.java library:java.util`,
      `domain-reaches-io ${root}/orders/domain/Order.java domain-reach:${root}/common/Lookup.java`,
      `foreign-feature-persistence ${root}/features/shipping/Label.java foreign-persistence:${root}/features/billing/InvoiceStore.java`,
    ]);
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
