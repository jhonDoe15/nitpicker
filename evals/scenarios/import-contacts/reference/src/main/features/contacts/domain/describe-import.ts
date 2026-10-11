import type { ImportResult } from './collect-contacts.js';

export function describeImport(result: ImportResult, path: string): readonly string[] {
  switch (result.kind) {
    case 'imported':
      return [
        `Imported ${String(result.contacts.length)} contacts`,
        ...result.rejected.map(
          (rejection) => `Rejected #${String(rejection.index)}: ${rejection.reason}`,
        ),
      ];
    case 'read-failed':
      return [`Could not read ${path}: ${result.message}`];
    case 'malformed-json':
      return [`Malformed JSON in ${path}`];
    case 'not-an-array':
      return [`Expected a JSON array in ${path}`];
  }
}
