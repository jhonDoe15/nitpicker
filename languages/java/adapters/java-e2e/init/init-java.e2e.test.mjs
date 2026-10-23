import { rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  copyFixtureRepository,
  runInitThenAll,
} from '../../../../../core/init/test-support/init-then-all.mjs';

const enabled = process.env.NITPICKER_JAVA_E2E === '1';
const adapters = path.resolve(import.meta.dirname, '../..');
const GRADLE_FIXTURE = path.join(adapters, 'fixtures/gradle-project');
const MAVEN_FIXTURE = path.resolve(adapters, '../maven/fixtures/failsafe');
const roots = [];

function setUp(fixtureRoot, prefix) {
  const root = copyFixtureRepository({
    fixtureRoot,
    prefix,
    ignored: ['/build/', '/.gradle/', '/target/', '/reports/'],
  });
  roots.push(root);
  return runInitThenAll(root);
}

describe.skipIf(!enabled)('nitpicker init then --all on a Java project', () => {
  afterAll(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  it('runs a Gradle project without a setup error', () => {
    const result = setUp(GRADLE_FIXTURE, 'nitpicker-init-gradle-');

    expect(result.init.exitCode, result.init.text).toBe(0);
    expect(result.init.text.split('\n').slice(0, 5)).toEqual([
      'nitpicker init: Java, Gradle (preset "java")',
      '',
      'Needs Java 21 or newer. nitpicker adds its own analysis tools to the build.',
      '',
      'created nitpicker.config.json',
    ]);
    expect(result.config).toBe('{ "preset": "java" }\n');
    expect(result.all.exitCode, result.all.text).not.toBe(2);
    expect(result.toolErrors).toEqual([]);
    expect(result.summary.overallStatus).not.toBe('tool-error');
  });

  it('runs a Maven project without a setup error', () => {
    const result = setUp(MAVEN_FIXTURE, 'nitpicker-init-maven-');

    expect(result.init.exitCode, result.init.text).toBe(0);
    expect(result.init.text.split('\n').slice(0, 5)).toEqual([
      'nitpicker init: Java, Maven (preset "java")',
      '',
      'Needs Java 21 or newer. nitpicker adds its own analysis tools to the build.',
      '',
      'created nitpicker.config.json',
    ]);
    expect(result.config).toBe('{ "preset": "java" }\n');
    expect(result.all.exitCode, result.all.text).not.toBe(2);
    expect(result.toolErrors).toEqual([]);
    expect(result.summary.overallStatus).not.toBe('tool-error');
  });
});
