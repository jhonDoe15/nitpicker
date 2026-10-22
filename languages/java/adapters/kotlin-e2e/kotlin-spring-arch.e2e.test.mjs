import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INIT_SCRIPT } from '../../builds/java-build.mjs';

const enabled = process.env.NITPICKER_KOTLIN_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';
const fixture = path.resolve(import.meta.dirname, '../fixtures/spring-arch-kotlin-project');

const EXPECTED = [
  'spring-controller-entity shop.orders.OrderController all:shop.orders.Order OrderController.kt',
  'spring-controller-repository shop.orders.OrderController shop.orders.OrderRepository OrderController.kt',
  'spring-feature-boundary shop.billing.BillingService shop.orders.internal.Audit BillingService.kt',
  'spring-layout shop.Helper  Helper.kt',
  'spring-layout shop.service.Legacy service Legacy.kt',
  'spring-no-dirties-context shop.OrderFlowTest  OrderFlowTest.kt',
  'spring-service-web shop.billing.BillingService org.springframework.http.ResponseEntity BillingService.kt',
  'spring-shared-pure shop.shared.Totals shop.orders.OrderDto Totals.kt',
  'spring-test-placement shop.OrderFlowTest  OrderFlowTest.kt',
];

describe.skipIf(!enabled)('Spring architecture rules on a Kotlin Spring project', () => {
  let projectRoot;

  beforeAll(() => {
    projectRoot = path.join(
      mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-spring-arch-')),
      'shop',
    );
    cpSync(fixture, projectRoot, { recursive: true });
    const result = spawnSync(
      gradle,
      ['--console=plain', '--quiet', '-I', INIT_SCRIPT, 'nitpickerSpringArch'],
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

  it('reports the Kotlin classes against their .kt files, and no file facade of top-level functions', () => {
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
