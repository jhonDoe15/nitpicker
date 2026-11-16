import { fieldOf } from '../../../../shared/values/readers.mts';

export type Diagnostic = {
  readonly file: unknown;
  readonly line: unknown;
  readonly column: unknown;
  readonly message: unknown;
};

export function diagnosticOf(value: unknown): Diagnostic {
  return {
    file: fieldOf(value, 'file'),
    line: fieldOf(value, 'line'),
    column: fieldOf(value, 'column'),
    message: fieldOf(value, 'message'),
  };
}
