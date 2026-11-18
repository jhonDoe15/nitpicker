import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { GRADLE_DIRECTORY } from '../../builds/java-build.mjs';
import { readRootCases } from '../../maven/generated/test-support/root-cases.mts';

const enabled = process.env['NITPICKER_JAVA_E2E'] === '1';
const gradle = process.env['NITPICKER_GRADLE'] ?? 'gradle';
const SCRIPT = path.join(GRADLE_DIRECTORY, 'generated', 'generated-roots.gradle');
const CASES = readRootCases();
const MARK = 'ROOT-CASE ';

describe.skipIf(!enabled)(
  'the Gradle test for a generated root, on the cases the Maven test uses',
  () => {
    const work = mkdtempSync(path.join(tmpdir(), 'nitpicker-generated-roots-'));

    afterAll(() => {
      rmSync(work, { recursive: true, force: true });
    });

    it('answers each case as the shared definition does', () => {
      writeFileSync(path.join(work, 'settings.gradle'), "rootProject.name = 'probe'\n");
      writeFileSync(
        path.join(work, 'build.gradle'),
        `apply from: ${JSON.stringify(SCRIPT)}
def cases = new groovy.json.JsonSlurper().parseText(${JSON.stringify(JSON.stringify(CASES))})
tasks.register('probe') {
    doLast {
        cases.each { c ->
            def module = projectDir
            def build = new File(module, c.buildDir)
            println "${MARK}" + project.ext.nitpickerIsGeneratedRoot.call(module, build, new File(module, c.root))
        }
    }
}
`,
      );

      const run = spawnSync(gradle, ['--console=plain', '--quiet', 'probe'], {
        cwd: work,
        encoding: 'utf8',
        timeout: 180_000,
      });
      const answers = run.stdout
        .split('\n')
        .filter((line) => line.startsWith(MARK))
        .map((line) => line.slice(MARK.length).trim() === 'true');

      expect(run.status, run.stderr).toBe(0);
      expect(answers).toEqual(CASES.map(({ generated }) => generated));
    });
  },
);
