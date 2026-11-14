#!/usr/bin/env node
import { runSupported } from './tooling/node-version/run-supported.mjs';
import { numberOr } from '../shared/values/readers.mts';

const exitCode: unknown = await runSupported(process.stderr, () => import('./cli.mts'));
process.exitCode = numberOr(exitCode, 2);
