import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import path from 'node:path';

export const KNIP_MANIFEST_ENVIRONMENT = 'NITPICKER_KNIP_MANIFEST';

const KNIP_KEY = 'knip';
const BYTE_ORDER_MARK = /^﻿/u;

function withoutKnipKey(contents) {
  try {
    const manifest = JSON.parse(String(contents).replace(BYTE_ORDER_MARK, ''));
    if (manifest === null || typeof manifest !== 'object' || !Object.hasOwn(manifest, KNIP_KEY)) {
      return contents;
    }
    const text = JSON.stringify(
      Object.fromEntries(Object.entries(manifest).filter(([key]) => key !== KNIP_KEY)),
    );
    return typeof contents === 'string' ? text : Buffer.from(text);
  } catch {
    return contents;
  }
}

function guardKnipManifest(manifestPath) {
  const target = path.resolve(manifestPath);
  const readFile = fs.promises.readFile;
  fs.promises.readFile = async (file, ...rest) => {
    const contents = await readFile(file, ...rest);
    return typeof file === 'string' && path.resolve(file) === target
      ? withoutKnipKey(contents)
      : contents;
  };
  syncBuiltinESMExports();
}

const manifestPath = process.env[KNIP_MANIFEST_ENVIRONMENT];

if (manifestPath !== undefined && manifestPath.length > 0) {
  guardKnipManifest(manifestPath);
}
