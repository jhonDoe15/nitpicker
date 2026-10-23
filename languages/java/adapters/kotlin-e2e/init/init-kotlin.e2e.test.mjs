import { rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  copyFixtureRepository,
  runInitThenAll,
} from '../../../../../core/init/test-support/init-then-all.mjs';

const enabled = process.env.NITPICKER_KOTLIN_E2E === '1';
const FIXTURE = path.resolve(import.meta.dirname, '../../fixtures/kotlin-project');
const roots = [];

describe.skipIf(!enabled)('nitpicker init then --all on a Kotlin project', () => {
  afterAll(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  it('runs a Gradle project without a setup error', () => {
    const root = copyFixtureRepository({
      fixtureRoot: FIXTURE,
      prefix: 'nitpicker-init-kotlin-',
      ignored: ['/build/', '/.gradle/', '/.kotlin/', '/reports/'],
    });
    roots.push(root);
    const result = runInitThenAll(root);

    expect(result.init.exitCode, result.init.text).toBe(0);
    expect(result.init.text.split('\n').slice(0, 5)).toEqual([
      'nitpicker init: Kotlin, Gradle (preset "kotlin")',
      '',
      'Needs Java 21 or newer. nitpicker adds its own analysis tools to the build.',
      '',
      'created nitpicker.config.json',
    ]);
    expect(result.config).toBe('{ "preset": "kotlin" }\n');
    expect(result.all.exitCode, result.all.text).not.toBe(2);
    expect(result.toolErrors).toEqual([]);
    expect(result.summary.overallStatus).not.toBe('tool-error');
  });
});
