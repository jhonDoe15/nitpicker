import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { dropSleepsInFakes } from './latency-fakes.mjs';

const RULE = 'FixedSleepInTest';
const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function projectWith(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-latency-fakes-'));
  roots.push(root);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  return root;
}

const MAIN = {
  'src/main/java/shop/Gateway.java':
    'package shop;\n\npublic interface Gateway {\n  void charge();\n}\n',
  'src/main/java/shop/base/Store.java': 'package shop.base;\n\npublic class Store {}\n',
  'src/main/kotlin/shop/Clock.kt': 'package shop\n\ninterface Clock\n',
};

const sleepAt = (file, line) => ({
  tool: 'pmd',
  rule: RULE,
  path: file,
  identity: `${file}:${String(line)}`,
  location: { line },
});

function kept(files, findings) {
  const projectRoot = projectWith({ ...MAIN, ...files });
  return dropSleepsInFakes(findings, {
    rule: RULE,
    projectRoot,
    mainRoots: ['src/main/java', 'src/main/kotlin'],
  }).map(({ identity }) => identity);
}

describe('dropSleepsInFakes', () => {
  it('drops a sleep in a test class that implements or extends a main type', () => {
    const fakes = {
      'src/test/java/shop/SlowGateway.java': [
        'package shop;',
        '',
        'final class SlowGateway implements Gateway, java.io.Serializable {',
        '  public void charge() {',
        '    sleep(Duration.ofMillis(50));',
        '  }',
        '}',
      ].join('\n'),
      'src/test/java/shop/SlowStore.java': [
        'package shop;',
        '',
        'import shop.base.Store;',
        '',
        'class SlowStore<T extends Comparable<T>> extends Store implements Clock {',
        '  void load() throws InterruptedException {',
        '    Thread.sleep(50);',
        '  }',
        '}',
      ].join('\n'),
      'src/test/java/shop/OrderTest.java': [
        'package shop;',
        '',
        'class OrderTest {',
        '  Gateway gateway = new Gateway() {',
        '    public void charge() {',
        '      Thread.sleep(5);',
        '    }',
        '  };',
        '}',
      ].join('\n'),
    };

    expect(
      kept(fakes, [
        sleepAt('src/test/java/shop/SlowGateway.java', 5),
        sleepAt('src/test/java/shop/SlowStore.java', 7),
        sleepAt('src/test/java/shop/OrderTest.java', 6),
      ]),
    ).toEqual([]);
  });

  it('keeps a sleep in a test, in a helper of a library type, and outside the fake', () => {
    const files = {
      'src/test/java/shop/GatewayTest.java': [
        'package shop;',
        '',
        'import java.io.InputStream;',
        '',
        'class GatewayTest extends Base {',
        '  @Test',
        '  void charges() {',
        '    Thread.sleep(5);',
        '  }',
        '  static class Slow extends InputStream {',
        '    public int read() {',
        '      Thread.sleep(5);',
        '      return 0;',
        '    }',
        '  }',
        '}',
      ].join('\n'),
      'src/test/java/shop/Base.java': 'package shop;\n\nclass Base {}\n',
      'src/test/java/shop/ChargeIT.java': [
        'package shop;',
        '',
        'class ChargeIT implements Gateway {',
        '  public void charge() {}',
        '  @Test',
        '  void waits() {',
        '    Thread.sleep(5);',
        '  }',
        '}',
      ].join('\n'),
    };
    const findings = [
      sleepAt('src/test/java/shop/GatewayTest.java', 8),
      sleepAt('src/test/java/shop/GatewayTest.java', 12),
      sleepAt('src/test/java/shop/ChargeIT.java', 7),
      { ...sleepAt('src/test/java/shop/SlowGateway.java', 5), rule: 'NegativeWaitInTest' },
    ];

    expect(kept(files, findings)).toEqual(findings.map(({ identity }) => identity));
  });
});
