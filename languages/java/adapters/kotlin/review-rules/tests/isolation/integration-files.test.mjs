import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { findingFactory } from '../../review-finding.mjs';
import { testHonestyFindings } from '../test-honesty.mjs';

const roots = [];
afterAll(() => {
  for (const root of roots) {
    rmSync(root, { recursive: true, force: true });
  }
});

const body = (name, annotations = '') => `package demo.orders

import java.net.URL
import java.time.Instant
import org.junit.jupiter.api.Test

${annotations}class ${name} {
    @Test
    fun reads() {
        URL("https://api.example.com/orders").readText()
        println(Instant.now())
    }
}
`;

function rulesIn(files, testRoots = ['src/test/kotlin']) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-isolation-'));
  roots.push(root);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  return testHonestyFindings({
    projectRoot: root,
    testRoots,
    finding: findingFactory(),
  }).map(({ rule, path: file }) => `${rule} ${file}`);
}

describe('Kotlin network calls in integration tests', () => {
  it('reports the network in a unit test and the clock everywhere', () => {
    const found = rulesIn({
      'src/test/kotlin/demo/orders/OrderTest.kt': body('OrderTest'),
      'src/test/kotlin/demo/orders/OrderIT.kt': body('OrderIT'),
      'src/test/kotlin/demo/orders/integration/ShopTest.kt': body('ShopTest').replace(
        'demo.orders',
        'demo.orders.integration',
      ),
    });

    expect(found.toSorted()).toEqual([
      'NetworkInTest src/test/kotlin/demo/orders/OrderTest.kt',
      'RealClockInTest src/test/kotlin/demo/orders/OrderIT.kt',
      'RealClockInTest src/test/kotlin/demo/orders/OrderTest.kt',
      'RealClockInTest src/test/kotlin/demo/orders/integration/ShopTest.kt',
    ]);
  });

  it('treats SpringBootTest classes, a base class and other source sets as integration tests', () => {
    const found = rulesIn(
      {
        'src/test/kotlin/demo/orders/BootTest.kt': body('BootTest', '@SpringBootTest\n'),
        'src/test/kotlin/demo/orders/BaseTest.kt': `package demo.orders

@SpringBootTest
abstract class BaseTest
`,
        'src/test/kotlin/demo/orders/ChildTest.kt': body('ChildTest').replace(
          'class ChildTest',
          'class ChildTest : BaseTest()',
        ),
        'src/integrationTest/kotlin/demo/orders/ShopTest.kt': body('ShopTest'),
      },
      ['src/test/kotlin', 'src/integrationTest/kotlin'],
    );

    expect(found.filter((entry) => entry.startsWith('NetworkInTest'))).toEqual([]);
    expect(found).toHaveLength(3);
  });
});
