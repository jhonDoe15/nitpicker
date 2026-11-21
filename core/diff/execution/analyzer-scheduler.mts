import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { FORCE_KILL_DELAY_MS, installShutdownHandlers } from './process.mts';
import { runTaskGraph } from './graph/task-graph.mts';
import { resolveMaxParallel } from '../../../shared/processes/machine-capacity.mts';
import { readStandardInput } from '../../../shared/processes/standard-input.mts';
import { fieldOf, fieldsOf } from '../../../shared/values/readers.mts';
import {
  compactJsonLines,
  writePieces,
} from '../../../shared/report-output/pieces/json-pieces.mts';
import { withInternalFrames } from '../../../shared/messages/crashes/internal-error.mts';

async function readInput(): Promise<unknown> {
  return JSON.parse((await readStandardInput()).toString('utf8'));
}

function applyEnvironment(settings: unknown): void {
  for (const [name, value] of Object.entries(fieldsOf(settings))) {
    if (typeof value === 'string') {
      process.env[name] = value;
    }
  }
}

async function schedule(): Promise<void> {
  const shutdownController = new AbortController();
  installShutdownHandlers(shutdownController, { forceKillDelayMs: FORCE_KILL_DELAY_MS });
  try {
    const input = await readInput();
    applyEnvironment(fieldOf(input, 'environment'));
    const result = await runTaskGraph(fieldOf(input, 'tasks'), {
      maxParallel: resolveMaxParallel(process.env),
      signal: shutdownController.signal,
    });
    writePieces(compactJsonLines(result), (text) => process.stdout.write(text));
    process.stdout.write('\n');
  } catch (error) {
    process.stderr.write(
      `Analyzer scheduler failed: ${withInternalFrames(error instanceof Error ? error.message : String(error), error)}\n`,
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
