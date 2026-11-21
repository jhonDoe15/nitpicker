import type { EncodedPage, EntryFields } from './entry-types.mts';

export function isEntryFields(record: Readonly<Record<string, unknown>>): record is EntryFields {
  const { tool, rule, summary, analyzers, exception } = record;
  return (
    typeof tool === 'string' &&
    typeof rule === 'string' &&
    typeof summary === 'string' &&
    typeof analyzers === 'object' &&
    analyzers !== null &&
    typeof exception === 'object' &&
    exception !== null
  );
}

export function isEncodedPage(value: unknown): value is EncodedPage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'fields' in value &&
    Array.isArray(value.fields) &&
    'values' in value &&
    Array.isArray(value.values) &&
    'entries' in value &&
    Array.isArray(value.entries)
  );
}
