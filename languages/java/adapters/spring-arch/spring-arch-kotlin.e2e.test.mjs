import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INIT_SCRIPT } from '../../builds/java-build.mjs';

const enabled =
  process.env.NITPICKER_JAVA_E2E === '1' &&
  readFileSync(INIT_SCRIPT, 'utf8').includes("'nitpickerSpringArch'");
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';
const fixture = path.join(import.meta.dirname, '..', 'fixtures', 'spring-arch-kotlin-project');

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

  beforeAll(
    () => {
      projectRoot = path.join(
        mkdtempSync(path.join(tmpdir(), 'nitpicker-spring-arch-kotlin-')),
        'shop',
      );
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

  it('reports the violations of the Kotlin classes against their .kt source files, and not the file facades', () => {
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
