#!/usr/bin/env node
// The only gate command the agent is given. Runs the real gate in the current directory, relays its
// output and exit code, and records each run so the runner can count iterations and keep the
// failure messages the agent saw. The log lives outside the agent's working tree.
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const logFile = process.env.NITPICKER_EVAL_GATE_LOG;
const controlDirectory = process.env.NITPICKER_EVAL_CONTROL_DIR;
const gateArguments = JSON.parse(process.env.NITPICKER_EVAL_GATE_ARGV ?? '[]');
if (!logFile || !controlDirectory || gateArguments.length === 0) {
  console.error('nitpicker-gate: not started by the eval runner');
  process.exit(2);
}

const agentArguments = process.argv.slice(2);
if (agentArguments.includes('--help')) {
  // Asking for usage is not a gate run: relay it without counting an iteration.
  const help = spawnSync(gateArguments[0], [...gateArguments.slice(1), ...agentArguments], {
    stdio: 'inherit',
  });
  process.exit(help.status ?? 2);
}

const iteration = existsSync(logFile)
  ? readFileSync(logFile, 'utf8').split('\n').filter(Boolean).length + 1
  : 1;
const reportDirectory = path.join(controlDirectory, 'agent-reports', String(iteration));
const [executable, ...baseArguments] = gateArguments;
const startedAt = Date.now();
const result = spawnSync(
  executable,
  [...baseArguments, '--output', reportDirectory, ...agentArguments],
  { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } },
);
const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
const exit = result.status ?? 2;
process.stdout.write(output);
appendFileSync(
  logFile,
  `${JSON.stringify({ iteration, args: agentArguments, exit, durationMs: Date.now() - startedAt, reportDirectory, output })}\n`,
);
process.exit(exit);
