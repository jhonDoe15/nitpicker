import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { FORCE_KILL_DELAY_MS, installShutdownHandlers } from './process.mts';
import { runTaskGraph } from './graph/task-graph.mts';
import { sharedMemoryOf } from './memory/memory-lease.mts';
import { resolveMaxParallel } from '../../../shared/processes/machine-capacity.mts';
import { readStandardInput } from '../../../shared/processes/standard-input.mts';
import { fieldOf, fieldsOf } from '../../../shared/values/readers.mts';
import {
  compactJsonLines,
  writePieces,
} from '../../../shared/report-output/pieces/json-pieces.mts';
import { withInternalFrames } from '../../../shared/messages/crashes/internal-error.mts';

function applyEnvironment(settings: unknown): void {
  for (const [name, value] of Object.entries(fieldsOf(settings))) {
    if (typeof value === 'string') {
      process.env[name] = value;
    }
  }
}

export type ScheduleInput = {
  readonly read: () => Promise<Buffer>;
  readonly signal: AbortSignal;
};

export async function schedule({ read, signal }: ScheduleInput): Promise<void> {
  try {
    const input: unknown = JSON.parse((await read()).toString('utf8'));
    applyEnvironment(fieldOf(input, 'environment'));
    const result = await runTaskGraph(fieldOf(input, 'tasks'), {
      maxParallel: resolveMaxParallel(process.env),
      sharedMemory: sharedMemoryOf(process.env),
      signal,
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
  const shutdownController = new AbortController();
  installShutdownHandlers(shutdownController, { forceKillDelayMs: FORCE_KILL_DELAY_MS });
  await schedule({ read: readStandardInput, signal: shutdownController.signal });
}
