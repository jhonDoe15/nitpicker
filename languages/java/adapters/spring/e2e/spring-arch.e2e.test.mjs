import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INIT_SCRIPT } from '../../../builds/java-build.mjs';
import {
  SPRING_ARCH_FIXTURE as fixture,
  SPRING_ARCH_VIOLATIONS,
} from '../__tests__/spring-arch-project.mjs';

const enabled = process.env.NITPICKER_JAVA_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';

describe.skipIf(!enabled)('Spring architecture rules on a Spring project', () => {
  let projectRoot;

  beforeAll(() => {
    projectRoot = path.join(mkdtempSync(path.join(tmpdir(), 'nitpicker-spring-arch-')), 'shop');
    cpSync(fixture, projectRoot, { recursive: true });
    const result = spawnSync(
      gradle,
      ['--console=plain', '--quiet', '-I', INIT_SCRIPT, 'nitpickerSpringArch'],
      { cwd: projectRoot, encoding: 'utf8', timeout: 180_000 },
    );
    if (result.status !== 0) {
      throw new Error(`Gradle failed: ${result.stderr}`);
    }
  }, 300_000);

  afterAll(() => {
    if (projectRoot !== undefined) {
      rmSync(path.dirname(projectRoot), { recursive: true, force: true });
    }
  });

  it('reports exactly the violations the fixture holds and accepts its legitimate forms', () => {
    const report = JSON.parse(
      readFileSync(path.join(projectRoot, 'build', 'nitpicker', 'spring-arch.json'), 'utf8'),
    );

    expect(report.root).toBe('shop');
    expect(
      report.violations.map(({ rule, className, detail }) => `${rule} ${className} ${detail}`),
    ).toEqual(SPRING_ARCH_VIOLATIONS);
  });
});
