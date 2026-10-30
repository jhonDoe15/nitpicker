#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { unsupportedNodeMessage } from './tooling/node-version.mjs';

async function runSupported(stderr) {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const unsupported = unsupportedNodeMessage(process.versions.node, manifest.engines.node);
  if (unsupported !== undefined) {
    stderr.write(`${unsupported}\n`);
    return 2;
  }
  const { runCli } = await import('./cli.mjs');
  return runCli();
}

process.exitCode = await runSupported(process.stderr);
