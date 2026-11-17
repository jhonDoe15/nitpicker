import { writeFileSync } from 'node:fs';

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
  writeFileSync(file, process.env['JDK_JAVA_OPTIONS'] ?? '');
}
