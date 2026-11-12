import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { parse } from 'yaml';
import { createVitest, parseCLI } from 'vitest/node';
import {
  type ListedCase,
  SUITES,
  caseId,
  classifyGates,
  gateCandidates,
  shardMatrix,
  suiteFlag,
  workflowProblems,
} from './e2e-gates.mts';
import {
  type Durations,
  assignShards,
  createDurationSequencer,
  readDurations,
  weightOf,
} from './sequencer.mts';
import { fieldsOf } from '../json/fields.mts';
import { TOOL_RUN_CEILING_MS } from '../../shared/processes/deadlines.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const VITEST_CONFIG = path.join(root, 'vitest.config.mts');

function suiteFile(base: string, name: string): string {
  const full = path.resolve(base, name);
  if (!full.startsWith(base + path.sep)) {
    throw new Error(`${name} is outside ${base}`);
  }
  return full;
}

const run = promisify(execFile);
const MAX_LISTING_BYTES = 256 * 1024 * 1024;

type ShardPlan = {
  readonly files: readonly string[];
  readonly durations: Durations;
  readonly shards: readonly (readonly string[])[];
  readonly matrix: readonly number[];
};

function failureText(failure: unknown): string {
  const output = fieldsOf(failure) ?? {};
  const text = [output['stderr'], output['stdout'], output['message']].find(
    (part) => typeof part === 'string' && part !== '',
  );
  return typeof text === 'string' ? text : String(failure);
}

function listedCases(stdout: string): ListedCase[] {
  const listed: unknown = JSON.parse(stdout);
  if (!Array.isArray(listed)) {
    throw new TypeError('vitest list --json must print an array of cases');
  }
  return listed.map((entry: unknown) => {
    const { file, name } = fieldsOf(entry) ?? {};
    if (typeof file !== 'string' || typeof name !== 'string') {
      throw new TypeError('vitest list --json must name the file and name of each case');
    }
    return { file: path.relative(root, file).split(path.sep).join('/'), name };
  });
}

async function listCases(args: readonly string[], flag?: string): Promise<ListedCase[]> {
  const unset = SUITES.flatMap((suite) => ['-u', suiteFlag(suite)]);
  const command = [
    ...unset,
    ...(flag === undefined ? [] : [`${flag}=1`]),
    process.execPath,
    path.join(root, 'node_modules/vitest/vitest.mjs'),
    'list',
    ...args,
    '--no-isolate',
    '--json',
  ];
  let result: { stdout: string };
  try {
    result = await run('env', command, {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: MAX_LISTING_BYTES,
      timeout: TOOL_RUN_CEILING_MS,
    });
  } catch (failure) {
    assert.fail(failureText(failure));
  }
  return listedCases(result.stdout);
}

function packageScript(name: string): string {
  const pkg: unknown = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const script = fieldsOf(fieldsOf(pkg)?.['scripts'])?.[name];
  assert.ok(typeof script === 'string', `package.json must define the ${name} script`);
  return script;
}

async function scriptCases(language: string): Promise<ListedCase[]> {
  const command = packageScript(`test:${language}`).split(' ');
  assert.equal(command[0], `${suiteFlag(language)}=1`, `test:${language} must set its E2E flag`);
  return await listCases(command.slice(command.indexOf('run') + 1), suiteFlag(language));
}

async function suiteGates(): Promise<Record<string, string[]>> {
  const candidates = gateCandidates(root);
  const filters = ['--config', VITEST_CONFIG, ...candidates.map(({ file }) => file)];
  const [baseline, ...listed] = await Promise.all([
    listCases(filters),
    ...SUITES.map((suite) => listCases(filters, suiteFlag(suite))),
  ]);
  const listings = {
    baseline,
    listed: Object.fromEntries(SUITES.map((suite, i) => [suite, listed[i] ?? []])),
  };
  const gates = classifyGates(candidates, listings);
  assert.deepEqual(
    gates.problems,
    [],
    'every E2E test file must be gated by exactly one suite flag',
  );
  return gates.expected;
}

function readProfile(profile: string, files: readonly string[]): Durations {
  const durations = readDurations(profile);
  assert.deepEqual(
    [...durations.keys()].filter((file) => !files.includes(file)),
    [],
    'the timing profile must name only selected files',
  );
  return durations;
}

function readMatrix(language: string): number[] {
  const workflow: unknown = parse(
    readFileSync(suiteFile(root, `.github/workflows/${language}-e2e.yml`), 'utf8'),
  );
  assert.deepEqual(workflowProblems(workflow, language), []);
  return shardMatrix(workflow, language);
}

async function selectedFiles(
  files: readonly string[],
  durations: Durations,
  { index, count }: { readonly index: number; readonly count: number },
): Promise<string[]> {
  const { options } = parseCLI(['vitest', 'run', `--shard=${String(index)}/${String(count)}`]);
  const context = await createVitest('test', { ...options, config: VITEST_CONFIG });
  try {
    assert.deepEqual(context.config.shard, { index, count });
    assert.equal(context.config.sequence.sequencer.name, 'DurationSequencer');
    const sequencer = createDurationSequencer(context, durations);
    const selected = sequencer.shard(files.map((file) => ({ moduleId: path.join(root, file) })));
    return selected.map(({ moduleId }) => path.relative(root, moduleId)).toSorted();
  } finally {
    await context.close();
  }
}

async function assertShardPartition({
  files,
  durations,
  shards,
  matrix,
}: ShardPlan): Promise<void> {
  const selections: string[][] = [];
  for (const index of matrix) {
    const selected = await selectedFiles(files, durations, { index, count: matrix.length });
    assert.ok(selected.length > 0, `empty shard ${String(index)}`);
    assert.deepEqual(selected, (shards[index - 1] ?? []).toSorted());
    selections.push(selected);
  }
  assert.deepEqual(selections.flat().toSorted(), files, 'every file must occur exactly once');
}

async function verifyLanguage(
  language: string,
  gates: Promise<Record<string, string[]>>,
): Promise<{ cases: ListedCase[]; files: string[]; matrix: number[]; loads: number[] }> {
  const [expected, cases] = await Promise.all([gates, scriptCases(language)]);
  assert.deepEqual(
    cases.map(caseId).toSorted(),
    expected[language],
    `test:${language} must select exactly the cases that its E2E flag enables`,
  );
  const files = [...new Set(cases.map(({ file }) => file))].toSorted();
  const durations = readProfile(suiteFile(import.meta.dirname, `${language}-e2e.json`), files);
  const matrix = readMatrix(language);
  const shards = assignShards(files, durations, matrix.length);
  await assertShardPartition({ files, durations, shards, matrix });
  const loads = shards.map((shard) =>
    shard.reduce((sum, file) => sum + weightOf(durations, file), 0),
  );
  return { cases, files, matrix, loads };
}

function requestedLanguages(args: readonly string[]): readonly string[] {
  const languages = args.length > 0 ? args : SUITES;
  const unknown = languages.filter((language) => !SUITES.includes(language));
  assert.deepEqual(unknown, [], `the E2E suites are ${SUITES.join(', ')}`);
  return languages;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const languages = requestedLanguages(process.argv.slice(2));
  const gates = suiteGates();
  for (const language of languages) {
    const { cases, files, matrix, loads } = await verifyLanguage(language, gates);
    console.log(
      JSON.stringify({
        language,
        cases: cases.length,
        files: files.length,
        shards: matrix.length,
        estimatedSeconds: loads,
      }),
    );
  }
}
