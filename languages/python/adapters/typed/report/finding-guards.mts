import { fieldOf } from '../../../../../shared/values/readers.mts';
import type { IngestedFinding } from './report-types.mts';

export function isFinding(value: unknown): value is IngestedFinding {
  return typeof fieldOf(value, 'rule') === 'string';
}
