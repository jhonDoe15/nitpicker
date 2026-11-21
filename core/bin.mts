#!/usr/bin/env node
import { runSupported } from './tooling/node-version/run-supported.mts';
import { numberOr } from '../shared/values/readers.mts';
import { CHECK_COMMAND_NAMES } from './command/checks/check-names.mts';

const exitCode: unknown = await runSupported(process.stderr, () =>
  CHECK_COMMAND_NAMES.has(process.argv[2] ?? '')
    ? import('./command/checks/check-cli.mts').then(({ runCheckCli }) => ({
        runCli: () => runCheckCli(process),
      }))
    : import('./cli.mts'),
);
process.exitCode = numberOr(exitCode, 2);
