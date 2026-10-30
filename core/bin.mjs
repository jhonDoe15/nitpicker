#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { unloadableNodeMessage, unsupportedNodeMessage } from './tooling/node-version.mjs';

async function loadCli() {
  try {
    return await import('./cli.mjs');
  } catch (error) {
    if (error instanceof SyntaxError) {
      return { loadError: error };
    }
    throw error;
  }
}

async function runSupported(stderr) {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const nodeVersion = process.versions.node;
  const unsupported = unsupportedNodeMessage(nodeVersion, manifest.engines.node);
  if (unsupported !== undefined) {
    stderr.write(`${unsupported}\n`);
    return 2;
  }
  const cli = await loadCli();
  if (cli.loadError !== undefined) {
    stderr.write(`${unloadableNodeMessage(nodeVersion, manifest.engines.node, cli.loadError)}\n`);
    return 2;
  }
  return cli.runCli();
}

process.exitCode = await runSupported(process.stderr);
