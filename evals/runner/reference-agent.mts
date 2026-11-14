#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { requiredText } from '../../scripts/json/fields.mts';

const caseId = process.env['NITPICKER_EVAL_CASE'];
const overlayFlag = process.argv.indexOf('--overlay');
const overlay = overlayFlag === -1 ? undefined : process.argv[overlayFlag + 1];
const caseDirectory =
  process.env['NITPICKER_EVAL_CASE_DIR'] ??
  path.join(import.meta.dirname, '..', 'cases', caseId ?? '');
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
  requiredText(process.env['NITPICKER_EVAL_RESULT_FILE'], 'NITPICKER_EVAL_RESULT_FILE'),
  JSON.stringify({ costUsd: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, turns: 0 }),
);
process.exit(gate.status === 0 ? 0 : 1);
