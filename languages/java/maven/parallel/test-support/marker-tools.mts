import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const SHELL_TIMEOUT_MS = 10_000;

export function writeMarker({
  file,
  text,
}: {
  readonly file: string;
  readonly text: string;
}): void {
  writeFileSync(file, text);
}

export function failWith({ message }: { readonly message: string }): never {
  throw new Error(message);
}

export function writeJavaOptions({ file }: { readonly file: string }): void {
  execFileSync('sh', ['-c', 'printf %s "$JDK_JAVA_OPTIONS" > "$1"', 'sh', file], {
    timeout: SHELL_TIMEOUT_MS,
  });
}
