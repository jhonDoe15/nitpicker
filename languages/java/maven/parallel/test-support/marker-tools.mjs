import { writeFileSync } from 'node:fs';

export function writeMarker({ file, text }) {
  writeFileSync(file, text);
}

export function failWith({ message }) {
  throw Object.assign(new Error(message), { tool: 'marker' });
}
