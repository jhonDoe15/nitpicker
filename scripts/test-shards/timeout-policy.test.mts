import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { resolveTestTimeouts } from '../../shared/test-timeouts/resolve.mjs';
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
      expect(files.map((file) => resolveTestTimeouts(fieldsOf(config), { file }))).toEqual(
        files.map(() => ({
          project: `${language}-e2e`,
          language,
          testTimeoutMs: 180_000,
          testDeclarationCeilingMs: 180_000,
          hookTimeoutMs: language === 'java' ? 300_000 : 180_000,
          hookDeclarationCeilingMs: language === 'java' ? 300_000 : 180_000,
        })),
      );
    },
  );
  it('keeps ordinary checks strict without turning the JVM rule off', () => {
    expect(resolveTestTimeouts(fieldsOf(config), { file: 'core/cli.test.mjs' })).toEqual({
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
