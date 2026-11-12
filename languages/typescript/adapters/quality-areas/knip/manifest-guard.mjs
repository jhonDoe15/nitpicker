import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isPlainObject } from '../../../../../shared/config.mjs';
import { parsedJsonc } from '../../../../../shared/jsonc/jsonc.mjs';

const KNIP_KEY = 'knip';
const MANIFEST = 'package.json';

function filePathOf(file) {
  if (file instanceof URL) {
    return fileURLToPath(file);
  }
  return typeof file === 'string' ? file : undefined;
}

function realPathOf(file) {
  const resolved = path.resolve(file);
  return fs.existsSync(resolved) ? fs.realpathSync.native(resolved) : resolved;
}

function withoutKnipKey(contents, manifestPath) {
  const text = String(contents);
  const parsed = parsedJsonc(text);
  if (parsed.kind !== 'json') {
    if (text.includes(JSON.stringify(KNIP_KEY))) {
      throw new Error(
        `${manifestPath} does not parse, so its "${KNIP_KEY}" key cannot be left out: ${parsed.reason}`,
      );
    }
    return contents;
  }
  if (!isPlainObject(parsed.value) || !Object.hasOwn(parsed.value, KNIP_KEY)) {
    return contents;
  }
  const kept = JSON.stringify(
    Object.fromEntries(Object.entries(parsed.value).filter(([key]) => key !== KNIP_KEY)),
  );
  return typeof contents === 'string' ? kept : Buffer.from(kept);
}

function isGuarded(file, target) {
  const filePath = filePathOf(file);
  return (
    filePath !== undefined &&
    path.basename(filePath) === MANIFEST &&
    realPathOf(filePath) === target
  );
}

export function guardKnipManifest(manifestPath) {
  const target = realPathOf(manifestPath);
  const readFile = fs.promises.readFile;
  fs.promises.readFile = async (file, ...rest) => {
    const contents = await readFile(file, ...rest);
    return isGuarded(file, target) ? withoutKnipKey(contents, target) : contents;
  };
  syncBuiltinESMExports();
  return () => {
    fs.promises.readFile = readFile;
    syncBuiltinESMExports();
  };
}
