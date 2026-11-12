#!/usr/bin/env node
import { runSupported } from './tooling/node-version/run-supported.mjs';

process.exitCode = await runSupported(process.stderr, () => import('./cli.mjs'));
