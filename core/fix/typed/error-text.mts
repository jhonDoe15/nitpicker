import { fieldOf } from '../../../shared/values/readers.mts';

export function errorCode(error: unknown): unknown {
  return fieldOf(error, 'code');
}
