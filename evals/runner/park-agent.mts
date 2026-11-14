#!/usr/bin/env node
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const POLL_MS = 2000;
const parkDirectory = process.env['NITPICKER_EVAL_PARK_DIR'];
if (!parkDirectory) {
  console.error('park-agent: set NITPICKER_EVAL_PARK_DIR');
  process.exit(2);
}
mkdirSync(parkDirectory, { recursive: true });
function safe(text: string | undefined): string {
  return String(text).replaceAll(/[^\w.-]/gu, '_');
}
const name = [
  process.env['NITPICKER_EVAL_CASE'],
  process.env['NITPICKER_EVAL_TIER'],
  process.env['NITPICKER_EVAL_RUN'],
]
  .map(safe)
  .join('-');
const envFile = path.join(parkDirectory, `${name}.env`);
const doneFile = path.join(parkDirectory, `${name}.done`);
for (const stale of [envFile, doneFile, path.join(parkDirectory, `${name}.json`)]) {
  rmSync(stale, { force: true });
}
const forwarded = Object.entries(process.env).filter(([key]) => key.startsWith('NITPICKER_EVAL_'));
writeFileSync(
  envFile,
  [
    `export PATH=${JSON.stringify(process.env['PATH'])}`,
    ...forwarded.map(([key, value]) => `export ${key}=${JSON.stringify(value)}`),
  ].join('\n') + '\n',
);
writeFileSync(
  path.join(parkDirectory, `${name}.json`),
  `${JSON.stringify(
    {
      case: process.env['NITPICKER_EVAL_CASE'],
      run: process.env['NITPICKER_EVAL_RUN'],
      workdir: process.env['NITPICKER_EVAL_WORKDIR'],
      promptFile: process.env['NITPICKER_EVAL_PROMPT_FILE'],
      resultFile: process.env['NITPICKER_EVAL_RESULT_FILE'],
      envFile,
      tier: process.env['NITPICKER_EVAL_TIER'],
      doneFile,
    },
    null,
    2,
  )}\n`,
);
while (!existsSync(doneFile)) {
  await sleep(POLL_MS);
}
