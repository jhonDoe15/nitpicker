import { afterEach, describe, expect, it } from 'vitest';
import {
  featureProjects,
  javaSources,
  projectFindings,
  rows,
} from './test-support/feature-project.mjs';

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
  return rows(projectFindings(project, { kotlin: true, policy }));
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

    expect(found.map(([rule, , identity]) => `${rule} ${identity}`)).toEqual([
      'package-cycle cycle:com.acme.lib',
      'package-cycle cycle:com.acme.shop.billing',
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

describe('JVM feature graph across modules and generated sources', () => {
  it('reports a feature cycle once when a second top-level class of a file closes it', () => {
    const files = javaSources([`${FEATURES}.x.X`]);
    files[`${JAVA}/y/Y.java`] = `package ${FEATURES}.y;\n\npublic class Y {}\n\nclass Helper {}\n`;
    const project = featureProject({
      files,
      modules: [
        {
          classes: [`${FEATURES}.x.X`, `${FEATURES}.y.Y`, `${FEATURES}.y.Helper`],
          edges: [
            [`${FEATURES}.x.X`, `${FEATURES}.y.Helper`],
            [`${FEATURES}.y.Helper`, `${FEATURES}.x.X`],
          ],
        },
        { qualifier: 'lib', classes: [], edges: [] },
      ],
    });

    expect(rows(projectFindings(project)).map(([rule]) => rule)).toEqual([
      'feature-cycle',
      'feature-cycle',
    ]);
  });

  it('places Kotlin classes of a Maven module on their module path', () => {
    const project = featureProject({
      files: {
        'lib/src/main/kotlin/com/acme/orders/domain/Ids.kt': kotlinSource(
          'com.acme.orders.domain.Ids',
        ),
      },
      modules: [
        {
          qualifier: 'lib',
          classes: ['com.acme.orders.domain.Ids'],
          edges: [['com.acme.orders.domain.Ids', 'java.util.Random']],
          kotlinMetrics: {
            functions: [],
            files: [
              {
                file: 'src/main/kotlin/com/acme/orders/domain/Ids.kt',
                package: 'com.acme.orders.domain',
                classes: ['com.acme.orders.domain.Ids'],
              },
            ],
          },
        },
      ],
    });
    project.projects[0].filePrefix = 'lib';

    expect(rows(projectFindings(project, { kotlin: true }))).toEqual([
      [
        'domain-imports-random',
        'lib/src/main/kotlin/com/acme/orders/domain/Ids.kt',
        'library:java.util',
      ],
    ]);
  });

  it('reports no domain rule on a class a generator wrote', () => {
    const project = featureProject({
      files: {
        'src/main/java/com/acme/orders/domain/Gen.java':
          '// Code generated by openapi-generator. DO NOT EDIT.\npackage com.acme.orders.domain;\n\npublic class Gen {}\n',
      },
      modules: [
        {
          classes: ['com.acme.orders.domain.Gen'],
          edges: [['com.acme.orders.domain.Gen', 'java.util.Random']],
        },
      ],
    });

    expect(projectFindings(project)).toEqual([]);
  });
});
