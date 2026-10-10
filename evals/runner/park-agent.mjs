#!/usr/bin/env node
// An agent command for running cases with an interactive coding agent, such as a Claude Code
// subagent, instead of a scripted one. It hands the case to whoever is driving the run and waits:
// it writes `<NITPICKER_EVAL_PARK_DIR>/<case>-<run>.json` with the workdir, the prompt and an
// `env` file to source (it puts `nitpicker-gate` on PATH), then waits until
// `<case>-<run>.done` appears in the same directory. The runner then scores the workdir as usual.
//   NITPICKER_EVAL_PARK_DIR=/tmp/park node evals/run.mjs run --agent "node evals/runner/park-agent.mjs" \
//     --tier sonnet-skill --case <id>
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const POLL_MS = 2000;
const parkDirectory = process.env.NITPICKER_EVAL_PARK_DIR;
if (!parkDirectory) {
  console.error('park-agent: set NITPICKER_EVAL_PARK_DIR');
  process.exit(2);
}
mkdirSync(parkDirectory, { recursive: true });
const name = `${process.env.NITPICKER_EVAL_CASE}-${process.env.NITPICKER_EVAL_RUN}`;
const envFile = path.join(parkDirectory, `${name}.env`);
const forwarded = Object.entries(process.env).filter(([key]) => key.startsWith('NITPICKER_EVAL_'));
writeFileSync(
  envFile,
  [
    `export PATH=${JSON.stringify(process.env.PATH)}`,
    ...forwarded.map(([key, value]) => `export ${key}=${JSON.stringify(value)}`),
  ].join('\n') + '\n',
);
writeFileSync(
  path.join(parkDirectory, `${name}.json`),
  `${JSON.stringify(
    {
      case: process.env.NITPICKER_EVAL_CASE,
      run: process.env.NITPICKER_EVAL_RUN,
      workdir: process.env.NITPICKER_EVAL_WORKDIR,
      promptFile: process.env.NITPICKER_EVAL_PROMPT_FILE,
      envFile,
      doneFile: path.join(parkDirectory, `${name}.done`),
    },
    null,
    2,
  )}\n`,
);
while (!existsSync(path.join(parkDirectory, `${name}.done`))) {
  await sleep(POLL_MS);
}
