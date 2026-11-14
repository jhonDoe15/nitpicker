import { printSettings, resolveSettings } from './features/settings/index.js';

const writer = { write: (chunk: string) => process.stdout.write(chunk) };

export function main(text: string): void {
  printSettings(text, writer);
}

export function resolveMain(entry: string, sources: ReadonlyMap<string, string>): void {
  writer.write(`${JSON.stringify(resolveSettings(entry, sources))}\n`);
}
