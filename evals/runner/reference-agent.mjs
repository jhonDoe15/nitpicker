#!/usr/bin/env node
// The reference solution as an agent: applies `cases/<NITPICKER_EVAL_CASE>/reference/` (files that
// overlay the fixture) to the current directory and runs the gate once with `nitpicker-gate`. It
// proves a case is solvable and that the runner's checks accept a correct solution, with no model
// call. Run it through the runner like any other agent:
//   node evals/run.mjs run --agent "node evals/runner/reference-agent.mjs" --tier reference --runs 1
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const caseId = process.env.NITPICKER_EVAL_CASE;
const reference = path.join(import.meta.dirname, '..', 'cases', caseId ?? '', 'reference');
if (!caseId || !existsSync(reference)) {
  console.error(`reference-agent: case ${caseId} has no reference solution`);
  process.exit(2);
}

cpSync(reference, process.cwd(), { recursive: true });
const gate = spawnSync('nitpicker-gate', { stdio: 'inherit' });

writeFileSync(
  process.env.NITPICKER_EVAL_RESULT_FILE,
  JSON.stringify({ costUsd: 0, inputTokens: 0, outputTokens: 0, turns: 0 }),
);
process.exit(gate.status === 0 ? 0 : 1);
