import { readFile } from 'node:fs/promises';
import { importContacts } from './features/contacts/index.js';
import { runGreeting } from './features/greeting/index.js';

export function main(names: readonly string[]): void {
  runGreeting(names, { write: (text) => process.stdout.write(text) });
}

export async function importContactsMain(path: string): Promise<void> {
  await importContacts(path, (file) => readFile(file, 'utf8'), {
    write: (text) => process.stdout.write(text),
  });
}
