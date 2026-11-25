import { availableParallelism, totalmem } from 'node:os';

const DEFAULT_MAX_PARALLEL = 4;
export const MEMORY_LIMIT_VARIABLE = 'NITPICKER_MEMORY_LIMIT_BYTES';

function configuredMemoryLimit(
  environment: Readonly<Record<string, string | undefined>>,
): number | undefined {
  const raw = environment[MEMORY_LIMIT_VARIABLE];
  if (raw === undefined || !/^[1-9]\d*$/u.test(raw)) {
    return undefined;
  }
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : undefined;
}

export function machineMemory(
  constrained: number = process.constrainedMemory(),
  total: number = totalmem(),
  environment: Readonly<Record<string, string | undefined>> = process.env,
): number {
  const physical = constrained > 0 && constrained < total ? constrained : total;
  const configured = configuredMemoryLimit(environment);
  return configured !== undefined && configured < physical ? configured : physical;
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
