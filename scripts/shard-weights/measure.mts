import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fieldAt, fieldsOf, listOf } from '../json/fields.mts';
import {
  FIXTURE_KINDS,
  type FixtureKind,
  type Shell,
  buildFixture,
  shellWith,
} from './fixture.mts';
import {
  type Analyzer,
  type Seconds,
  blendReports,
  median,
  ownCosts,
  weightsFromSeconds,
} from './weights.mts';

const NANOSECONDS = 1e9;
const DEFAULT_RUNS = 3;

type Options = {
  readonly runs: number;
  readonly base: string;
  readonly fixture: string | undefined;
  readonly project: string | undefined;
  readonly keep: string | undefined;
  readonly json: string | undefined;
};

type Log = { readonly write: (text: string) => unknown };

type Session = {
  readonly shell: Shell;
  readonly log: Log;
  readonly base: string;
  readonly runs: number;
};

type Measurement = {
  readonly samples: Record<string, number[]>;
  readonly failed: string[];
  readonly secondsByName: Record<string, number>;
  readonly costs: Record<string, number>;
  readonly weights: Record<string, number>;
};

function timedRun(
  session: Session,
  project: string,
  name: string,
): { seconds: number; failed: boolean } {
  const output = mkdtempSync(path.join(tmpdir(), 'nitpicker-weights-out-'));
  const started = process.hrtime.bigint();
  const result = session.shell.run(project, 'npx', [
    '--no-install',
    'nitpicker',
    '--base',
    session.base,
    '--analyzer',
    name,
    '--output',
    output,
  ]);
  const seconds = Number(process.hrtime.bigint() - started) / NANOSECONDS;
  rmSync(output, { recursive: true, force: true });
  const failed = result.status !== 0 && result.status !== 1;
  if (failed) {
    session.log.write(`${name}: exit ${String(result.status)}\n`);
  }
  return { seconds, failed };
}

function sampledAnalyzer(
  session: Session,
  project: string,
  name: string,
): { name: string; timings: number[]; failed: boolean; seconds: number } {
  const attempts = Array.from({ length: session.runs }, () => timedRun(session, project, name));
  const timings = attempts.map(({ seconds }) => seconds);
  const seconds = median(timings);
  session.log.write(`${name}: ${seconds.toFixed(1)}s\n`);
  return { name, timings, failed: attempts.some(({ failed }) => failed), seconds };
}

function measureProject(
  analyzers: readonly Analyzer[],
  project: string,
  session: Session,
): Measurement {
  const sampled = analyzers.map(({ name }) => sampledAnalyzer(session, project, name));
  const samples = Object.fromEntries(sampled.map(({ name, timings }) => [name, timings]));
  const secondsByName = Object.fromEntries(sampled.map(({ name, seconds }) => [name, seconds]));
  const failed = sampled.filter((analyzer) => analyzer.failed).map(({ name }) => name);
  const usable = analyzers.filter(
    ({ name, dependencies = [] }) => ![name, ...dependencies].some((item) => failed.includes(item)),
  );
  const costs = ownCosts(usable, secondsByName);
  return { samples, failed, secondsByName, costs, weights: weightsFromSeconds(costs) };
}

function secondsOf(value: unknown): Seconds {
  return Object.fromEntries(
    Object.entries(fieldsOf(value) ?? {}).filter(
      (entry): entry is [string, number] => typeof entry[1] === 'number',
    ),
  );
}

function readCosts(file: string): { costs: Seconds } {
  const report: unknown = JSON.parse(readFileSync(file, 'utf8'));
  return { costs: secondsOf(fieldAt(report, 'costs')) };
}

function parseOptions(argv: readonly string[]): Options {
  const pairs = Array.from(
    { length: Math.ceil(argv.length / 2) },
    (_, pair) => [argv[pair * 2] ?? '', argv[pair * 2 + 1]] as const,
  );
  const values = new Map(
    pairs
      .filter((entry): entry is readonly [string, string] => entry[1] !== undefined)
      .map(([flag, value]) => [flag.replace(/^--/u, ''), value]),
  );
  const runs = values.get('runs');
  return {
    runs: runs === undefined ? DEFAULT_RUNS : Number(runs),
    base: values.get('base') ?? 'main',
    fixture: values.get('fixture'),
    project: values.get('project'),
    keep: values.get('keep'),
    json: values.get('json'),
  };
}

function isFixtureKind(value: string | undefined): value is FixtureKind {
  return FIXTURE_KINDS.some((kind) => kind === value);
}

async function projectAnalyzers(): Promise<Analyzer[]> {
  const { configuredAnalyzers } =
    await import('../../languages/typescript/preset/diff/configured-analyzers.mjs');
  const analyzers: unknown = configuredAnalyzers();
  return listOf(analyzers).map((analyzer) => ({
    name: String(fieldAt(analyzer, 'name')),
    dependencies: listOf(fieldAt(analyzer, 'dependencies')).map(String),
  }));
}

function fixtureProject(
  options: Options,
  shell: Shell,
): { project: string; temporary: string | undefined } {
  if (options.project !== undefined) {
    return { project: options.project, temporary: undefined };
  }
  const kind = options.fixture;
  if (!isFixtureKind(kind)) {
    throw new Error('Pass --project <dir> or --fixture self|consumer|generated');
  }
  const temporary =
    options.keep === undefined
      ? mkdtempSync(path.join(tmpdir(), `nitpicker-weights-${kind}-`))
      : undefined;
  const project = options.keep ?? temporary ?? '';
  mkdirSync(project, { recursive: true });
  buildFixture(kind, project, shell);
  return { project, temporary };
}

type Streams = { readonly shell: Shell; readonly log: Log };

async function measure(argv: readonly string[], { shell, log }: Streams): Promise<string> {
  const options = parseOptions(argv);
  const analyzers = await projectAnalyzers();
  const { project, temporary } = fixtureProject(options, shell);
  if (!existsSync(path.join(project, '.git'))) {
    throw new Error(`${project} is not a git root`);
  }
  try {
    const session = { shell, log, base: options.base, runs: options.runs };
    const result = measureProject(analyzers, project, session);
    const report = { fixture: options.fixture ?? project, runs: options.runs, ...result };
    if (options.json !== undefined) {
      writeFileSync(options.json, `${JSON.stringify(report, null, 2)}\n`);
    }
    return `${JSON.stringify(report, null, 2)}\n`;
  } finally {
    if (temporary !== undefined) {
      rmSync(temporary, { recursive: true, force: true });
    }
  }
}

async function main(argv: readonly string[], streams: Streams): Promise<string> {
  if (argv[0] === '--blend') {
    return `${JSON.stringify(blendReports(argv.slice(1).map(readCosts)), null, 2)}\n`;
  }
  return measure(argv, streams);
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const streams = { shell: shellWith(process.env), log: process.stderr };
  process.stdout.write(await main(process.argv.slice(2), streams));
}
