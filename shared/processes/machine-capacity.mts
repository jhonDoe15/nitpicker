import { availableParallelism, totalmem } from 'node:os';

const DEFAULT_MAX_PARALLEL = 4;

export function machineMemory(
  constrained: number = process.constrainedMemory(),
  total: number = totalmem(),
): number {
  return constrained > 0 && constrained < total ? constrained : total;
}

export function resolveMaxParallel(
  environment: Readonly<Record<string, string | undefined>>,
  available: number = availableParallelism(),
): number {
  const configured = environment['NITPICKER_MAX_PARALLEL'];
  if (configured === undefined) {
    return Math.max(1, Math.min(DEFAULT_MAX_PARALLEL, available));
  }
  const value = Number(configured);
  if (!Number.isInteger(value) || value < 1) {
    throw new TypeError('NITPICKER_MAX_PARALLEL must be a positive integer');
  }
  return value;
}
