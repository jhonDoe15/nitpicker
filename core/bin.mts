#!/usr/bin/env node
import { runSupported } from './tooling/node-version/run-supported.mts';
import { numberOr } from '../shared/values/readers.mts';
import { CHECK_COMMAND_NAMES } from './command/checks/check-names.mts';

async function checkCli(): Promise<{ readonly runCli: () => Promise<number> }> {
  const { runCheckCli } = await import('./command/checks/check-cli.mts');
  return { runCli: () => runCheckCli(process) };
}

const exitCode: unknown = await runSupported(process.stderr, () =>
  CHECK_COMMAND_NAMES.has(process.argv[2] ?? '') ? checkCli() : import('./cli.mts'),
);
process.exitCode = numberOr(exitCode, 2);
