import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { batchFetchSize, effectsOptions, effectsProperties } from './effects-options.mjs';

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

  it('turns the size into an engine option and a Gradle property', () => {
    const root = projectWith({
      'src/main/resources/application.properties': 'hibernate.default_batch_fetch_size=25\n',
    });

    expect(effectsOptions(root)).toEqual(['batchFetchSize=25']);
    expect(effectsProperties(root)).toEqual(['-Pnitpicker.effects.options=batchFetchSize=25']);
  });
});
