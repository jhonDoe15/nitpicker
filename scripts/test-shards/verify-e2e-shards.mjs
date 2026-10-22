import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from 'yaml';
import { createVitest, parseCLI } from 'vitest/node';
import {
  SUITES,
  caseId,
  classifyGates,
  gateCandidates,
  suiteFlag,
  workflowProblems,
} from './e2e-gates.mjs';
import { assignShards, readDurations } from './sequencer.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const VITEST_CONFIG = path.join(root, 'vitest.config.mts');

function suiteFile(base, name) {
  const full = path.resolve(base, name);
  if (!full.startsWith(base + path.sep)) {
    throw new Error(`${name} is outside ${base}`);
  }
  return full;
}

function listCases(args, flag) {
  const unset = SUITES.flatMap((suite) => ['-u', suiteFlag(suite)]);
  const result = spawnSync(
    'env',
    [
      ...unset,
      ...(flag === undefined ? [] : [`${flag}=1`]),
      process.execPath,
      path.join(root, 'node_modules/vitest/vitest.mjs'),
      'list',
      ...args,
      '--json',
    ],
    { cwd: root, encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout).map(({ file, name }) => ({
    file: path.relative(root, file).split(path.sep).join('/'),
    name,
  }));
}

function scriptCases(language) {
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const command = pkg.scripts[`test:${language}`].split(' ');
  assert.equal(command[0], `${suiteFlag(language)}=1`, `test:${language} must set its E2E flag`);
  return listCases(command.slice(command.indexOf('run') + 1), suiteFlag(language));
}

function suiteGates() {
  const candidates = gateCandidates(root);
  const filters = ['--config', VITEST_CONFIG, ...candidates.map(({ file }) => file)];
  const listings = {
    baseline: listCases(filters),
    listed: Object.fromEntries(
      SUITES.map((suite) => [suite, listCases(filters, suiteFlag(suite))]),
    ),
  };
  const gates = classifyGates(candidates, listings);
  assert.deepEqual(
    gates.problems,
    [],
    'every E2E test file must be gated by exactly one suite flag',
  );
  return gates.expected;
}

function readProfile(profile, files) {
  const durations = readDurations(profile);
  assert.deepEqual(
    [...durations.keys()].toSorted(),
    files,
    'timing profile must cover every selected file',
  );
  return durations;
}

function readMatrix(language) {
  const workflow = parse(
    readFileSync(suiteFile(root, `.github/workflows/${language}-e2e.yml`), 'utf8'),
  );
  assert.deepEqual(workflowProblems(workflow, language), []);
  return workflow.jobs[`${language}-shard`].strategy.matrix.shard;
}

async function selectedFiles(files, durations, { index, count }) {
  const { options } = parseCLI(['vitest', 'run', `--shard=${index}/${count}`]);
  const context = await createVitest('test', { ...options, config: VITEST_CONFIG });
  try {
    assert.deepEqual(context.config.shard, { index, count });
    const sequencer = context.config.sequence.sequencer(context, durations);
    const selected = sequencer.shard(files.map((file) => ({ moduleId: path.join(root, file) })));
    return selected.map(({ moduleId }) => path.relative(root, moduleId)).toSorted();
  } finally {
    await context.close();
  }
}

async function assertShardPartition({ files, durations, shards, matrix }) {
  const selections = [];
  for (const index of matrix) {
    const selected = await selectedFiles(files, durations, { index, count: matrix.length });
    assert.ok(selected.length > 0, `empty shard ${index}`);
    assert.deepEqual(selected, shards[index - 1].toSorted());
    selections.push(selected);
  }
  assert.deepEqual(selections.flat().toSorted(), files, 'every file must occur exactly once');
}

async function verifyLanguage(language, expected) {
  const cases = scriptCases(language);
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
  const loads = shards.map((shard) => shard.reduce((sum, file) => sum + durations.get(file), 0));
  return { cases, files, matrix, loads };
}

function requestedLanguages(args) {
  const languages = args.length > 0 ? args : SUITES;
  const unknown = languages.filter((language) => !SUITES.includes(language));
  assert.deepEqual(unknown, [], `the E2E suites are ${SUITES.join(', ')}`);
  return languages;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const languages = requestedLanguages(process.argv.slice(2));
  const expected = suiteGates();
  for (const language of languages) {
    const { cases, files, matrix, loads } = await verifyLanguage(language, expected);
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
