import { existsSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const UTF8_BOM = [0xef, 0xbb, 0xbf];
const UTF16_LE_BOM = [0xff, 0xfe];
const UTF16_BE_BOM = [0xfe, 0xff];

function startsWith(buffer, bytes) {
  return bytes.every((byte, index) => buffer[index] === byte);
}

function decodeText(buffer) {
  if (startsWith(buffer, UTF8_BOM)) {
    return buffer.subarray(UTF8_BOM.length).toString('utf8');
  }
  if (startsWith(buffer, UTF16_LE_BOM)) {
    return new TextDecoder('utf-16le').decode(buffer.subarray(UTF16_LE_BOM.length));
  }
  if (startsWith(buffer, UTF16_BE_BOM)) {
    return new TextDecoder('utf-16be').decode(buffer.subarray(UTF16_BE_BOM.length));
  }
  if (buffer[1] === 0 && buffer[0] > 0) {
    return new TextDecoder('utf-16le').decode(buffer);
  }
  if (buffer[0] === 0 && buffer[1] > 0) {
    return new TextDecoder('utf-16be').decode(buffer);
  }
  return buffer.toString('utf8');
}

/** The text of a file by absolute path, decoding a UTF-8 or UTF-16 byte order mark or UTF-16 without one. */
export function readProjectText(file) {
  return decodeText(readFileSync(file));
}

export function toml() {
  return createRequire(import.meta.url)('smol-toml');
}

export function isDirectory(directory) {
  return existsSync(directory) && statSync(directory).isDirectory();
}

/** The absolute path of a project-relative file, refusing one that leaves the project. */
export function insideProject(projectRoot, file) {
  const root = path.resolve(projectRoot);
  const full = path.resolve(root, file);
  if (full === root) {
    return root;
  }
  if (!full.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${file} is outside the project at ${projectRoot}`);
  }
  return full;
}

/** The text of a project-relative file, or undefined when it does not exist. */
export function readProjectFile(projectRoot, file) {
  const full = insideProject(projectRoot, file);
  return existsSync(full) ? readProjectText(full) : undefined;
}
