#!/usr/bin/env node
// The reference solution as an agent: applies `cases/<NITPICKER_EVAL_CASE>/reference/` (files that
// overlay the fixture) to the current directory and runs the gate once with `nitpicker-gate`. It
// proves a case is solvable and that the runner's checks accept a correct solution, with no model
// call. Run it through the runner like any other agent:
//   node evals/run.mjs run --agent "node evals/runner/reference-agent.mjs" --tier reference --runs 1
// With `--overlay <name>` it then applies `cases/<id>/cheats/<name>/` on top of the reference, so a
// negative case can show a cheating run (the shortcut replaces files of the honest solution).
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const caseId = process.env.NITPICKER_EVAL_CASE;
const overlayFlag = process.argv.indexOf('--overlay');
const overlay = overlayFlag === -1 ? undefined : process.argv[overlayFlag + 1];
const caseDirectory = path.join(import.meta.dirname, '..', 'cases', caseId ?? '');
const reference = path.join(caseDirectory, 'reference');
const cheat = overlay === undefined ? undefined : path.join(caseDirectory, 'cheats', overlay);
if (!caseId || !existsSync(reference) || (overlayFlag !== -1 && !overlay)) {
  console.error(`reference-agent: case ${caseId} has no reference solution`);
  process.exit(2);
}
if (cheat !== undefined && !existsSync(cheat)) {
  console.error(`reference-agent: case ${caseId} has no cheat overlay ${overlay}`);
  process.exit(2);
}

cpSync(reference, process.cwd(), { recursive: true });
if (cheat !== undefined) {
  cpSync(cheat, process.cwd(), { recursive: true });
}
const gate = spawnSync('nitpicker-gate', { stdio: 'inherit' });

writeFileSync(
  process.env.NITPICKER_EVAL_RESULT_FILE,
  JSON.stringify({ costUsd: 0, inputTokens: 0, outputTokens: 0, turns: 0 }),
);
process.exit(gate.status === 0 ? 0 : 1);
