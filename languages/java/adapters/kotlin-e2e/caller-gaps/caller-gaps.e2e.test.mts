import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INIT_SCRIPT } from '../../../builds/java-build.mts';
import { GRADLE_STEP_TIMEOUT_MS } from '../../test-support/gradle-e2e.mts';
import { gradle, kotlinE2eEnabled } from '../__tests__/kotlin-e2e-project.mts';
import { fieldOf, listOf } from '../../../../../shared/values/readers.mts';

const fixture = path.resolve(import.meta.dirname, '../../fixtures/kotlin-caller-gaps');

const PROBE = `
gradle.projectsEvaluated {
    def facts = gradle.rootProject.nitpickerKotlinCallerGaps()
    new File(System.getProperty('nitpicker.probe')).text = groovy.json.JsonOutput.toJson(facts)
}
`;

function gapOf(facts: unknown, label: string): unknown {
  return listOf(fieldOf(facts, 'gaps')).find((gap) => fieldOf(gap, 'label') === label);
}

describe.skipIf(!kotlinE2eEnabled)('caller gaps the init script records for unused-option', () => {
  let root: string;
  let facts: unknown;

  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), 'nitpicker-caller-gaps-'));
    cpSync(fixture, root, { recursive: true });
    const probe = path.join(root, 'probe.gradle');
    const output = path.join(root, 'facts.json');
    writeFileSync(probe, PROBE);
    execFileSync(
      gradle,
      ['-q', '-I', INIT_SCRIPT, '-I', probe, `-Dnitpicker.probe=${output}`, 'help'],
      { cwd: path.join(root, 'project'), stdio: 'pipe', timeout: GRADLE_STEP_TIMEOUT_MS },
    );
    facts = JSON.parse(readFileSync(output, 'utf8'));
  }, 180_000);

  afterAll(() => {
    if (typeof root === 'string') {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('follows only the main compile and runtime classpaths into project dependencies', () => {
    expect(fieldOf(facts, 'dependencies')).toEqual({
      ':': [],
      ':api': [':core'],
      ':app': [':api', ':core'],
      ':core': [],
      ':legacy': [':core'],
      ':tools': [],
    });
  });

  it('names each source set the facts do not read, with what it reaches and whether it is test code', () => {
    expect(
      ['integrationTest', 'benchmark', 'latest'].map((name) =>
        gapOf(facts, `the source set ${name} of :app`),
      ),
    ).toEqual([
      {
        label: 'the source set integrationTest of :app',
        tests: true,
        owner: ':app',
        reaches: [':app', ':tools'],
      },
      { label: 'the source set benchmark of :app', tests: true, owner: ':app', reaches: [':app'] },
      {
        label: 'the source set latest of :app',
        tests: false,
        owner: ':app',
        reaches: [':api', ':app', ':core'],
      },
    ]);
  });

  it('counts Groovy sources in a main source set as a gap', () => {
    expect(gapOf(facts, 'the Groovy or Scala sources of main in :tools')).toEqual({
      label: 'the Groovy or Scala sources of main in :tools',
      tests: false,
      owner: ':tools',
      reaches: [':tools'],
    });
  });

  it('records a project outside the analysis root with the projects it uses', () => {
    expect(
      fieldOf(gapOf(facts, 'the project :legacy outside the analysis root'), 'reaches'),
    ).toEqual([':core']);
  });

  it('matches included-build coordinates whole and in named arguments, not as a prefix', () => {
    expect(fieldOf(gapOf(facts, 'the included build client'), 'reaches')).toEqual([
      ':api',
      ':core',
      ':tools',
    ]);
  });
});
