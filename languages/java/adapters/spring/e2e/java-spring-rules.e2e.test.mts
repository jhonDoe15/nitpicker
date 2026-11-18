import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INIT_SCRIPT } from '../../../builds/java-build.mjs';
import { readErrorProneFindings } from '../../errorprone/java-errorprone.mts';
import { writeSpringRuleset } from '../proxies/proxy-ruleset.mts';
import { fieldOf, parseJson, textOf } from '../../../../../shared/values/readers.mts';

import {
  enabled,
  gradle,
  fixture,
  CHECKSTYLE_VERSION,
  expectedViolations,
  reportedViolations,
} from '../__tests__/spring-project.mts';

const GUARDED_ERROR_PRONE_RULES = new Set(['PrivateConstructorForUtilityClass', 'MissingOverride']);

describe.skipIf(!enabled)('Spring rules on a Spring project', () => {
  let projectRoot: string | undefined;

  beforeAll(() => {
    projectRoot = path.join(mkdtempSync(path.join(tmpdir(), 'nitpicker-spring-')), 'shop');
    cpSync(fixture, projectRoot, { recursive: true });
    const springRules = writeSpringRuleset(projectRoot, path.dirname(projectRoot));
    const result = spawnSync(
      gradle,
      [
        '--console=plain',
        '--quiet',
        `-Pnitpicker.pmd.springRules=${String(springRules)}`,
        '-I',
        INIT_SCRIPT,
        'nitpickerPmd',
        'nitpickerJava',
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

  it('reports exactly the violations marked in the fixture sources', () => {
    const root = String(projectRoot);
    const sourceRoot = path.join(root, 'src', 'main', 'java');
    expect(reportedViolations(path.join(root, 'build', 'nitpicker', 'pmd.sarif'), root)).toEqual(
      expectedViolations(sourceRoot),
    );
  });

  it('runs the pinned Checkstyle with the bundled config even when the project declares its own', () => {
    const root = String(projectRoot);
    const report = readFileSync(path.join(root, 'build', 'nitpicker', 'checkstyle.xml'), 'utf8');
    expect(CHECKSTYLE_VERSION.exec(report)?.[1]).toBe('13.5.0');
  });

  it('reports no utility-class finding on configuration classes', () => {
    const root = String(projectRoot);
    const findings = readErrorProneFindings({
      reportRoot: path.join(root, 'build', 'nitpicker'),
      roots: [root],
      lintedRoots: ['src/main/java', 'src/test/java'],
    });
    expect(
      findings
        .filter(({ rule }) => GUARDED_ERROR_PRONE_RULES.has(textOf(rule)))
        .map(
          ({ rule, path: file, location }) =>
            `${textOf(file)}:${String(fieldOf(location, 'line'))} ${textOf(rule)}`,
        ),
    ).toEqual([
      'src/main/java/shop/catalog/ProductRepository.java:12 MissingOverride',
      'src/main/java/shop/config/SecretsConfig.java:53 PrivateConstructorForUtilityClass',
    ]);
  });

  it('records the resource roots and that the project uses Spring', () => {
    const root = String(projectRoot);
    const manifest = parseJson(
      readFileSync(path.join(root, 'build', 'nitpicker', 'manifest.json'), 'utf8'),
    );
    expect({
      spring: fieldOf(manifest, 'spring'),
      resourceRoots: fieldOf(manifest, 'resourceRoots'),
    }).toEqual({
      spring: true,
      resourceRoots: ['src/main/resources'],
    });
  });
});
