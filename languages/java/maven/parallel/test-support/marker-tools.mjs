import { writeFileSync } from 'node:fs';

export function writeMarker({ file, text }) {
  writeFileSync(file, text);
}

export function failWith({ message }) {
  throw new Error(message);
}
