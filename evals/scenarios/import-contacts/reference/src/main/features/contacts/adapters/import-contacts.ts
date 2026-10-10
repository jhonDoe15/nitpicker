import type { ImportResult } from '../domain/collect-contacts.js';
import { describeImport } from '../domain/describe-import.js';
import { parseContacts } from './parse-contacts.js';

type ReadText = (path: string) => Promise<string>;
type Writer = { readonly write: (text: string) => void };
type Read =
  { readonly ok: true; readonly text: string } | { readonly ok: false; readonly message: string };

async function attemptRead(path: string, readText: ReadText): Promise<Read> {
  try {
    return { ok: true, text: await readText(path) };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

async function load(path: string, readText: ReadText): Promise<ImportResult> {
  const read = await attemptRead(path, readText);
  if (!read.ok) {
    return { kind: 'read-failed', message: read.message };
  }
  return parseContacts(read.text);
}

export async function importContacts(
  path: string,
  readText: ReadText,
  writer: Writer,
): Promise<ImportResult> {
  const result = await load(path, readText);
  for (const line of describeImport(result, path)) {
    writer.write(`${line}\n`);
  }
  return result;
}
