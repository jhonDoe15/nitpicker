import { z } from 'zod';
import { collectContacts } from '../domain/collect-contacts.js';
import type { Candidate, ImportResult } from '../domain/collect-contacts.js';

const recordSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().toLowerCase().pipe(z.email()),
});

const recordsSchema = z.array(z.unknown());

function reasonOf(error: z.ZodError): string {
  const fields = error.issues.map((issue) => issue.path[0]);
  if (fields.includes('name')) {
    return 'invalid name';
  }
  if (fields.includes('email')) {
    return 'invalid email';
  }
  return 'not an object';
}

function toCandidate(record: unknown): Candidate {
  const parsed = recordSchema.safeParse(record);
  if (parsed.success) {
    return { kind: 'valid', contact: parsed.data };
  }
  return { kind: 'invalid', reason: reasonOf(parsed.error) };
}

type Records =
  | { readonly ok: true; readonly records: ReturnType<typeof recordsSchema.safeParse> }
  | { readonly ok: false; readonly cause: unknown };

function parseRecords(text: string): Records {
  try {
    const value: unknown = JSON.parse(text);
    return { ok: true, records: recordsSchema.safeParse(value) };
  } catch (error) {
    return { ok: false, cause: error };
  }
}

export function parseContacts(text: string): ImportResult {
  const parsed = parseRecords(text);
  if (!parsed.ok) {
    return { kind: 'malformed-json' };
  }
  if (!parsed.records.success) {
    return { kind: 'not-an-array' };
  }
  return collectContacts(parsed.records.data.map(toCandidate));
}
