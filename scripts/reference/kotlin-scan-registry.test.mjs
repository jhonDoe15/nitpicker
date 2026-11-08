import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  KOTLIN_SCAN_REGISTRY,
  kotlinScanModules,
  kotlinScanRegistrySource,
} from './kotlin-scan-registry.mjs';
import { directoryRules } from '../../languages/java/adapters/kotlin/scan/rules/source-rules.generated.mjs';

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, '../..');

describe("the Kotlin source scan's module list", () => {
  it('is generated from the folders, one entry per module that exports `kotlinSourceRules`', async () => {
    expect(directoryRules).toHaveLength(kotlinScanModules(REPOSITORY_ROOT).length);
    expect(readFileSync(path.join(REPOSITORY_ROOT, KOTLIN_SCAN_REGISTRY), 'utf8')).toBe(
      await kotlinScanRegistrySource(REPOSITORY_ROOT),
    );
  });

  it('names each message once, so no module silently replaces the text of another', () => {
    const rules = directoryRules.flatMap(({ messages = {} }) => Object.keys(messages));

    expect(rules.filter((rule, index) => rules.indexOf(rule) !== index)).toEqual([]);
  });
});
