#!/usr/bin/env node
import { runSupported } from './tooling/node-version/run-supported.mts';
import { numberOr } from '../shared/values/readers.mts';
import { checkCommandOf } from './command/checks/check-cli.mts';

const exitCode: unknown = await runSupported(process.stderr, () =>
  checkCommandOf(process.argv[2] ?? '') === undefined
    ? import('./cli.mts')
    : import('./command/checks/check-cli.mts'),
);
process.exitCode = numberOr(exitCode, 2);
