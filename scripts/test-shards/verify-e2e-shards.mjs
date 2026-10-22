import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from 'yaml';
import { createVitest, parseCLI } from 'vitest/node';
import { assignShards, readDurations } from './sequencer.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const JVM_LANGUAGES = ['java', 'kotlin'];
const E2E_FILE_FILTER = '.e2e.test.';
const VITEST_CONFIG = path.join(root, 'vitest.config.mts');

function discover(language, args) {
  const result = spawnSync(
    process.execPath,
    [path.join(root, 'node_modules/vitest/vitest.mjs'), 'list', ...args, '--json'],
    {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, [`NITPICKER_${language.toUpperCase()}_E2E`]: '1' },
    },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout).map(({ file, name }) => ({
    file: path.relative(root, file),
    name,
  }));
}

function scriptCases(language) {
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const command = pkg.scripts[`test:${language}`].split(' ');
  return discover(language, command.slice(command.indexOf('run') + 1));
}

function caseIds(cases) {
  return cases.map(({ file, name }) => `${file} > ${name}`).toSorted();
}

function gatedCaseIds(language) {
  const filter = ['--config', VITEST_CONFIG, E2E_FILE_FILTER];
  const otherSuite = JVM_LANGUAGES.find((other) => other !== language);
  const ungated = new Set(caseIds(discover(otherSuite, filter)));
  return caseIds(discover(language, filter)).filter((id) => !ungated.has(id));
}

function assertScriptSelectsGatedCases(language, cases) {
  assert.deepEqual(
    caseIds(cases),
    gatedCaseIds(language),
    `test:${language} must select exactly the cases that its E2E flag enables`,
  );
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

function readMatrix(workflowFile, language) {
  return parse(readFileSync(workflowFile, 'utf8')).jobs[`${language}-shard`].strategy.matrix.shard;
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

async function verifyLanguage(language) {
  const cases = scriptCases(language);
  assertScriptSelectsGatedCases(language, cases);
  const files = [...new Set(cases.map(({ file }) => file))].toSorted();
  const durations = readProfile(path.join(import.meta.dirname, `${language}-e2e.json`), files);
  const workflowFile = path.join(root, `.github/workflows/${language}-e2e.yml`);
  const matrix = readMatrix(workflowFile, language);
  const shards = assignShards(files, durations, matrix.length);
  await assertShardPartition({ files, durations, shards, matrix });
  const loads = shards.map((shard) => shard.reduce((sum, file) => sum + durations.get(file), 0));
  return { cases, files, matrix, loads };
}

function requestedLanguages(args) {
  const languages = args.length > 0 ? args : JVM_LANGUAGES;
  const unknown = languages.filter((language) => !JVM_LANGUAGES.includes(language));
  assert.deepEqual(unknown, [], `the JVM suites are ${JVM_LANGUAGES.join(' and ')}`);
  return languages;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const language of requestedLanguages(process.argv.slice(2))) {
    const { cases, files, matrix, loads } = await verifyLanguage(language);
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
