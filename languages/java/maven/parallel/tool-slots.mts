import { availableParallelism } from 'node:os';
import { machineMemory } from '../../../../shared/processes/machine-capacity.mts';

const GIB = 1024 ** 3;
const MEMORY_PER_SLOT = 1.5 * GIB;
const TOOL_MEMORY_PERCENT = 75;

export function toolSlots(cpus = availableParallelism(), memory = machineMemory()): number {
  const byMemory = Math.floor((memory * TOOL_MEMORY_PERCENT) / 100 / MEMORY_PER_SLOT);
  return Math.max(1, Math.min(cpus, byMemory));
}

export function toolHeapFlags(slots = toolSlots()): string[] {
  return [`-XX:MaxRAMPercentage=${(TOOL_MEMORY_PERCENT / slots).toFixed(1)}`];
}

export function withToolHeap(jvmArgs: readonly string[], slots = toolSlots()): string[] {
  const sized = jvmArgs.some((flag) => /^-Xmx|^-XX:(?:Max|Initial|Min)RAMPercentage=/u.test(flag));
  return sized ? [...jvmArgs] : [...toolHeapFlags(slots), ...jvmArgs];
}
