#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { listOf, requiredText } from '../../scripts/json/fields.mts';

const logFile = process.env['NITPICKER_EVAL_GATE_LOG'];
const controlDirectory = process.env['NITPICKER_EVAL_CONTROL_DIR'];
const gateArguments = listOf(JSON.parse(process.env['NITPICKER_EVAL_GATE_ARGV'] ?? '[]')).map(
  (argument) => requiredText(argument, 'gate argument'),
);
const [executable, ...baseArguments] = gateArguments;
if (!logFile || !controlDirectory || executable === undefined) {
  console.error('nitpicker-gate: not started by the eval runner');
  process.exit(2);
}

const agentArguments = process.argv.slice(2);
const isUsageRequestNotCountedAsGateRun = agentArguments.includes('--help');
if (isUsageRequestNotCountedAsGateRun) {
  const help = spawnSync(executable, [...baseArguments, ...agentArguments], { stdio: 'inherit' });
  process.exit(help.status ?? 2);
}

const iteration = existsSync(logFile)
  ? readFileSync(logFile, 'utf8').split('\n').filter(Boolean).length + 1
  : 1;
const reportDirectory = path.join(controlDirectory, 'agent-reports', String(iteration));
const startedAt = Date.now();
const result = spawnSync(
  executable,
  [...baseArguments, '--output', reportDirectory, ...agentArguments],
  { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } },
);
const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
const exit = result.status ?? 2;
process.stdout.write(output);
const logEntry = {
  iteration,
  args: agentArguments,
  exit,
  durationMs: Date.now() - startedAt,
  reportDirectory,
  output,
};
appendFileSync(logFile, `${JSON.stringify(logEntry)}\n`);
process.exit(exit);
