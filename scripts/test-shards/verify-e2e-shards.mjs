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

for (const language of process.argv.slice(2).length ? process.argv.slice(2) : ['java', 'kotlin']) {
  const workflow = parse(
    readFileSync(path.join(root, `.github/workflows/${language}-e2e.yml`), 'utf8'),
  );
  const matrix = workflow.jobs[`${language}-shard`].strategy.matrix.shard;
  const cases = discover(language);
  const files = [...new Set(cases.map(({ file }) => path.relative(root, file)))].toSorted();
  const durations = readDurations(path.join(import.meta.dirname, `${language}-e2e.json`));
  assert.deepEqual(
    [...durations.keys()].toSorted(),
    files,
    'timing profile must cover every selected file',
  );
  const shards = assignShards(files, durations, matrix.length);
  process.env[`NITPICKER_${language.toUpperCase()}_E2E`] = '1';
  const actual = [];
  for (const index of matrix) {
    const { options } = parseCLI(['vitest', 'run', `--shard=${index}/${matrix.length}`]);
    const context = await createVitest('test', {
      ...options,
      config: path.join(root, 'vitest.config.mts'),
    });
    let relative;
    try {
      assert.deepEqual(context.config.shard, { index, count: matrix.length });
      const sequencer = context.config.sequence.sequencer(context);
      const selected = sequencer.shard(files.map((file) => ({ moduleId: path.join(root, file) })));
      relative = selected.map(({ moduleId }) => path.relative(root, moduleId)).toSorted();
    } finally {
      await context.close();
    }
    assert.ok(relative.length > 0, `empty ${language} shard ${index}`);
    assert.deepEqual(relative, shards[index - 1].toSorted());
    actual.push(relative);
  }
  delete process.env[`NITPICKER_${language.toUpperCase()}_E2E`];
  assert.deepEqual(actual.flat().toSorted(), files, 'every file must occur exactly once');
  assert.equal(cases.length, language === 'java' ? 80 : 59, 'behavioral case coverage changed');
  const loads = shards.map((shard) => shard.reduce((sum, file) => sum + durations.get(file), 0));
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
