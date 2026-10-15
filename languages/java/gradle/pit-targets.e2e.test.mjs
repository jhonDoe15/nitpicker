import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { INIT_SCRIPT } from '../adapters/java-diff.mjs';
import { GRADLE_STEP_TIMEOUT_MS } from '../adapters/test-support/gradle-e2e.mjs';

const enabled = process.env.NITPICKER_JAVA_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';
const roots = [];

const SOURCES = {
  'src/main/java/org/Top.java': `package org;

public final class Top {
  public int next(int value) {
    return value + 1;
  }
}
`,
  'src/main/java/org/acme/calc/Calc.java': `package org.acme.calc;

public final class Calc {
  public int twice(int value) {
    return value * 2;
  }
}
`,
  'src/main/java/org/acme/text/Words.java': `package org.acme.text;

public final class Words {
  public boolean isEmpty(String text) {
    return text.isBlank();
  }
}
`,
  'src/test/java/org/acme/calc/CalcTest.java': `package org.acme.calc;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class CalcTest {
  @Test
  void doublesTheValue() {
    assertEquals(6, new Calc().twice(3));
  }
}
`,
};

function projectUnderOrg() {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-pit-org-'));
  roots.push(root);
  const fixture = path.resolve(import.meta.dirname, '../adapters/fixtures/gradle-project');
  for (const file of ['build.gradle', 'settings.gradle']) {
    cpSync(path.join(fixture, file), path.join(root, file));
  }
  for (const [file, text] of Object.entries(SOURCES)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
  return root;
}

describe.skipIf(!enabled)('PIT targets', () => {
  afterAll(() => {
    spawnSync(gradle, ['--stop'], { stdio: 'ignore' });
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it(
    'mutates every class of a project rooted in org, which PIT refuses as org.*',
    () => {
      const root = projectUnderOrg();

      const result = spawnSync(
        gradle,
        ['--console=plain', '--quiet', '-I', INIT_SCRIPT, 'nitpickerPit'],
        { cwd: root, encoding: 'utf8', timeout: GRADLE_STEP_TIMEOUT_MS },
      );

      expect(result.stderr).not.toContain('PitHelpError');
      expect(result.status).toBe(0);
      const report = readFileSync(path.join(root, 'build/nitpicker/pit/mutations.xml'), 'utf8');
      const mutated = new Set(
        [...report.matchAll(/<mutatedClass>([^<]+)<\/mutatedClass>/gu)].map(([, name]) => name),
      );
      expect([...mutated].sort()).toEqual(['org.Top', 'org.acme.calc.Calc', 'org.acme.text.Words']);
    },
    GRADLE_STEP_TIMEOUT_MS,
  );
});
