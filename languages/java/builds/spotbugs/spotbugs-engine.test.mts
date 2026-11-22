import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTempProjects } from '../../../../shared/test-support/temp-projects.mts';
import { fieldOf, listOf, parseJson } from '../../../../shared/values/readers.mts';
import { engineWriting, type Started } from '../test-support/engine-writing.mts';
import {
  SPOTBUGS_ENGINE_SARIF,
  spotbugsArgumentsFor,
  spotbugsOnEngine,
  spotbugsPlanOf,
  type SpotbugsEnginePlan,
} from './spotbugs-engine.mts';

const projectWith = useTempProjects('nitpicker-spotbugs-engine-');
const environment = { NITPICKER_ENGINE: process.execPath };
const RETURNED = 'p.A.get() may expose internal representation by returning A.date';
const THROWN =
  'Exception thrown in class p.A at new p.A() will leave the constructor. The object under construction ' +
  'remains partially initialized and may be vulnerable to Finalizer attacks.';

function planIn(processorPath: readonly string[] = []): SpotbugsEnginePlan {
  const root = projectWith({});
  const reportDir = path.join(root, 'report');
  const javaHome = path.join(root, 'jdk');
  mkdirSync(reportDir);
  mkdirSync(path.join(javaHome, 'jmods'), { recursive: true });
  return {
    reportDir,
    sources: [path.join(root, 'src/p/A.java')],
    classpath: ['/lib/classes'],
    processorPath,
    javaHome,
  };
}

function finding(rule: string, message: string): Record<string, unknown> {
  return { file: '/src/p/A.java', rule, line: 4, column: 1, message };
}

function sarifResults(plan: SpotbugsEnginePlan): readonly unknown[] {
  const sarif = parseJson(readFileSync(path.join(plan.reportDir, SPOTBUGS_ENGINE_SARIF), 'utf8'));
  return listOf(fieldOf(listOf(fieldOf(sarif, 'runs'))[0], 'results'));
}

describe('spotbugsOnEngine', () => {
  it('runs the rebuilt patterns and leaves SpotBugs the rest', () => {
    const plan = planIn();
    const started: Started[] = [];

    const added = spotbugsOnEngine(plan, environment, {
      run: engineWriting(
        { findings: [finding('EI_EXPOSE_REP', RETURNED), finding('CT_CONSTRUCTOR_THROW', THROWN)] },
        started,
      ),
    });

    expect(added).toStrictEqual(['-omitVisitors', 'ConstructorThrow']);
    expect(sarifResults(plan).map((result) => fieldOf(result, 'ruleId'))).toStrictEqual([
      'CT_CONSTRUCTOR_THROW',
    ]);
    const [start] = started;
    expect(start?.argumentList.slice(0, 6)).toStrictEqual([
      '--files',
      path.join(plan.reportDir, 'spotbugs-engine-sources.txt'),
      '--rules',
      '_SpotBugs',
      '--classpath',
      path.join(plan.reportDir, 'spotbugs-engine-classpath.txt'),
    ]);
    expect(fieldOf(start?.environment, 'NP_SB_ONLY')).toBe('CT_CONSTRUCTOR_THROW');
    expect(fieldOf(start?.environment, 'NITPICKER_JDK')).toBe(plan.javaHome);
    expect(readFileSync(path.join(plan.reportDir, 'spotbugs-engine-sources.txt'), 'utf8')).toBe(
      `${plan.sources[0] ?? ''}\n`,
    );
  });

  it.each([
    ['the engine fails', () => ({ status: 3, stdout: '', stderr: 'broken' })],
    [
      'a source does not parse',
      engineWriting({ findings: [], syntaxErrorFiles: ['/src/p/A.java'] }),
    ],
    [
      'a finding cannot be read',
      engineWriting({ findings: [finding('CT_CONSTRUCTOR_THROW', 'odd')] }),
    ],
  ])('leaves every pattern to SpotBugs when %s', (_, run) => {
    const plan = planIn();
    const lines: string[] = [];

    const added = spotbugsOnEngine(plan, environment, {
      run,
      log: { write: (text: string) => lines.push(text) },
    });

    expect(added).toStrictEqual([]);
    expect(existsSync(path.join(plan.reportDir, SPOTBUGS_ENGINE_SARIF))).toBe(false);
    expect(lines.join('')).toMatch(/SpotBugs runs them/u);
  });

  it('does not start the engine when it is off, the JDK has no jmods or processors run', () => {
    const plan = planIn();
    const processors = path.join(plan.reportDir, 'processors');
    mkdirSync(path.join(processors, 'META-INF/services'), { recursive: true });
    writeFileSync(
      path.join(processors, 'META-INF/services/javax.annotation.processing.Processor'),
      '',
    );
    writeFileSync(path.join(plan.reportDir, SPOTBUGS_ENGINE_SARIF), '{}');
    const started: Started[] = [];
    const run = engineWriting({ findings: [] }, started);

    expect(spotbugsOnEngine(plan, { NITPICKER_ENGINE: 'off' }, { run })).toStrictEqual([]);
    expect(existsSync(path.join(plan.reportDir, SPOTBUGS_ENGINE_SARIF))).toBe(false);
    expect(
      spotbugsOnEngine({ ...plan, javaHome: plan.reportDir }, environment, { run }),
    ).toStrictEqual([]);
    expect(
      spotbugsOnEngine({ ...plan, processorPath: [processors] }, environment, { run }),
    ).toStrictEqual([]);
    expect(spotbugsOnEngine({ ...plan, sources: [] }, environment, { run })).toStrictEqual([]);
    expect(started).toStrictEqual([]);
  });

  it('skips a detector whose patterns all run on the engine and filters out the others', () => {
    const plan = planIn();
    const exposed = ['EI_EXPOSE_REP', 'MS_EXPOSE_REP'];
    const exclude = path.join(plan.reportDir, 'spotbugs-engine-exclude.xml');

    expect(
      spotbugsArgumentsFor(plan.reportDir, ['CT_CONSTRUCTOR_THROW', ...exposed]),
    ).toStrictEqual(['-omitVisitors', 'ConstructorThrow', '-exclude', exclude]);
    expect(readFileSync(exclude, 'utf8')).toContain('<Bug pattern="EI_EXPOSE_REP,MS_EXPOSE_REP"/>');
    expect(spotbugsArgumentsFor(plan.reportDir, [])).toStrictEqual([]);
  });

  it('reads the plan the build writes', () => {
    expect(
      spotbugsPlanOf({
        reportDir: '/r',
        sources: ['/s/A.java'],
        classpath: ['/c'],
        processorPath: [],
        javaHome: '/jdk',
      }),
    ).toStrictEqual({
      reportDir: '/r',
      sources: ['/s/A.java'],
      classpath: ['/c'],
      processorPath: [],
      javaHome: '/jdk',
    });
  });
});
