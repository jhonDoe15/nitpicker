import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveTestTimeouts } from '../../shared/test-timeouts/resolve.mjs';

const config = JSON.parse(
  readFileSync(new URL('../../nitpicker.config.json', import.meta.url), 'utf8'),
);

describe('repository JVM suite deadlines', () => {
  it.each(['java', 'kotlin'])(
    'keeps every %s E2E file under its finite named-suite budget',
    (language) => {
      const files = Object.keys(
        JSON.parse(readFileSync(new URL(`./${language}-e2e.json`, import.meta.url), 'utf8')),
      );
      for (const file of files) {
        expect(resolveTestTimeouts(config, { file })).toEqual({
          project: `${language}-e2e`,
          language,
          testTimeoutMs: 180_000,
          testDeclarationCeilingMs: 180_000,
          hookTimeoutMs: language === 'java' ? 300_000 : 180_000,
          hookDeclarationCeilingMs: language === 'java' ? 300_000 : 180_000,
        });
      }
    },
  );
  it('keeps ordinary checks strict without turning the JVM rule off', () => {
    expect(resolveTestTimeouts(config, { file: 'core/cli.test.mjs' })).toEqual({
      language: 'typescript',
      testTimeoutMs: 30_000,
      hookTimeoutMs: 30_000,
      testDeclarationCeilingMs: 10_000,
      hookDeclarationCeilingMs: 10_000,
    });
    expect(
      config.exceptions.filter(
        ({ rule, paths }) =>
          rule === 'nitpicker/no-raised-test-timeout' &&
          paths.some((file) => file.startsWith('languages/java/')),
      ),
    ).toEqual([]);
  });
});
