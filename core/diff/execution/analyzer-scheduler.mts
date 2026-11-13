import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { FORCE_KILL_DELAY_MS, installShutdownHandlers } from './process.mts';
import { resolveMaxParallel, runTaskGraph } from './graph/task-graph.mts';
import { readStandardInput } from '../../../shared/processes/standard-input.mts';
import { fieldOf } from '../../../shared/values/readers.mts';

async function readInput(): Promise<unknown> {
  return JSON.parse((await readStandardInput()).toString('utf8'));
}

async function schedule(): Promise<void> {
  const shutdownController = new AbortController();
  installShutdownHandlers(shutdownController, { forceKillDelayMs: FORCE_KILL_DELAY_MS });
  try {
    const input = await readInput();
    const result = await runTaskGraph(fieldOf(input, 'tasks'), {
      maxParallel: resolveMaxParallel(process.env),
      signal: shutdownController.signal,
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(
      `Analyzer scheduler failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 2;
  }
}

const invokedPath = process.argv[1];

if (
  invokedPath !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(invokedPath)).href
) {
  await schedule();
}
