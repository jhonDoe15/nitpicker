import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  KOTLIN_EFFECTS,
  KOTLIN_EFFECTS_FIXTURE,
} from '../../effects/test-support/effects-projects.mjs';
import { kotlinE2eEnabled, kotlinPolicy } from '../__tests__/kotlin-e2e-project.mts';
import { collectJavaFindings } from '../test-support/views/kotlin-e2e-views.mts';
import type { Finding } from '../../../../../shared/values/findings.mts';
import { parseJson } from '../../../../../shared/values/readers.mts';
import { effectsSummary } from '../effects/test-support/kotlin-effects-views.mts';

const maven = process.env['NITPICKER_MAVEN'];
const POM = path.resolve(import.meta.dirname, '../../../maven/fixtures/effects-kotlin/pom.xml');
const KOTLIN_SOURCES = 'src/main/kotlin';
const JAVA_ONLY = 'JavaImports.saveEach';
const KOTLIN_FILES = [
  'reports/LoopImports.kt',
  'reports/Accumulators.kt',
  'billing/LazyLoads.kt',
  'held/HeldScopes.kt',
  'events/Retries.kt',
  'events/DualWrites.kt',
];

describe.skipIf(!kotlinE2eEnabled)('the effects engine on a Kotlin Maven project', () => {
  let root: string;
  let findings: Finding[];

  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-maven-effects-'));
    mkdirSync(path.join(root, KOTLIN_SOURCES), { recursive: true });
    cpSync(path.join(KOTLIN_EFFECTS_FIXTURE, KOTLIN_SOURCES), path.join(root, KOTLIN_SOURCES), {
      recursive: true,
    });
    cpSync(POM, path.join(root, 'pom.xml'));
    findings = collectJavaFindings(root, { maven, policy: kotlinPolicy });
  }, 180_000);

  afterAll(() => {
    if (typeof root === 'string') {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reports what Gradle reports for the same Kotlin sources', () => {
    const report = parseJson(
      readFileSync(path.join(root, 'target', 'nitpicker', 'effects.json'), 'utf8'),
    );

    expect(effectsSummary(report)).toEqual(
      KOTLIN_EFFECTS.filter((entry) => !entry.includes(JAVA_ONLY)),
    );
  });

  it('resolves the findings to the Kotlin files with the effects exception route', () => {
    const effects = findings.filter((finding) => finding.tool === 'effects');

    expect(new Set(effects.map((finding) => finding.path))).toEqual(
      new Set(KOTLIN_FILES.map((file) => `${KOTLIN_SOURCES}/shop/${file}`)),
    );
    expect(effects.every((finding) => finding.message.includes(`"effects/${finding.rule}"`))).toBe(
      true,
    );
  });
});
