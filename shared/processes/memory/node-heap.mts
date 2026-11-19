import { getHeapStatistics } from 'node:v8';
import { machineMemory, resolveMaxParallel } from '../machine-capacity.mts';

export type HeapBudget = {
  readonly memory: number;
  readonly parallel: number;
  readonly defaultLimit: number;
};

type Environment = Readonly<Record<string, string | undefined>>;

const MIB = 1024 ** 2;
const TOOL_MEMORY_PERCENT = 75;
const OTHER_ANALYZER_RESERVE = 1536 * MIB;
const HEAP_FLAG = /--max[-_]old[-_]space[-_]size[=\s](?<megabytes>\d+)/u;
const OUT_OF_MEMORY = /JavaScript heap out of memory|Reached heap limit/u;

export function usableMemoryMegabytes(memory: number = machineMemory()): number {
  return Math.floor((memory * TOOL_MEMORY_PERCENT) / 100 / MIB);
}

export function nodeHeapMegabytes({ memory, parallel, defaultLimit }: HeapBudget): number {
  const budget = (memory * TOOL_MEMORY_PERCENT) / 100 - (parallel - 1) * OTHER_ANALYZER_RESERVE;
  return Math.floor(Math.max(defaultLimit, budget) / MIB);
}

export function heapMegabytesOf(nodeOptions: string | undefined): number | undefined {
  const megabytes = HEAP_FLAG.exec(nodeOptions ?? '')?.groups?.['megabytes'];
  return megabytes === undefined ? undefined : Number(megabytes);
}

export function withNodeHeap(
  environment: Environment,
  budget: Omit<HeapBudget, 'parallel'> = {
    memory: machineMemory(),
    defaultLimit: getHeapStatistics().heap_size_limit,
  },
): Environment {
  const nodeOptions = environment['NODE_OPTIONS'];
  if (heapMegabytesOf(nodeOptions) !== undefined) {
    return environment;
  }
  const megabytes = nodeHeapMegabytes({ ...budget, parallel: resolveMaxParallel(environment) });
  return {
    ...environment,
    NODE_OPTIONS: [nodeOptions ?? '', `--max-old-space-size=${String(megabytes)}`].join(' ').trim(),
  };
}

export function isOutOfMemory(stderr: string): boolean {
  return OUT_OF_MEMORY.test(stderr);
}

export function heapDescription(nodeOptions: string | undefined): string {
  const megabytes = heapMegabytesOf(nodeOptions);
  return megabytes === undefined ? "Node's default heap" : `${String(megabytes)} MB heap`;
}

export const MEMORY_ADVICE =
  'Lower NITPICKER_MAX_PARALLEL so it gets a larger share of the machine, or give it more heap ' +
  'with NODE_OPTIONS=--max-old-space-size=<MB>, and rerun.';
