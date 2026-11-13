import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isPlainObject } from '../../../../../shared/config.mjs';
import { fieldsOf } from '../../../../../shared/values/readers.mts';
import { parsedJsonc as untypedParsedJsonc } from '../../../../../shared/jsonc/jsonc.mjs';

type ParsedJsonc = { readonly kind: string; readonly value?: unknown; readonly reason?: string };

const parsedJsonc: (text: string) => ParsedJsonc = untypedParsedJsonc;

const KNIP_KEY = 'knip';
const MANIFEST = 'package.json';

function filePathOf(file: unknown): string | undefined {
  if (file instanceof URL) {
    return fileURLToPath(file);
  }
  return typeof file === 'string' ? file : undefined;
}

function realPathOf(file: string): string {
  const resolved = path.resolve(file);
  return fs.existsSync(resolved) ? fs.realpathSync.native(resolved) : resolved;
}

function withoutKnipKey(contents: unknown, manifestPath: string): unknown {
  const text = String(contents);
  const parsed = parsedJsonc(text);
  if (parsed.kind !== 'json') {
    if (text.includes(JSON.stringify(KNIP_KEY))) {
      throw new Error(
        `${manifestPath} does not parse, so its "${KNIP_KEY}" key cannot be left out: ${String(parsed.reason)}`,
      );
    }
    return contents;
  }
  const manifest = fieldsOf(parsed.value);
  if (!isPlainObject(parsed.value) || !Object.hasOwn(manifest, KNIP_KEY)) {
    return contents;
  }
  const kept = JSON.stringify(
    Object.fromEntries(Object.entries(manifest).filter(([key]) => key !== KNIP_KEY)),
  );
  return typeof contents === 'string' ? kept : Buffer.from(kept);
}

function isGuarded(file: unknown, target: string): boolean {
  const filePath = filePathOf(file);
  return (
    filePath !== undefined &&
    path.basename(filePath) === MANIFEST &&
    realPathOf(filePath) === target
  );
}

export function guardKnipManifest(manifestPath: string): () => void {
  const target = realPathOf(manifestPath);
  const readFile = fs.promises.readFile;
  Reflect.set(fs.promises, 'readFile', async (file: unknown, ...rest: readonly unknown[]) => {
    const contents: unknown = await Reflect.apply(readFile, fs.promises, [file, ...rest]);
    return isGuarded(file, target) ? withoutKnipKey(contents, target) : contents;
  });
  syncBuiltinESMExports();
  return () => {
    fs.promises.readFile = readFile;
    syncBuiltinESMExports();
  };
}
