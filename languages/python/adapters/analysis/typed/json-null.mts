import type { JsonNull } from './python-graph-types.mts';

function readNull(): JsonNull {
  const value: unknown = JSON.parse('null');
  if (value === null) {
    return value;
  }
  throw new TypeError('JSON null did not parse to null');
}

export const JSON_NULL: JsonNull = readNull();
