import { runGreeting } from './features/greeting/index.js';
import { createBatchUploader } from './features/uploads/index.js';

export function main(names: readonly string[]): void {
  runGreeting(names, { write: (text) => process.stdout.write(text) });
}

const writer = { write: (text: string) => process.stdout.write(text) };

export const uploader = createBatchUploader({
  upload: (batch) => {
    writer.write(`${JSON.stringify(batch)}\n`);
    return Promise.resolve();
  },
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => Date.now(),
});
