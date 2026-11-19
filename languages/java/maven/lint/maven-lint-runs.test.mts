import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runSpotbugs } from '../maven-lint.mts';
import { parseJson, textsOf } from '../../../../shared/values/readers.mts';
import { fakeJava, sourceModule } from '../__tests__/maven-lint-support.mts';

const roots: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe.skipIf(process.platform === 'win32')('runSpotbugs', () => {
  function spotbugsArguments(configs: unknown): string[] {
    const basedir = mkdtempSync(path.join(tmpdir(), 'nitpicker-maven-spotbugs-'));
    roots.push(basedir);
    fakeJava(basedir, '-output');
    const classes = path.join(basedir, 'target/classes');
    mkdirSync(classes, { recursive: true });
    writeFileSync(path.join(classes, 'A.class'), '');
    const reportDir = path.join(basedir, 'report');
    mkdirSync(reportDir);
    const module = sourceModule({ basedir, outputDirectory: classes });
    runSpotbugs({
      module,
      reportDir,
      tools: { spotbugs: ['spotbugs.jar'], spotbugsPlugins: ['plugin.jar'] },
      configs,
    });
    const args = textsOf(parseJson(readFileSync(path.join(basedir, 'arguments.json'), 'utf8')));
    return args.slice(args.indexOf('edu.umd.cs.findbugs.FindBugs2') + 1, args.indexOf('-sarif'));
  }

  it("runs nitpicker's effort and threshold, or the layered settings the project opted into", () => {
    expect(spotbugsArguments({})).toEqual(['-effort:default', '-medium']);
    expect(
      spotbugsArguments({ spotbugs: { arguments: ['-effort:max', '-low', '-exclude', '/x.xml'] } }),
    ).toEqual(['-effort:max', '-low', '-exclude', '/x.xml']);
  });
});
