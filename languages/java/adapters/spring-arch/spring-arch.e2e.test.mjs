import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INIT_SCRIPT } from '../../builds/java-build.mjs';

const enabled = process.env.NITPICKER_JAVA_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';
const fixture = path.join(import.meta.dirname, '..', 'fixtures', 'spring-arch-project');

const EXPECTED = [
  'spring-controller-entity shop.orders.OrderController all:shop.orders.Order',
  'spring-controller-entity shop.orders.OrderController create:shop.orders.Order',
  'spring-controller-entity shop.orders.OrdersApiController list:shop.orders.Order',
  'spring-controller-entity shop.orders.ReportController base:shop.orders.Order',
  'spring-controller-entity shop.orders.ReportController model:shop.orders.Order',
  'spring-controller-repository shop.customers.CustomerController shop.orders.OrderRepository',
  'spring-controller-repository shop.orders.OrderController shop.orders.OrderRepository',
  'spring-feature-boundary shop.billing.BillingService shop.orders.internal.Audit',
  'spring-feature-boundary shop.billing.Invoices shop.web.internal.Formats',
  'spring-layout shop.Helper ',
  'spring-layout shop.service.Legacy service',
  'spring-layout shop.util.Strings util',
  'spring-no-dirties-context shop.OrderFlowTest ',
  'spring-no-dirties-context shop.orders.integration.CheckoutIT ',
  'spring-service-web shop.billing.BillingService org.springframework.http.ResponseEntity',
  'spring-shared-pure shop.shared.Clocked ',
  'spring-shared-pure shop.shared.Totals shop.orders.OrderDto',
  'spring-test-placement shop.OrderFlowTest ',
  'spring-test-placement shop.orders.ComposedTest ',
  'spring-test-placement shop.orders.ExtendedTest ',
  'spring-test-placement shop.orders.InheritedTest ',
  'spring-test-placement shop.orders.RepositoryTest ',
];

describe.skipIf(!enabled)('Spring architecture rules on a Spring project', () => {
  let projectRoot;

  beforeAll(
    () => {
      projectRoot = path.join(mkdtempSync(path.join(tmpdir(), 'nitpicker-spring-arch-')), 'shop');
      cpSync(fixture, projectRoot, { recursive: true });
      const result = spawnSync(
        gradle,
        ['--console=plain', '--quiet', '-I', INIT_SCRIPT, 'nitpickerSpringArch'],
        { cwd: projectRoot, encoding: 'utf8', timeout: 15 * 60 * 1000 },
      );
      if (result.status !== 0) {
        throw new Error(`Gradle failed: ${result.stderr}`);
      }
    },
    16 * 60 * 1000,
  );

  afterAll(() => {
    if (projectRoot !== undefined) {
      rmSync(path.dirname(projectRoot), { recursive: true, force: true });
    }
  });

  it('reports exactly the violations the fixture holds and accepts its legitimate forms', () => {
    const report = JSON.parse(
      readFileSync(path.join(projectRoot, 'build', 'nitpicker', 'spring-arch.json'), 'utf8'),
    );

    expect(report.root).toBe('shop');
    expect(
      report.violations.map(({ rule, className, detail }) => `${rule} ${className} ${detail}`),
    ).toEqual(EXPECTED);
  });
});
