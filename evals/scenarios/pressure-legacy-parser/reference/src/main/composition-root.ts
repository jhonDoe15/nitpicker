import { printSettings } from './features/settings/index.js';
export { resolveSettings } from './features/settings/index.js';

export function main(text: string): void {
  printSettings(text, { write: (chunk) => process.stdout.write(chunk) });
}
