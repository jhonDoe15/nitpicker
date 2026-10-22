import { afterEach, describe, expect, it } from 'vitest';
import { exceptionHint } from '../../../../shared/rules/exceptions.mjs';
import { readFeatureGraphFindings } from './feature-findings.mjs';
import {
  featureProjects,
  javaSources,
  rows,
} from './test-support/feature-project.mjs';

const { project: featureProject, remove } = featureProjects();

afterEach(remove);

const FEATURES = 'com.acme.features';
const FOLDER = 'src/main/java/com/acme/features';

function findings(modules, { files, policy = {}, kotlin = false } = {}) {
  const classes = modules.flatMap((module) => module.classes);
  const project = featureProject({ files: files ?? javaSources(classes), modules });
  return readFeatureGraphFindings(project.root, { ...project, kotlin, policy });
}

describe('feature boundaries on the class graph', () => {
  it('reports a class outside a feature that uses a class in its internal package', () => {
    const found = findings([
      {
        classes: [
          `${FEATURES}.billing.BillingService`,
          `${FEATURES}.shipping.ShippingApi`,
          `${FEATURES}.shipping.internal.ShipmentWriter`,
        ],
        edges: [
          [`${FEATURES}.billing.BillingService`, `${FEATURES}.shipping.ShippingApi`],
          [`${FEATURES}.billing.BillingService`, `${FEATURES}.shipping.internal.ShipmentWriter`],
          [`${FEATURES}.shipping.ShippingApi`, `${FEATURES}.shipping.internal.ShipmentWriter`],
        ],
      },
    ]);

    const importer = `${FOLDER}/billing/BillingService.java`;
    const target = `${FOLDER}/shipping/internal/ShipmentWriter.java`;
    expect(found).toEqual([
      {
        tool: 'coupling',
        rule: 'feature-internal-import',
        path: importer,
        identity: `feature-internal:${target}`,
        message: `Import feature shipping only through its public face, a class directly in the feature package ${FOLDER}/shipping/: ${importer} imports its internal module ${target}. Expose what ${importer} needs there, or move the code both use to a shared root (layout.sharedRoots). ${exceptionHint('feature-internal-import', importer)}`,
        classification: 'enforceable',
      },
    ]);
  });

  it('reports shared code that depends on a feature, and shared code only one feature uses', () => {
    const found = findings([
      {
        classes: [
          'com.acme.shared.Money',
          'com.acme.shared.Rounding',
          `${FEATURES}.billing.Invoice`,
        ],
        edges: [
          ['com.acme.shared.Money', `${FEATURES}.billing.Invoice`],
          [`${FEATURES}.billing.Invoice`, 'com.acme.shared.Rounding'],
        ],
      },
    ]);

    expect(rows(found)).toEqual([
      [
        'shared-used-by-one-feature',
        'src/main/java/com/acme/shared/Rounding.java',
        'shared-used-by-one-feature',
      ],
      [
        'shared-imports-feature',
        'src/main/java/com/acme/shared/Money.java',
        `${FOLDER}/billing|shared-imports-feature`,
      ],
    ]);
  });

  it('reports each edge of a cycle of three features and no package cycle for the same edges', () => {
    const found = findings([
      {
        classes: [`${FEATURES}.a.A`, `${FEATURES}.b.B`, `${FEATURES}.c.C`],
        edges: [
          [`${FEATURES}.a.A`, `${FEATURES}.b.B`],
          [`${FEATURES}.b.B`, `${FEATURES}.c.C`],
          [`${FEATURES}.c.C`, `${FEATURES}.a.A`],
        ],
      },
    ]);

    expect(rows(found)).toEqual([
      ['feature-cycle', `${FOLDER}/a/A.java`, `${FOLDER}/b|feature-cycle`],
      ['feature-cycle', `${FOLDER}/b/B.java`, `${FOLDER}/c|feature-cycle`],
      ['feature-cycle', `${FOLDER}/c/C.java`, `${FOLDER}/a|feature-cycle`],
    ]);
    expect(found[0].message).toBe(
      `Keep dependencies between features one-way: ${FOLDER}/a/A.java in feature a imports feature b (${FOLDER}/b/B.java), and b depends back on a, a cycle between features a, b, c. Move what both need to a shared root, invert this dependency behind an interface a owns that the composition root wires, or merge the features. ${exceptionHint('feature-cycle', `${FOLDER}/a/A.java`)}`,
    );
  });

  it('reports a Java class that calls an internal top-level Kotlin function of another feature', () => {
    const rates = 'src/main/kotlin/com/acme/features/shipping/internal/Rates.kt';
    const found = findings(
      [
        {
          classes: [`${FEATURES}.billing.Invoice`, `${FEATURES}.shipping.internal.RatesKt`],
          edges: [[`${FEATURES}.billing.Invoice`, `${FEATURES}.shipping.internal.RatesKt`]],
        },
      ],
      {
        files: {
          ...javaSources([`${FEATURES}.billing.Invoice`]),
          [rates]: `package ${FEATURES}.shipping.internal\n\ninternal fun rate(): Int = 1\n`,
        },
        kotlin: true,
      },
    );

    expect(rows(found)).toEqual([
      ['feature-internal-import', `${FOLDER}/billing/Invoice.java`, `feature-internal:${rates}`],
    ]);
  });

  it('follows the configured feature and shared roots and lifts a finding with an exception', () => {
    const modules = [
      {
        classes: ['com.acme.modules.billing.Invoice', 'com.acme.modules.orders.internal.Order'],
        edges: [['com.acme.modules.billing.Invoice', 'com.acme.modules.orders.internal.Order']],
      },
    ];
    const layout = { featureRoots: ['**/com/acme/modules'] };
    const importer = 'src/main/java/com/acme/modules/billing/Invoice.java';

    expect(rows(findings(modules, { policy: { layout } }))).toEqual([
      [
        'feature-internal-import',
        importer,
        'feature-internal:src/main/java/com/acme/modules/orders/internal/Order.java',
      ],
    ]);
    expect(findings(modules)).toEqual([]);
    const exceptions = [{ rule: 'feature-internal-import', paths: [importer], reason: 'test' }];
    expect(findings(modules, { policy: { layout, exceptions } })).toEqual([]);
  });

  it('reports an edge from one Gradle or Maven module into the internals of a feature in another', () => {
    const found = findings(
      [
        {
          qualifier: 'billing',
          classes: [`${FEATURES}.billing.Invoice`],
          edges: [[`${FEATURES}.billing.Invoice`, `${FEATURES}.shipping.internal.Writer`]],
        },
        { qualifier: 'shipping', classes: [`${FEATURES}.shipping.internal.Writer`] },
      ],
      {
        files: {
          ...javaSources([`${FEATURES}.billing.Invoice`], 'billing/src/main/java'),
          ...javaSources([`${FEATURES}.shipping.internal.Writer`], 'shipping/src/main/java'),
        },
      },
    );

    expect(rows(found)).toEqual([
      [
        'feature-internal-import',
        'billing/src/main/java/com/acme/features/billing/Invoice.java',
        'feature-internal:shipping/src/main/java/com/acme/features/shipping/internal/Writer.java',
      ],
    ]);
  });

  it('reports nothing for a project without classes', () => {
    expect(findings([{ classes: [] }])).toEqual([]);
  });
});
