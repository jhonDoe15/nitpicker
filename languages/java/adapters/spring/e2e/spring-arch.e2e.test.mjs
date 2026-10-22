import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INIT_SCRIPT } from '../../../builds/java-build.mjs';
import {
  SPRING_ARCH_FIXTURE as fixture,
  SPRING_ARCH_ROLES,
  SPRING_ARCH_VIOLATIONS,
} from '../__tests__/spring-arch-project.mjs';
import { writeSpringRoles } from '../../spring-arch/spring-roles.mjs';

const enabled = process.env.NITPICKER_JAVA_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';

describe.skipIf(!enabled)('Spring architecture rules on a Spring project', () => {
  let projectRoot;

  beforeAll(() => {
    projectRoot = path.join(mkdtempSync(path.join(tmpdir(), 'nitpicker-spring-arch-')), 'shop');
    cpSync(fixture, projectRoot, { recursive: true });
    const roles = writeSpringRoles(SPRING_ARCH_ROLES, path.dirname(projectRoot));
    const result = spawnSync(
      gradle,
      [
        '--console=plain',
        '--quiet',
        '-I',
        INIT_SCRIPT,
        `-Pnitpicker.spring.roles=${roles}`,
        'nitpickerSpringArch',
      ],
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

describe.skipIf(!enabled)('Aggregate rules on a jMolecules project without Spring', () => {
  let projectRoot;

  beforeAll(() => {
    projectRoot = path.join(mkdtempSync(path.join(tmpdir(), 'nitpicker-ddd-only-')), 'sales');
    cpSync(path.join(fixture, '..', 'ddd-only-project'), projectRoot, { recursive: true });
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

  it('runs the architecture rules for jmolecules-ddd on the classpath and reports the aggregate reference', () => {
    const report = JSON.parse(
      readFileSync(path.join(projectRoot, 'build', 'nitpicker', 'spring-arch.json'), 'utf8'),
    );

    expect(report).toEqual({
      root: null,
      violations: [
        {
          rule: 'ddd-aggregate-reference',
          className: 'sales.Order',
          fileName: 'Order.java',
          detail: 'sales.Customer',
        },
      ],
    });
  });
});
