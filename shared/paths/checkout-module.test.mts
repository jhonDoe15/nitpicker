import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkoutModulePath, checkoutModuleUrl } from './checkout-module.mjs';

describe('checkout modules', () => {
  let directory: string;

  beforeAll(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'nitpicker-checkout-module-'));
    writeFileSync(path.join(directory, 'converted.mts'), '');
    writeFileSync(path.join(directory, 'packaged.mjs'), '');
    writeFileSync(path.join(directory, 'emitted.mts'), '');
    writeFileSync(path.join(directory, 'emitted.mjs'), '');
  });

  afterAll(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it.each([
    [
      'opens the TypeScript source of a module that a checkout holds as .mts',
      'converted.mjs',
      'converted.mts',
    ],
    [
      'keeps the packaged name when no TypeScript source sits beside it',
      'packaged.mjs',
      'packaged.mjs',
    ],
    ['leaves files that are not ES modules alone', 'rules.json', 'rules.json'],
  ])('%s', (_name, file, opened) => {
    expect(checkoutModulePath(path.join(directory, file), { stripsTypes: true })).toBe(
      path.join(directory, opened),
    );
  });
  it('maps a module URL the same way', () => {
    const converted = pathToFileURL(path.join(directory, 'converted.mjs'));
    expect(checkoutModuleUrl(converted, { stripsTypes: true }).href).toBe(
      pathToFileURL(path.join(directory, 'converted.mts')).href,
    );
    const emitted = pathToFileURL(path.join(directory, 'emitted.mjs'));
    expect(checkoutModuleUrl(emitted, { stripsTypes: false }).href).toBe(emitted.href);
  });
  it('opens the emitted JavaScript where Node.js cannot strip types, as in the package build', () => {
    const emitted = path.join(directory, 'emitted.mjs');
    expect(checkoutModulePath(emitted, { stripsTypes: false })).toBe(emitted);
    expect(checkoutModulePath(emitted, { stripsTypes: true })).toBe(
      path.join(directory, 'emitted.mts'),
    );
    const converted = path.join(directory, 'converted.mjs');
    expect(checkoutModulePath(converted, { stripsTypes: false })).toBe(
      path.join(directory, 'converted.mts'),
    );
  });
});
