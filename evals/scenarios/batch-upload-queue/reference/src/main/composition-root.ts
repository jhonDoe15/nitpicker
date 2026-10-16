import { runGreeting } from './features/greeting/index.js';
export { createBatchUploader } from './features/uploads/index.js';

export function main(names: readonly string[]): void {
  runGreeting(names, { write: (text) => process.stdout.write(text) });
}
