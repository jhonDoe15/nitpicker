import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INIT_SCRIPT } from '../../../builds/java-build.mjs';
import { readErrorProneFindings } from '../../errorprone/java-errorprone.mjs';

import {
  enabled,
  gradle,
  fixture,
  SPRING_RULE,
  CHECKSTYLE_VERSION,
  expectedViolations,
  reportedViolations,
} from '../__tests__/spring-project.mjs';

const GUARDED_ERROR_PRONE_RULES = new Set([
  'FieldCanBeFinal',
  'PrivateConstructorForUtilityClass',
  'MissingOverride',
]);

describe.skipIf(!enabled)('Spring rules on a Spring project', () => {
  let projectRoot;

  beforeAll(() => {
    projectRoot = path.join(mkdtempSync(path.join(tmpdir(), 'nitpicker-spring-')), 'shop');
    cpSync(fixture, projectRoot, { recursive: true });
    const result = spawnSync(
      gradle,
      ['--console=plain', '--quiet', '-I', INIT_SCRIPT, 'nitpickerPmd', 'nitpickerJava'],
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

  const reported = (isCheckedRule) =>
    reportedViolations(
      path.join(projectRoot, 'build', 'nitpicker', 'pmd.sarif'),
      path.join(projectRoot, 'src', 'main', 'java'),
      isCheckedRule,
    );

  it('reports exactly the violations marked in the fixture sources', () => {
    expect(reported((rule) => SPRING_RULE.test(rule) || rule === 'IoCallInLoop')).toEqual(
      expectedViolations(path.join(projectRoot, 'src', 'main', 'java')),
    );
  });

  it('leaves a secret default in a Spring file to SpringValueSecretDefault', () => {
    expect(reported((rule) => rule === 'HardcodedSecret')).toEqual([]);
  });

  it('reports each Spring Data write, flush or row write in a loop or stream callback once', () => {
    const linesOf = (rule) =>
      reported((reportedRule) => reportedRule === rule).map((violation) => violation.split(' ')[0]);
    const spring = [
      'SpringDataNoSaveInLoop',
      'SpringDataNoFlush',
      'SpringDataRowWriteInLoop',
      'SpringDataBatchOfOne',
      'SpringDataSaveInLoopHelper',
    ].flatMap((rule) => linesOf(rule));
    const loops = linesOf('IoCallInLoop');
    expect({
      spring: spring.length,
      loops: loops.length,
      twice: loops.filter((line) => spring.includes(line)),
    }).toEqual({ spring: 32, loops: 6, twice: [] });
  });

  it('runs the pinned Checkstyle with the bundled config even when the project declares its own', () => {
    const report = readFileSync(
      path.join(projectRoot, 'build', 'nitpicker', 'checkstyle.xml'),
      'utf8',
    );
    expect(CHECKSTYLE_VERSION.exec(report)?.[1]).toBe('10.21.1');
  });

  it('reports no FieldCanBeFinal in JPA entities and no utility-class finding on configuration classes', () => {
    const findings = readErrorProneFindings({
      reportRoot: path.join(projectRoot, 'build', 'nitpicker'),
      roots: [projectRoot],
      lintedRoots: ['src/main/java', 'src/test/java'],
    });
    expect(
      findings
        .filter(({ rule }) => GUARDED_ERROR_PRONE_RULES.has(rule))
        .map(({ rule, path: file, location }) => `${file}:${location.line} ${rule}`),
    ).toEqual([
      'src/main/java/shop/catalog/ProductRepository.java:11 MissingOverride',
      'src/main/java/shop/config/SecretsConfig.java:53 PrivateConstructorForUtilityClass',
    ]);
  });

  it('records the resource roots and that the project uses Spring', () => {
    const manifest = JSON.parse(
      readFileSync(path.join(projectRoot, 'build', 'nitpicker', 'manifest.json'), 'utf8'),
    );
    expect({ spring: manifest.spring, resourceRoots: manifest.resourceRoots }).toEqual({
      spring: true,
      resourceRoots: ['src/main/resources'],
    });
  });
});
