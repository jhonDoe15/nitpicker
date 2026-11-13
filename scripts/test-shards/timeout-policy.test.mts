import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isIntegrationTestFor } from '../../languages/typescript/preset/layout/end-to-end-tests.mjs';
import {
  INTEGRATION_HOOK_TIMEOUT_MS,
  INTEGRATION_TEST_TIMEOUT_MS,
  resolveTestTimeouts,
} from '../../shared/test-timeouts/resolve.mjs';
import { fieldsOf, listOf } from '../json/fields.mts';
import { readDurations } from './sequencer.mts';

const config: unknown = JSON.parse(
  readFileSync(new URL('../../nitpicker.config.json', import.meta.url), 'utf8'),
);

describe('repository JVM suite deadlines', () => {
  it.each(['java', 'kotlin'])(
    'keeps every %s E2E file under its finite named-suite budget',
    (language) => {
      const files = [
        ...readDurations(fileURLToPath(new URL(`./${language}-e2e.json`, import.meta.url))).keys(),
      ];
      expect(files).not.toHaveLength(0);
      const policy = fieldsOf(config);
      expect(
        files.map((file): unknown => {
          const integration = isIntegrationTestFor(file, policy) === true;
          return resolveTestTimeouts(policy, { file, integration });
        }),
      ).toEqual(
        files.map(() => ({
          language: 'typescript',
          testTimeoutMs: INTEGRATION_TEST_TIMEOUT_MS,
          testDeclarationCeilingMs: INTEGRATION_TEST_TIMEOUT_MS,
          hookTimeoutMs: INTEGRATION_HOOK_TIMEOUT_MS,
          hookDeclarationCeilingMs: INTEGRATION_HOOK_TIMEOUT_MS,
        })),
      );
    },
  );
  it('keeps ordinary checks strict without turning the JVM rule off', () => {
    const unit = { file: 'core/cli.test.mjs', integration: false };
    expect(resolveTestTimeouts(fieldsOf(config), unit)).toEqual({
      language: 'typescript',
      testTimeoutMs: 30_000,
      hookTimeoutMs: 30_000,
      testDeclarationCeilingMs: 10_000,
      hookDeclarationCeilingMs: 10_000,
    });
    expect(
      listOf(fieldsOf(config)?.['exceptions'])
        .map((exception) => fieldsOf(exception) ?? {})
        .filter(
          ({ rule, paths }) =>
            rule === 'nitpicker/no-raised-test-timeout' &&
            listOf(paths).some(
              (file) => typeof file === 'string' && file.startsWith('languages/java/'),
            ),
        ),
    ).toEqual([]);
  });
});
