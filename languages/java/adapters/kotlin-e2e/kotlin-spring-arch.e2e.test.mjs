import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INIT_SCRIPT } from '../../builds/java-build.mjs';
import { writeSpringRoles } from '../spring-arch/spring-roles.mjs';

const enabled = process.env.NITPICKER_KOTLIN_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';
const fixture = path.resolve(import.meta.dirname, '../fixtures/spring-arch-kotlin-project');

const ROLES = { controller: ['shop.wiring.Endpoint'], repository: ['shop.wiring.Store'] };

const EXPECTED = [
  'contract-infrastructure-type shop.accounts.AccountHandler feature|transport|view:org.springframework.http.ResponseEntity AccountWeb.kt',
  'contract-infrastructure-type shop.accounts.AccountResource controller|persistence|export:java.sql.ResultSet AccountWeb.kt',
  'contract-infrastructure-type shop.accounts.AccountService service|persistence|rows:java.sql.ResultSet AccountService.kt',
  'contract-infrastructure-type shop.accounts.AccountServiceKt feature|persistence|connect:java.sql.Connection AccountService.kt',
  'contract-infrastructure-type shop.accounts.AccountServiceKt feature|persistence|connect:javax.sql.DataSource AccountService.kt',
  'ddd-aggregate-reference shop.sales.Order shop.sales.Customer Sales.kt',
  'ddd-foreign-entity shop.sales.Order shop.sales.Cart:shop.sales.CartLine Sales.kt',
  'ddd-value-object-reference shop.sales.Receipt shop.sales.Order Sales.kt',
  'spring-controller-controller shop.carts.CartController shop.orders.OrderController CartController.kt',
  'spring-controller-controller shop.wiring.HealthController shop.wiring.StatusEndpoint Wiring.kt',
  'spring-controller-entity shop.orders.OrderController all:shop.orders.Order OrderController.kt',
  'spring-controller-repository shop.customers.CustomerReport org.springframework.jdbc.core.JdbcTemplate CustomerReport.kt',
  'spring-controller-repository shop.orders.OrderController shop.orders.OrderRepository OrderController.kt',
  'spring-controller-repository shop.wiring.StatusEndpoint shop.wiring.AuditStore Wiring.kt',
  'spring-feature-boundary shop.billing.BillingService shop.orders.internal.Audit BillingService.kt',
  'spring-layout shop.Helper  Helper.kt',
  'spring-layout shop.application.service.PayService application PayService.kt',
  'spring-layout shop.domain.model.Payment domain Payment.kt',
  'spring-layout shop.service.Legacy service Legacy.kt',
  'spring-no-dirties-context shop.OrderFlowTest  OrderFlowTest.kt',
  'spring-repository-service shop.carts.CartRepository shop.carts.CartService CartController.kt',
  'spring-repository-service shop.wiring.AuditStore shop.wiring.WiringService Wiring.kt',
  'spring-scope-capture shop.carts.CartConfig pricing:request:shop.carts.Basket CartConfig.kt',
  'spring-scope-capture shop.carts.CartService request:shop.carts.Basket CartService.kt',
  'spring-scope-capture shop.wiring.WiringService request:shop.wiring.Badge Wiring.kt',
  'spring-scope-capture shop.wiring.WiringService request:shop.wiring.Visit Wiring.kt',
  'spring-service-web shop.billing.BillingService org.springframework.http.ResponseEntity BillingService.kt',
  'spring-service-web shop.billing.Refunds org.springframework.web.server.ResponseStatusException Refunds.kt',
  'spring-service-web shop.billing.Refunds org.springframework.web.server.ServerWebExchange Refunds.kt',
  'spring-shared-pure shop.shared.Totals shop.orders.OrderDto Totals.kt',
  'spring-test-placement shop.OrderFlowTest  OrderFlowTest.kt',
  'spring-test-placement shop.orders.OrderControllerIT  OrderControllerIT.kt',
];

describe.skipIf(!enabled)('Spring architecture rules on a Kotlin Spring project', () => {
  let projectRoot;

  beforeAll(() => {
    projectRoot = path.join(
      mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-spring-arch-')),
      'shop',
    );
    cpSync(fixture, projectRoot, { recursive: true });
    const roles = writeSpringRoles(ROLES, path.dirname(projectRoot));
    const result = spawnSync(
      gradle,
      [
        '--console=plain',
        '--quiet',
        '-I',
        INIT_SCRIPT,
        `-Pnitpicker.spring.roles=${roles}`,
        'nitpickerSpringArch',
      ],
      { cwd: projectRoot, encoding: 'utf8', timeout: 170_000 },
    );
    if (result.status !== 0) {
      throw new Error(`Gradle failed: ${result.stderr}`);
    }
  });

  afterAll(() => {
    if (projectRoot !== undefined) {
      rmSync(path.dirname(projectRoot), { recursive: true, force: true });
    }
  });

  it('reports Kotlin classes against their .kt files, leaving out accessors and web entry points', () => {
    const report = JSON.parse(
      readFileSync(path.join(projectRoot, 'build', 'nitpicker', 'spring-arch.json'), 'utf8'),
    );

    expect(report.root).toBe('shop');
    expect(
      report.violations.map(
        ({ rule, className, detail, fileName }) => `${rule} ${className} ${detail} ${fileName}`,
      ),
    ).toEqual(EXPECTED);
  });
});
