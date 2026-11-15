import { fieldOf } from '../../../../shared/values/readers.mts';
import type { FindingRow } from '../go-types.mts';

export function isRow(value: unknown): value is FindingRow {
  return typeof fieldOf(value, 'rule') === 'string';
}
