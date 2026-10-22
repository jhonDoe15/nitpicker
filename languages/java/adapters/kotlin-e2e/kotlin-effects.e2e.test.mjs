import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INIT_SCRIPT } from '../../builds/java-build.mjs';
import { readEffectsFindings } from '../effects/effects-findings.mjs';
import { sourceFileOf, sourceLocator } from '../reporting/kotlin-reports.mjs';
import {
  effectsSummary,
  KOTLIN_EFFECTS,
  KOTLIN_EFFECTS_FIXTURE,
} from '../effects/test-support/effects-projects.mjs';

const enabled = process.env.NITPICKER_KOTLIN_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';

describe.skipIf(!enabled)('the effects engine on a Kotlin project', () => {
  let projectRoot;

  beforeAll(() => {
    projectRoot = path.join(mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-effects-')), 'shop');
    cpSync(KOTLIN_EFFECTS_FIXTURE, projectRoot, { recursive: true });
    const result = spawnSync(
      gradle,
      [
        '--console=plain',
        '--quiet',
        '-I',
        INIT_SCRIPT,
        '-Pnitpicker.kotlin=true',
        'nitpickerEffects',
      ],
      { cwd: projectRoot, encoding: 'utf8', timeout: 170_000 },
    );
    if (result.status !== 0) {
      throw new Error(`Gradle failed: ${result.stderr}`);
    }
  }, 180_000);

  afterAll(() => {
    if (projectRoot !== undefined) {
      rmSync(path.dirname(projectRoot), { recursive: true, force: true });
    }
  });

  it('reports direct, inlined, helper and concurrent queries per item and accumulator copies', () => {
    const report = JSON.parse(
      readFileSync(path.join(projectRoot, 'build', 'nitpicker', 'effects.json'), 'utf8'),
    );

    expect(effectsSummary(report)).toEqual(KOTLIN_EFFECTS);
  });

  it('resolves the findings to the Kotlin files', () => {
    const locate = sourceLocator(projectRoot, ['src/main/kotlin']);
    const findings = readEffectsFindings(path.join(projectRoot, 'build', 'nitpicker'), {
      resolvePath: (className, fileName) => sourceFileOf(locate, className, fileName),
      kotlin: true,
    });

    expect(new Set(findings.map((finding) => finding.path))).toEqual(
      new Set([
        'src/main/kotlin/shop/reports/LoopImports.kt',
        'src/main/kotlin/shop/reports/Accumulators.kt',
      ]),
    );
  });
});
