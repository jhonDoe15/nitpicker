import { afterEach, describe, expect, it } from 'vitest';
import { springRootFolders } from './feature-layout.mjs';
import { readFeatureGraphFindings } from './feature-findings.mjs';
import {
  featureProject,
  javaSources,
  removeFeatureProjects,
  rows,
} from './test-support/feature-project.mjs';

afterEach(removeFeatureProjects);

const ROOT = 'com.acme.shop';
const FOLDER = 'src/main/java/com/acme/shop';
const CLASSES = [
  `${ROOT}.ShopApplication`,
  `${ROOT}.billing.Invoice`,
  `${ROOT}.billing.internal.Rates`,
  `${ROOT}.orders.OrderService`,
  `${ROOT}.orders.internal.OrderRepository`,
  `${ROOT}.orders.internal.Audit`,
  `${ROOT}.shared.Money`,
  `${ROOT}.service.LegacyService`,
];
const EDGES = [
  [`${ROOT}.ShopApplication`, `${ROOT}.orders.internal.Audit`],
  [`${ROOT}.billing.Invoice`, `${ROOT}.orders.internal.OrderRepository`],
  [`${ROOT}.billing.Invoice`, `${ROOT}.billing.internal.Rates`],
  [`${ROOT}.billing.Invoice`, `${ROOT}.shared.Money`],
  [`${ROOT}.orders.OrderService`, `${ROOT}.billing.Invoice`],
  [`${ROOT}.billing.internal.Rates`, `${ROOT}.service.LegacyService`],
  [`${ROOT}.service.LegacyService`, `${ROOT}.billing.Invoice`],
];
const BOUNDARY = {
  rule: 'spring-feature-boundary',
  className: `${ROOT}.billing.Invoice`,
  fileName: 'Invoice.java',
  detail: `${ROOT}.orders.internal.OrderRepository`,
};

function springFindings({ layout, violations = [BOUNDARY] } = {}) {
  const project = featureProject({
    files: javaSources(CLASSES),
    modules: [{ classes: CLASSES, edges: EDGES, springArch: { root: ROOT, violations } }],
  });
  return rows(
    readFeatureGraphFindings(project.root, {
      ...project,
      kotlin: false,
      policy: layout === undefined ? {} : { layout },
    }),
  );
}

describe('Spring package-by-feature roles', () => {
  it('takes the root sub-packages as features and leaves their boundary edges to ArchUnit', () => {
    expect(springFindings()).toEqual([
      ['feature-cycle', `${FOLDER}/billing/Invoice.java`, `${FOLDER}/orders|feature-cycle`],
      ['feature-cycle', `${FOLDER}/orders/OrderService.java`, `${FOLDER}/billing|feature-cycle`],
      ['shared-used-by-one-feature', `${FOLDER}/shared/Money.java`, 'shared-used-by-one-feature'],
      ['package-cycle', `${FOLDER}/billing/Invoice.java`, `cycle:${ROOT}.billing`],
      ['package-cycle', `${FOLDER}/billing/internal/Rates.java`, `cycle:${ROOT}.billing.internal`],
      ['package-cycle', `${FOLDER}/service/LegacyService.java`, `cycle:${ROOT}.service`],
    ]);
  });

  it('runs every rule with an explicit layout, without the edges ArchUnit already reports', () => {
    const found = springFindings({ layout: { featureRoots: ['**/com/acme/shop'] } });

    expect(found.filter(([rule]) => rule === 'feature-internal-import')).toEqual([
      [
        'feature-internal-import',
        `${FOLDER}/ShopApplication.java`,
        `feature-internal:${FOLDER}/orders/internal/Audit.java`,
      ],
    ]);
    expect(
      springFindings({ layout: { featureRoots: ['**/com/acme/shop'] }, violations: [] }).filter(
        ([rule]) => rule === 'feature-internal-import',
      ),
    ).toContainEqual([
      'feature-internal-import',
      `${FOLDER}/billing/Invoice.java`,
      `feature-internal:${FOLDER}/orders/internal/OrderRepository.java`,
    ]);
  });

  it('keeps the default layout in a Spring module whose ArchUnit run found no root package', () => {
    const project = featureProject({
      files: javaSources([`${ROOT}.features.a.A`, `${ROOT}.features.b.internal.B`]),
      modules: [
        {
          classes: [`${ROOT}.features.a.A`, `${ROOT}.features.b.internal.B`],
          edges: [[`${ROOT}.features.a.A`, `${ROOT}.features.b.internal.B`]],
          springArch: { root: null, violations: [] },
        },
      ],
    });

    expect(
      rows(readFeatureGraphFindings(project.root, { ...project, policy: {} })).map(
        ([rule]) => rule,
      ),
    ).toEqual(['feature-internal-import']);
  });
});

describe('springRootFolders', () => {
  it('finds the folder of the root package, also for Kotlin files that leave out its folders', () => {
    const classes = [
      { packageName: ROOT, file: `${FOLDER}/ShopApplication.java` },
      { packageName: `${ROOT}.billing`, file: 'src/main/kotlin/billing/Invoice.kt' },
      { packageName: `${ROOT}.billing.internal`, file: `${FOLDER}/billing/internal/Rates.java` },
      { packageName: 'com.acme.shopping', file: 'src/main/java/com/acme/shopping/Cart.java' },
      { packageName: `${ROOT}.orders`, file: 'src/main/kotlin/Orders.kt' },
    ];

    expect(springRootFolders([ROOT], classes)).toEqual([FOLDER, 'src/main/kotlin']);
  });
});
