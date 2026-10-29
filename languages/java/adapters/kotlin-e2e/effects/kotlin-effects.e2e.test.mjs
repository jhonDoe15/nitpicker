import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../../../../core/configuration/config.mjs';
import { INIT_SCRIPT } from '../../../builds/java-build.mjs';
import { collectJavaFindings } from '../../java-diff.mjs';
import { readEffectsFindings } from '../../effects/effects-findings.mjs';
import { sourceFileOf, sourceLocator } from '../../reporting/kotlin-reports.mjs';
import {
  effectsSummary,
  KOTLIN_EFFECTS,
  KOTLIN_EFFECTS_FIXTURE,
} from '../../effects/test-support/effects-projects.mjs';

const enabled = process.env.NITPICKER_KOTLIN_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';
const LOOPS = 'src/main/kotlin/shop/reports/LoopImports.kt';
const HELD = 'src/main/kotlin/shop/held/HeldScopes.kt';
const JAVA_LOOP = 'src/main/java/shop/reports/JavaImports.java';
const LOOP_RULES = /InLoop|NoFlush|BatchOfOne/u;

function copyFixture(prefix) {
  const root = path.join(mkdtempSync(path.join(tmpdir(), prefix)), 'shop');
  cpSync(KOTLIN_EFFECTS_FIXTURE, root, { recursive: true });
  return root;
}

describe.skipIf(!enabled)('the effects engine on a Kotlin project', () => {
  let projectRoot;

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
    const locate = sourceLocator(projectRoot, ['src/main/kotlin', 'src/main/java']);
    const findings = readEffectsFindings(path.join(projectRoot, 'build', 'nitpicker'), {
      resolvePath: (className, fileName) => sourceFileOf(locate, className, fileName),
      kotlin: true,
    });

    expect(new Set(findings.map((finding) => finding.path))).toEqual(
      new Set([
        'src/main/kotlin/shop/reports/LoopImports.kt',
        'src/main/kotlin/shop/reports/Accumulators.kt',
        'src/main/kotlin/shop/billing/LazyLoads.kt',
        'src/main/kotlin/shop/held/HeldScopes.kt',
        'src/main/kotlin/shop/events/Retries.kt',
        'src/main/kotlin/shop/events/DualWrites.kt',
        JAVA_LOOP,
      ]),
    );
  });
});

describe.skipIf(!enabled)('the effects engine in the Kotlin preset', () => {
  let projectRoot;
  let config;
  let findings;

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
    if (projectRoot !== undefined) {
      rmSync(path.dirname(projectRoot), { recursive: true, force: true });
    }
  });

  it('reads the old kotlin-source key as an effects exception and leaves the Spring Data line to PMD', () => {
    expect(config.exceptions.map(({ rule }) => rule)).toEqual(['effects/IoCallInLoop']);
    expect(
      findings
        .filter((finding) => finding.path === LOOPS && LOOP_RULES.test(finding.rule))
        .map(({ tool, rule, location }) => `${tool}/${rule} ${String(location.line)}`),
    ).toEqual(['pmd/SpringDataNoSaveInLoop 14']);
    expect(
      findings.filter(
        (finding) => finding.tool === 'kotlin-source' && LOOP_RULES.test(finding.rule),
      ),
    ).toEqual([]);
  });

  it('reports on the Kotlin files with the effects exception route in the message', () => {
    const held = findings.filter((finding) => finding.tool === 'effects' && finding.path === HELD);

    expect(held.map((finding) => finding.location.line)).toEqual([25, 30, 33, 35, 39, 45, 50]);
    expect(held.every((finding) => finding.message.includes(`"effects/${finding.rule}"`))).toBe(
      true,
    );
  });

  it('keeps one loop finding on a Java line that PMD and the engine both report', () => {
    const loop = findings.filter(
      (finding) => finding.path === JAVA_LOOP && LOOP_RULES.test(finding.rule),
    );

    expect(loop.map((finding) => finding.location.line)).toEqual([16]);
  });
});
