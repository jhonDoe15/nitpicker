import { constants } from 'node:buffer';
import { fieldOf } from '../../../../../shared/values/readers.mts';

export const MAX_GRAPH_OUTPUT_BYTES = constants.MAX_STRING_LENGTH;

function withoutDependencyCycle(this: unknown, key: string, value: unknown): unknown {
  return key === 'cycle' && typeof fieldOf(this, 'resolved') === 'string' ? undefined : value;
}

export function compactGraphText(text: string): string {
  return JSON.stringify(JSON.parse(text), withoutDependencyCycle);
}
