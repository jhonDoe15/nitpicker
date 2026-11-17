import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { errorProneChecks } from './checks/checks-docs.mts';

const CHECKS = errorProneChecks();

const enabled = process.env['NITPICKER_JAVA_E2E'] === '1';
const RUNNER_DIRECTORY = new URL('../../gradle/errorprone/', import.meta.url);
const REPORT_SOURCE = fileURLToPath(new URL('ErrorProneReport.java', RUNNER_DIRECTORY));
const CHECKS_FILE = fileURLToPath(new URL('checks.json', RUNNER_DIRECTORY));
const JAVA_TIMEOUT_MS = 120_000;
const PROBE = `import java.nio.file.*;
import java.util.List;

public final class Probe {
  public static void main(String[] args) throws Exception {
    List<String> rest = List.of(args).subList(1, args.length);
    switch (args[0]) {
      case "flags" -> System.out.print(ErrorProneReport.pluginArgument(Files.readString(Path.of(rest.get(0))),
          List.of(), true, false, List.of()));
      case "slices" -> ErrorProneReport.slices(rest).forEach(slice -> System.out.println(slice.size()));
      default -> throw new IllegalArgumentException(args[0]);
    }
  }
}
`;

describe.runIf(enabled)(
  'ErrorProneReport flags from checks.json, as Gradle and Maven run it',
  () => {
    let work: string;
    let compiled: SpawnSyncReturns<string>;

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

    function probe(args: readonly string[], flags: readonly string[] = []): string {
      const run = spawnSync('java', [...flags, '-cp', work, 'Probe', ...args], {
        encoding: 'utf8',
        timeout: JAVA_TIMEOUT_MS,
      });
      expect(run.status, run.stderr).toBe(0);
      return run.stdout;
    }

    function sources(count: number, text = 'class A {}'): string[] {
      const directory = mkdtempSync(path.join(work, 'sources-'));
      return Array.from({ length: count }, (_, index) => {
        const file = path.join(directory, `A${String(index)}.java`);
        writeFileSync(file, text);
        return file;
      });
    }

    it('turns on the enable list and off the disable list, and leaves the defaultOff checks to Error Prone', () => {
      const flags = probe(['flags', CHECKS_FILE]);

      expect(compiled.status, compiled.stderr).toBe(0);
      expect(flags).toBe(
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

    it('splits the sources into one slice per worker, keeping 40 files or more in each', () => {
      const files = sources(100);
      const sizes = (workers: number): number[] =>
        probe(['slices', ...files], [`-Dnitpicker.errorprone.workers=${String(workers)}`])
          .trim()
          .split('\n')
          .map(Number);

      expect(sizes(1)).toEqual([100]);
      expect(sizes(2)).toEqual([50, 50]);
      expect(sizes(8)).toEqual([50, 50]);
    });

    it('keeps a module compile in one slice', () => {
      const files = sources(100);
      const descriptor = path.join(path.dirname(files[0] ?? ''), 'module-info.java');
      writeFileSync(descriptor, 'module shop {}');

      expect(
        probe(['slices', descriptor, ...files], ['-Dnitpicker.errorprone.workers=4']).trim(),
      ).toBe('101');
    });
  },
);
