import { afterEach, describe, expect, it } from 'vitest';
import { readFeatureGraph } from './feature-findings.mjs';
import { featureProjects, javaSources, rows } from './test-support/feature-project.mjs';

const { project: featureProject, remove } = featureProjects();

afterEach(remove);

const FEATURES = 'com.acme.features';
const JAVA = 'src/main/java/com/acme/features';
const KOTLIN = 'src/main/kotlin/com/acme/features';

function kotlinSource(qualifiedName) {
  const index = qualifiedName.lastIndexOf('.');
  return `package ${qualifiedName.slice(0, index)}\n\nclass ${qualifiedName.slice(index + 1)}\n`;
}

function graphRows({ classes, edges, files, springArch, policy = {} }) {
  const project = featureProject({ files, modules: [{ classes, edges, springArch }] });
  return rows(readFeatureGraph(project.root, { ...project, kotlin: true, policy }).findings);
}

describe('JVM feature units', () => {
  it('keeps one feature whose classes sit in both the Java and the Kotlin source root', () => {
    const found = graphRows({
      classes: [
        `${FEATURES}.orders.Orders`,
        `${FEATURES}.orders.OrderRules`,
        `${FEATURES}.orders.internal.Ledger`,
        `${FEATURES}.billing.Invoice`,
      ],
      edges: [
        [`${FEATURES}.orders.Orders`, `${FEATURES}.orders.OrderRules`],
        [`${FEATURES}.orders.OrderRules`, `${FEATURES}.orders.Orders`],
        [`${FEATURES}.orders.Orders`, `${FEATURES}.orders.internal.Ledger`],
        [`${FEATURES}.billing.Invoice`, `${FEATURES}.orders.internal.Ledger`],
      ],
      files: {
        ...javaSources([`${FEATURES}.orders.Orders`, `${FEATURES}.billing.Invoice`]),
        [`${KOTLIN}/orders/OrderRules.kt`]: kotlinSource(`${FEATURES}.orders.OrderRules`),
        [`${KOTLIN}/orders/internal/Ledger.kt`]: kotlinSource(`${FEATURES}.orders.internal.Ledger`),
      },
    });

    expect(found).toEqual([
      [
        'feature-internal-import',
        `${JAVA}/billing/Invoice.java`,
        `feature-internal:${KOTLIN}/orders/internal/Ledger.kt`,
      ],
    ]);
  });

  it('takes no package outside the Spring root package as a feature', () => {
    const root = 'com.acme.shop';
    const names = [`${root}.ShopApplication`, `${root}.billing.Invoice`, 'com.acme.lib.Util'];
    const found = graphRows({
      classes: names,
      edges: [
        [`${root}.billing.Invoice`, 'com.acme.lib.Util'],
        ['com.acme.lib.Util', `${root}.billing.Invoice`],
      ],
      files: {
        'src/main/kotlin/ShopApplication.kt': kotlinSource(names[0]),
        'src/main/kotlin/billing/Invoice.kt': kotlinSource(names[1]),
        'src/main/kotlin/lib/Util.kt': kotlinSource(names[2]),
      },
      springArch: { root, violations: [] },
    });

    expect(found.map(([rule, file]) => `${rule} ${file}`)).toEqual([
      'package-cycle src/main/kotlin/lib/Util.kt',
      'package-cycle src/main/kotlin/billing/Invoice.kt',
    ]);
  });

  it('reports shared code that uses a feature under shared roots ArchUnit does not check', () => {
    const root = 'com.acme.shop';
    const names = [`${root}.ShopApplication`, `${root}.kernel.Clock`, `${root}.orders.Order`];
    const found = graphRows({
      classes: names,
      edges: [[`${root}.kernel.Clock`, `${root}.orders.Order`]],
      files: javaSources(names),
      springArch: { root, violations: [] },
      policy: { layout: { sharedRoots: ['**/kernel'] } },
    });

    expect(found.map(([rule]) => rule)).toEqual(['shared-imports-feature']);
  });

  it('leaves generated classes out of package cycles', () => {
    const mapper = 'com.acme.a.AMapperImpl';
    const found = graphRows({
      classes: ['com.acme.a.Hand', mapper, 'com.acme.b.Uses'],
      edges: [
        [mapper, 'com.acme.b.Uses'],
        ['com.acme.b.Uses', 'com.acme.a.Hand'],
      ],
      files: {
        ...javaSources(['com.acme.a.Hand', 'com.acme.b.Uses']),
        'src/main/java/com/acme/a/AMapperImpl.java': `package com.acme.a;\n\n@Generated("org.mapstruct.ap.MappingProcessor")\npublic class AMapperImpl {}\n`,
      },
    });

    expect(found).toEqual([]);
  });
});
