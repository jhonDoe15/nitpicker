import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INIT_SCRIPT } from '../../../builds/java-build.mjs';
import { readSpringArchFindings } from '../../spring-arch/spring-arch.mjs';
import { featureFaceMatcher } from '../../spring-arch/contract-types.mjs';

const enabled = process.env.NITPICKER_JAVA_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';
const fixture = path.resolve(import.meta.dirname, '../../fixtures/contracts-project');
const REPORT = path.join('build', 'nitpicker', 'spring-arch.json');

function runRules(projectRoot, properties) {
  const result = spawnSync(
    gradle,
    ['--console=plain', '--quiet', '-I', INIT_SCRIPT, ...properties, 'nitpickerSpringArch'],
    { cwd: projectRoot, encoding: 'utf8', timeout: 170_000 },
  );
  if (result.status !== 0) {
    throw new Error(`Gradle failed: ${result.stderr}`);
  }
  return existsSync(path.join(projectRoot, REPORT));
}

describe.skipIf(!enabled)('Contract rules on a Java project without Spring', () => {
  let projectRoot;
  let ranWithoutFeatureFolders;

  beforeAll(() => {
    projectRoot = path.join(mkdtempSync(path.join(tmpdir(), 'nitpicker-contracts-')), 'contracts');
    cpSync(fixture, projectRoot, { recursive: true });
    ranWithoutFeatureFolders = runRules(projectRoot, []);
    runRules(projectRoot, ['-Pnitpicker.featureFolders=true']);
  }, 300_000);

  afterAll(() => {
    if (projectRoot !== undefined) {
      rmSync(path.dirname(projectRoot), { recursive: true, force: true });
    }
  });

  it('runs the rules only when the head checkout has a feature folder', () => {
    expect(ranWithoutFeatureFolders).toBe(false);
  });

  it('reports the public classes directly in a feature folder and nothing else', () => {
    const findings = readSpringArchFindings(path.join(projectRoot, 'build', 'nitpicker'), {
      resolvePath: (className) => `src/main/java/${className.replaceAll('.', '/')}.java`,
      spring: false,
      isFeatureFace: featureFaceMatcher({ layout: {}, modulePath: '' }),
    });

    expect(findings.map(({ path: file, identity }) => `${file} ${identity}`)).toEqual([
      'src/main/java/com/acme/features/orders/OrderHttp.java OrderHttp|write:HttpServletResponse',
      'src/main/java/com/acme/features/orders/OrderStore.java OrderStore|connections:Connection',
    ]);
  });
});
