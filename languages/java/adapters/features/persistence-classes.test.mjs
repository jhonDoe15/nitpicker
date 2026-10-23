import { afterEach, describe, expect, it } from 'vitest';
import { exceptionHint } from '../../../../shared/rules/exceptions.mjs';
import { classGraphFindings } from '../../builds/project-wide.mjs';
import { featureProjects, javaSources, rows } from './test-support/feature-project.mjs';

const { project: featureProject, remove } = featureProjects();

afterEach(remove);

const RULE = 'foreign-feature-persistence';
const BILLING = 'com.acme.shop.billing';
const ORDERS = 'com.acme.shop.orders';
const JAVA = 'src/main/java/com/acme/shop';
const KOTLIN = 'src/main/kotlin/com/acme/shop';
const CART = `${ORDERS}.Cart`;
const CART_FILE = `${JAVA}/orders/Cart.java`;

const SOURCES = {
  ...javaSources([
    CART,
    `${BILLING}.Invoice`,
    `${BILLING}.InvoiceView`,
    `${BILLING}.BillingService`,
    `${BILLING}.JdbcLedger`,
    `${BILLING}.Auditor`,
    `${BILLING}.LegacyDao`,
  ]),
  [`${JAVA}/billing/InvoiceRepository.java`]: `package ${BILLING};\n\npublic interface InvoiceRepository\n    extends org.springframework.data.jpa.repository.JpaRepository<Invoice, Long> {}\n`,
  [`${JAVA}/billing/Auditor.java`]: `package ${BILLING};\n\npublic class Auditor {\n  Auditor(org.springframework.data.repository.CrudRepository<Invoice, Long> all) {}\n}\n`,
  [`${KOTLIN}/billing/Payments.kt`]: `package ${BILLING}\n\n@jakarta.persistence.Entity\nclass Payment(val id: Long)\n\ninterface PaymentRepository : org.springframework.data.repository.CrudRepository<Payment, Long>\n`,
};

const EDGES = [
  [`${BILLING}.Invoice`, 'jakarta.persistence.Entity'],
  [`${BILLING}.InvoiceView`, 'jakarta.persistence.Entity'],
  [`${BILLING}.InvoiceView`, 'org.hibernate.annotations.Immutable'],
  [`${BILLING}.InvoiceRepository`, 'org.springframework.data.jpa.repository.JpaRepository'],
  [`${BILLING}.BillingService`, `${BILLING}.InvoiceRepository`],
  [`${BILLING}.JdbcLedger`, 'org.springframework.jdbc.core.JdbcTemplate'],
  [`${BILLING}.Auditor`, 'org.springframework.data.repository.CrudRepository'],
  [`${BILLING}.LegacyDao`, 'org.springframework.stereotype.Repository'],
  [`${BILLING}.Payment`, 'jakarta.persistence.Entity'],
  [`${BILLING}.PaymentRepository`, 'org.springframework.data.repository.CrudRepository'],
  ...[
    'Invoice',
    'InvoiceView',
    'InvoiceRepository',
    'BillingService',
    'JdbcLedger',
    'Auditor',
    'LegacyDao',
    'Payment',
    'PaymentRepository',
  ].map((name) => [CART, `${BILLING}.${name}`]),
];

function findings(springRoot) {
  const classes = [...new Set(EDGES.flatMap((edge) => edge).filter((name) => name.includes('.shop.')))];
  const project = featureProject({
    files: SOURCES,
    modules: [
      {
        classes,
        edges: EDGES,
        ...(springRoot === undefined ? {} : { springArch: { root: springRoot, violations: [] } }),
      },
    ],
  });
  const policy = springRoot === undefined ? { layout: { featureRoots: ['**/com/acme/shop'] } } : {};
  return classGraphFindings(project.root, { ...project, kotlin: false, policy }).filter(
    ({ rule }) => rule === RULE,
  );
}

describe('JVM persistence evidence for foreign-feature-persistence', () => {
  it('reports entities, repositories and data access classes of another feature, not its services', () => {
    const found = findings();

    expect(rows(found)).toEqual([
      [RULE, CART_FILE, `foreign-persistence:${JAVA}/billing/Invoice.java`],
      [RULE, CART_FILE, `foreign-persistence:${JAVA}/billing/InvoiceRepository.java`],
      [RULE, CART_FILE, `foreign-persistence:${JAVA}/billing/JdbcLedger.java`],
      [RULE, CART_FILE, `foreign-persistence:${JAVA}/billing/LegacyDao.java`],
      [RULE, CART_FILE, `foreign-persistence:${KOTLIN}/billing/Payments.kt`],
    ]);
    expect(found[0].message).toBe(
      `Use feature billing through its services, not its persistence: ${CART_FILE} in feature orders uses its persistent entity ${JAVA}/billing/Invoice.java. Call a service billing exposes on its public face, or keep a read model of your own fed by billing's events or queries. ${exceptionHint(RULE, CART_FILE)}`,
    );
  });

  it('works on the features of a Spring app without a configured layout', () => {
    expect(rows(findings('com.acme.shop')).map(([, , identity]) => identity)).toEqual([
      `foreign-persistence:${JAVA}/billing/Invoice.java`,
      `foreign-persistence:${JAVA}/billing/InvoiceRepository.java`,
      `foreign-persistence:${JAVA}/billing/JdbcLedger.java`,
      `foreign-persistence:${JAVA}/billing/LegacyDao.java`,
      `foreign-persistence:${KOTLIN}/billing/Payments.kt`,
    ]);
  });
});
