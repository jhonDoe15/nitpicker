import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CHECKS } from './checks/checks-docs.mjs';

const enabled = process.env.NITPICKER_JAVA_E2E === '1';
const RUNNER_DIRECTORY = new URL('../../gradle/errorprone/', import.meta.url);
const REPORT_SOURCE = fileURLToPath(new URL('ErrorProneReport.java', RUNNER_DIRECTORY));
const CHECKS_FILE = fileURLToPath(new URL('checks.json', RUNNER_DIRECTORY));
const JAVA_TIMEOUT_MS = 120_000;
const PROBE = `import java.nio.file.*;

public final class Probe {
  public static void main(String[] args) throws Exception {
    String checks = Files.readString(Path.of(args[0]));
    System.out.print(ErrorProneReport.pluginArgument(checks, java.util.List.of(), true, false));
  }
}
`;

describe.runIf(enabled)(
  'ErrorProneReport flags from checks.json, as Gradle and Maven run it',
  () => {
    let work;
    let compiled;

    beforeAll(() => {
      work = mkdtempSync(path.join(tmpdir(), 'nitpicker-error-prone-report-'));
      writeFileSync(path.join(work, 'Probe.java'), PROBE);
      compiled = spawnSync('javac', ['-d', work, REPORT_SOURCE, path.join(work, 'Probe.java')], {
        encoding: 'utf8',
        timeout: JAVA_TIMEOUT_MS,
      });
    });

    afterAll(() => {
      rmSync(work, { recursive: true, force: true });
    });

    it('turns on the enable list and off the disable list, and leaves the defaultOff checks to Error Prone', () => {
      const run = spawnSync('java', ['-cp', work, 'Probe', CHECKS_FILE], {
        encoding: 'utf8',
        timeout: JAVA_TIMEOUT_MS,
      });

      expect(compiled.status, compiled.stderr).toBe(0);
      expect(run.stdout).toBe(
        [
          '-Xplugin:ErrorProne',
          '-XepAllErrorsAsWarnings',
          '-XepCompilingTestOnlyCode',
          ...CHECKS.enable.map((check) => `-Xep:${check}:WARN`),
          ...CHECKS.disable.map((check) => `-Xep:${check}:OFF`),
          '-Xep:NullAway:OFF',
        ].join(' '),
      );
      expect(CHECKS.defaultOff.length).toBeGreaterThan(0);
    });
  },
);
