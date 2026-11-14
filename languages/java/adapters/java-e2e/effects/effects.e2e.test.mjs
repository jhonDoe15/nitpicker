import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { collectJavaFindings } from '../../java-diff.mjs';
import {
  effectsSummary,
  JAVA_EFFECTS,
  JAVA_EFFECTS_FIXTURE,
  JAVA_LOOP_LINES,
  loopLines,
} from '../../effects/test-support/effects-projects.mjs';

const enabled = process.env.NITPICKER_JAVA_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';

describe.skipIf(!enabled)('the effects engine on a Gradle Java project', () => {
  let work;
  let findings;

  beforeAll(() => {
    work = mkdtempSync(path.join(tmpdir(), 'nitpicker-effects-'));
    const projectRoot = path.join(work, 'shop');
    cpSync(JAVA_EFFECTS_FIXTURE, projectRoot, { recursive: true });
    findings = collectJavaFindings(projectRoot, {
      gradle,
      policy: {},
      reportDirectory: path.join(work, 'reports'),
    });
  }, 300_000);

  afterAll(() => {
    if (work !== undefined) {
      rmSync(work, { recursive: true, force: true });
    }
  });

  it('reports helper calls per item and accumulator copies, and leaves the allowed forms alone', () => {
    const report = JSON.parse(
      readFileSync(path.join(work, 'reports', 'root', 'effects.json'), 'utf8'),
    );

    expect(effectsSummary(report)).toEqual(JAVA_EFFECTS);
  });

  it('keeps one finding per line where PMD reports the direct call, and names the exception route', () => {
    const { loops, allowed } = JAVA_LOOP_LINES;
    const effects = findings.filter((finding) => finding.tool === 'effects');

    expect(loopLines(findings, 'pmd', loops)).toEqual(JAVA_LOOP_LINES.pmd);
    expect(loopLines(findings, 'effects', loops)).toEqual(JAVA_LOOP_LINES.effects);
    expect(loopLines(findings, 'pmd', allowed)).toEqual([]);
    expect(effects.every((finding) => finding.message.includes(`"effects/${finding.rule}"`))).toBe(
      true,
    );
  });
});
