import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { javaJarLicenseViolations } from '../../../../../../core/licensing/test-support/dependency-licenses.mjs';
import { resolveToolJars } from '../../../../../../core/licensing/test-support/java-tool-jars.mjs';
import { readPinnedTools } from '../../../../builds/java-build.mjs';

const enabled = process.env.NITPICKER_JAVA_E2E === '1';
const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../../..',
);

describe.skipIf(!enabled)('licenses of the Java tools nitpicker downloads', () => {
  const run = {};

  beforeAll(() => {
    run.jars = resolveToolJars({
      projectRoot: repositoryRoot,
      maven: process.env.NITPICKER_MAVEN,
      pinned: readPinnedTools(),
    });
  }, 300_000);

  it('allows the POM license of every tool jar, transitive ones included', () => {
    expect(run.jars.length).toBeGreaterThan(100);
    expect(javaJarLicenseViolations(run.jars)).toEqual([]);
  });
});
