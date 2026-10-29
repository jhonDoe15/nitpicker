import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  batchFetchSize,
  batchFetchSizes,
  effectsOptions,
  effectsProperties,
  moduleEffectsOptions,
} from './effects-options.mjs';

const roots = [];

afterAll(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function projectWith(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-effects-options-'));
  roots.push(root);
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
  return root;
}

describe('batchFetchSize', () => {
  it('reads the Spring property from any module, in properties or YAML, with a placeholder default', () => {
    const properties = projectWith({
      'app/src/main/resources/application.properties':
        'spring.jpa.properties.hibernate.default_batch_fetch_size=32\n',
    });
    const yaml = projectWith({
      'src/main/resources/application.yml':
        'spring:\n  jpa:\n    properties:\n      hibernate.default_batch_fetch_size: ${BATCH:16}\n',
    });
    const plain = projectWith({
      'src/main/resources/application-prod.properties': 'hibernate.default-batch-fetch-size=8\n',
    });

    expect([properties, yaml, plain].map(batchFetchSize)).toEqual([32, 16, 8]);
  });

  it('ignores a size of one, a placeholder without default, build output and test resources', () => {
    const root = projectWith({
      'src/main/resources/application.properties':
        'hibernate.default_batch_fetch_size=1\nspring.jpa.properties.hibernate.default_batch_fetch_size=${SIZE}\n',
      'build/resources/src/main/resources/application.properties':
        'hibernate.default_batch_fetch_size=50\n',
      'src/test/resources/application.properties': 'hibernate.default_batch_fetch_size=50\n',
    });

    expect(batchFetchSize(root)).toBeUndefined();
    expect(effectsOptions(root)).toEqual([]);
    expect(effectsProperties(root)).toEqual([]);
  });

  it('turns each module size into an engine option and a Gradle property for that module', () => {
    const root = projectWith({
      'src/main/resources/application.properties': 'hibernate.default_batch_fetch_size=25\n',
      'orders/src/main/resources/application.yml': 'hibernate.default_batch_fetch_size: 8\n',
      'billing/src/main/resources/application.properties': 'spring.application.name=billing\n',
    });

    expect(batchFetchSizes(root)).toEqual(
      new Map([
        ['.', 25],
        ['orders', 8],
      ]),
    );
    expect(effectsOptions(root).sort()).toEqual(
      [`batchFetchSize=25@${root}`, `batchFetchSize=8@${path.join(root, 'orders')}`].sort(),
    );
    expect(effectsProperties(root)).toEqual([
      '-Pnitpicker.effects.options=batchFetchSize=25@.,batchFetchSize=8@orders',
    ]);
  });

  it('keeps the options of one module and the unscoped ones', () => {
    const options = ['batchFetchSize=8@/p/orders', 'batchFetchSize=25@/p', 'debug=1'];

    expect(moduleEffectsOptions(options, '/p/orders')).toEqual(['batchFetchSize=8', 'debug=1']);
    expect(moduleEffectsOptions(options, '/p/billing')).toEqual(['debug=1']);
  });
});
