import { handleRequest } from './features/api/index.js';
import { runGreeting } from './features/greeting/index.js';

export function main(names: readonly string[]): void {
  runGreeting(names, { write: (text) => process.stdout.write(text) });
}

export const serve = handleRequest;

export { handleRequest };
