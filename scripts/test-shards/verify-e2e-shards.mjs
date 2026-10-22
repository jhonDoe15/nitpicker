import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { createVitest, parseCLI } from 'vitest/node';
import { assignShards, readDurations } from './sequencer.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

// Collect through the package script's real flags and Vitest config without running JVM builds.
function discover(language, extra = []) {
  const command = pkg.scripts[`test:${language}`].split(' ');
  const args = command.slice(command.indexOf('run') + 1);
  const result = spawnSync(
    process.execPath,
    [path.join(root, 'node_modules/vitest/vitest.mjs'), 'list', ...args, '--json', ...extra],
    {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, [`NITPICKER_${language.toUpperCase()}_E2E`]: '1' },
    },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

const EXPECTED_JAVA_CASES = 76;
const EXPECTED_KOTLIN_CASES = 115;
const EXPECTED_CASES = { java: EXPECTED_JAVA_CASES, kotlin: EXPECTED_KOTLIN_CASES };

function contained(base, ...segments) {
  const full = path.resolve(base, ...segments);
  if (!full.startsWith(base + path.sep)) {
    throw new Error(`${segments.join('/')} is outside ${base}`);
  }
  return full;
}

async function filesOfShard({ files, index, count }) {
  const { options } = parseCLI(['vitest', 'run', `--shard=${index}/${count}`]);
  const context = await createVitest('test', {
    ...options,
    config: path.join(root, 'vitest.config.mts'),
  });
  try {
    assert.deepEqual(context.config.shard, { index, count });
    const sequencer = context.config.sequence.sequencer(context);
    const selected = sequencer.shard(files.map((file) => ({ moduleId: path.join(root, file) })));
    return selected.map(({ moduleId }) => path.relative(root, moduleId)).toSorted();
  } finally {
    await context.close();
  }
}

function profileOf(language) {
  const workflow = parse(
    readFileSync(contained(path.join(root, '.github', 'workflows'), `${language}-e2e.yml`), 'utf8'),
  );
  const matrix = workflow.jobs[`${language}-shard`].strategy.matrix.shard;
  const cases = discover(language);
  const files = [...new Set(cases.map(({ file }) => path.relative(root, file)))].toSorted();
  const durations = readDurations(contained(import.meta.dirname, `${language}-e2e.json`));
  assert.deepEqual(
    [...durations.keys()].toSorted(),
    files,
    'timing profile must cover every selected file',
  );
  return { matrix, cases, files, durations };
}

async function verifyShards({ language, profile, host }) {
  const { matrix, files, durations } = profile;
  const shards = assignShards(files, durations, matrix.length);
  const flag = `NITPICKER_${language.toUpperCase()}_E2E`;
  host.env[flag] = '1';
  try {
    const actual = [];
    for (const index of matrix) {
      const relative = await filesOfShard({ files, index, count: matrix.length });
      assert.ok(relative.length > 0, `empty ${language} shard ${index}`);
      assert.deepEqual(relative, shards[index - 1].toSorted());
      actual.push(relative);
    }
    assert.deepEqual(actual.flat().toSorted(), files, 'every file must occur exactly once');
  } finally {
    Reflect.deleteProperty(host.env, flag);
  }
  return shards;
}

async function verifyLanguage(language, host) {
  const profile = profileOf(language);
  const shards = await verifyShards({ language, profile, host });
  assert.equal(profile.cases.length, EXPECTED_CASES[language], 'behavioral case coverage changed');
  return {
    language,
    cases: profile.cases.length,
    files: profile.files.length,
    shards: profile.matrix.length,
    estimatedSeconds: shards.map((shard) =>
      shard.reduce((sum, file) => sum + profile.durations.get(file), 0),
    ),
  };
}

export async function main(host) {
  const requested = host.argv.slice(1);
  try {
    for (const language of requested.length > 0 ? requested : ['java', 'kotlin']) {
      const summary = await verifyLanguage(language, host);
      host.stdout.write(`${JSON.stringify(summary)}\n`);
    }
  } catch (error) {
    host.stderr.write(`${error.stack}\n`);
    host.exitCode = 1;
  }
}
