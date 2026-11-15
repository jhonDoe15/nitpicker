import { readFile } from 'node:fs/promises';
import { parseManifest } from './run-supported-types.mts';
import type { Cli, Loaded, Stderr } from './run-supported-types.mts';
import { unloadableNodeMessage, unsupportedNodeMessage } from './node-version.mts';

async function loadCli(load: () => Promise<Cli>): Promise<Loaded> {
  try {
    return await load();
  } catch (error) {
    if (error instanceof SyntaxError) {
      return { loadError: error };
    }
    throw error;
  }
}

export async function runSupported(stderr: Stderr, load: () => Promise<Cli>): Promise<unknown> {
  const manifest = parseManifest(
    await readFile(new URL('../../../package.json', import.meta.url), 'utf8'),
  );
  const nodeVersion = process.versions.node;
  const unsupported = unsupportedNodeMessage(nodeVersion, manifest.engines.node);
  if (unsupported !== undefined) {
    stderr.write(`${unsupported}\n`);
    return 2;
  }
  const cli = await loadCli(load);
  if (cli.loadError !== undefined) {
    stderr.write(`${unloadableNodeMessage(nodeVersion, manifest.engines.node, cli.loadError)}\n`);
    return 2;
  }
  return cli.runCli();
}
