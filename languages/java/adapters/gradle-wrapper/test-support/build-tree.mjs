import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const depth = Number(process.argv[2] ?? 0);
  const exitOnTerm = process.argv[3] === 'exit';
  process.on('SIGTERM', () => {
    if (depth === 0 && exitOnTerm) {
      process.exit(0);
    }
  });
  console.log(process.pid);
  if (depth < 2) {
    spawn(process.execPath, [import.meta.filename, String(depth + 1)], { stdio: 'inherit' });
  }
  setInterval(() => {}, 1_000);
}
