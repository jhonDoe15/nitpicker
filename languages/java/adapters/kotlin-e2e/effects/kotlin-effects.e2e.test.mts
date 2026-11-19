import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INIT_SCRIPT } from '../../../builds/java-build.mts';
import {
  KOTLIN_EFFECTS,
  KOTLIN_EFFECTS_FIXTURE,
} from '../../effects/test-support/effects-projects.mts';
import {
  effectsSummary,
  loadConfig,
  readEffectsFindings,
  sourceFileOf,
  sourceLocator,
} from './test-support/kotlin-effects-views.mts';
import { collectJavaFindings } from '../test-support/views/kotlin-e2e-views.mts';
import type { Finding } from '../../../../../shared/values/findings.mts';
import { fieldOf, listOf, parseJson } from '../../../../../shared/values/readers.mts';

const enabled = process.env['NITPICKER_KOTLIN_E2E'] === '1';
const gradle = process.env['NITPICKER_GRADLE'] ?? 'gradle';
const LOOPS = 'src/main/kotlin/shop/reports/LoopImports.kt';
const HELD = 'src/main/kotlin/shop/held/HeldScopes.kt';
const JAVA_LOOP = 'src/main/java/shop/reports/JavaImports.java';
const LOOP_RULES = /InLoop|NoFlush|BatchOfOne/u;

function copyFixture(prefix: string): string {
  const root = path.join(mkdtempSync(path.join(tmpdir(), prefix)), 'shop');
  cpSync(KOTLIN_EFFECTS_FIXTURE, root, { recursive: true });
  return root;
}

describe.skipIf(!enabled)('the effects engine on a Kotlin project', () => {
  let projectRoot: string;

  beforeAll(() => {
    projectRoot = copyFixture('nitpicker-kotlin-effects-');
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
    if (typeof projectRoot === 'string') {
      rmSync(path.dirname(projectRoot), { recursive: true, force: true });
    }
  });

  it('reports direct, inlined, helper and concurrent queries per item and accumulator copies', () => {
    const report = parseJson(
      readFileSync(path.join(projectRoot, 'build', 'nitpicker', 'effects.json'), 'utf8'),
    );

    expect(effectsSummary(report)).toEqual(KOTLIN_EFFECTS);
  });

  it('resolves the findings to the Kotlin files', () => {
    const locate = sourceLocator(projectRoot, ['src/main/kotlin', 'src/main/java']);
    const findings = readEffectsFindings(path.join(projectRoot, 'build', 'nitpicker'), {
      resolvePath: (className: string, fileName: string | undefined) =>
        sourceFileOf(locate, className, fileName),
      kotlin: true,
    });

    expect(new Set(findings.map((finding) => finding.path))).toEqual(
      new Set([
        'src/main/kotlin/shop/reports/LoopImports.kt',
        'src/main/kotlin/shop/reports/Accumulators.kt',
        'src/main/kotlin/shop/graphql/OrderFields.kt',
        'src/main/kotlin/shop/reactive/OrderStreams.kt',
        'src/main/kotlin/shop/rows/TicketUpdates.kt',
        'src/main/kotlin/shop/projections/MemberViews.kt',
        'src/main/kotlin/shop/stale/OrderSaves.kt',
        'src/main/kotlin/shop/futures/OrderFutures.kt',
        'src/main/kotlin/shop/billing/LazyLoads.kt',
        'src/main/kotlin/shop/held/HeldScopes.kt',
        'src/main/kotlin/shop/events/Retries.kt',
        'src/main/kotlin/shop/events/DualWrites.kt',
        'src/main/kotlin/shop/races/Registrations.kt',
        'src/main/kotlin/shop/jobs/JobsAllowed.kt',
        'src/main/kotlin/shop/jobs/NightlyJobs.kt',
        'src/main/kotlin/shop/trash/ProductService.kt',
        'src/main/kotlin/shop/carts/BasketReports.kt',
        'src/main/kotlin/shop/api/AccountController.kt',
        JAVA_LOOP,
      ]),
    );
  });
});

describe.skipIf(!enabled)('the effects engine in the Kotlin preset', () => {
  let projectRoot: string;
  let config: unknown;
  let findings: Finding[];

  beforeAll(() => {
    projectRoot = copyFixture('nitpicker-kotlin-effects-preset-');
    writeFileSync(
      path.join(projectRoot, 'nitpicker.config.json'),
      JSON.stringify({
        preset: 'kotlin',
        exceptions: [{ rule: 'kotlin-source/IoCallInLoop', paths: [LOOPS], reason: 'imports' }],
      }),
    );
    config = loadConfig(projectRoot);
    findings = collectJavaFindings(projectRoot, {
      gradle,
      policy: config,
      reportDirectory: path.join(path.dirname(projectRoot), 'reports'),
    });
  }, 180_000);

  afterAll(() => {
    if (typeof projectRoot === 'string') {
      rmSync(path.dirname(projectRoot), { recursive: true, force: true });
    }
  });

  it('reads the old kotlin-source key as an effects exception and leaves the Spring Data line to PMD', () => {
    expect(listOf(fieldOf(config, 'exceptions')).map((entry) => fieldOf(entry, 'rule'))).toEqual([
      'effects/IoCallInLoop',
    ]);
    expect(
      findings
        .filter((finding) => finding.path === LOOPS && LOOP_RULES.test(finding.rule))
        .map(({ tool, rule, location }) => `${tool}/${rule} ${String(location?.line)}`),
    ).toEqual(['pmd/SpringDataNoSaveInLoop 14']);
    expect(
      findings.filter(
        (finding) => finding.tool === 'kotlin-source' && LOOP_RULES.test(finding.rule),
      ),
    ).toEqual([]);
  });

  it('reports on the Kotlin files with the effects exception route in the message', () => {
    const held = findings.filter((finding) => finding.tool === 'effects' && finding.path === HELD);

    expect(held.map((finding) => finding.location?.line)).toEqual([25, 30, 33, 35, 39, 45, 50]);
    expect(held.every((finding) => finding.message.includes(`"effects/${finding.rule}"`))).toBe(
      true,
    );
  });

  it('keeps one loop finding on a Java line that PMD and the engine both report', () => {
    const loop = findings.filter(
      (finding) => finding.path === JAVA_LOOP && LOOP_RULES.test(finding.rule),
    );

    expect(loop.map((finding) => finding.location?.line)).toEqual([16]);
  });
});
