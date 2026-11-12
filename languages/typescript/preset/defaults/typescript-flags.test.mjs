import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { resolveLayout } from '../layout.mjs';
import { layoutTransformFor } from '../tool-configs.mjs';

const FLAGS = [
  'exactOptionalPropertyTypes',
  'noPropertyAccessFromIndexSignature',
  'noUncheckedSideEffectImports',
];
const shippedQuality = readFileSync(
  path.join(import.meta.dirname, 'tsconfig.quality.json'),
  'utf8',
);
const shippedStryker = readFileSync(
  path.join(import.meta.dirname, 'tsconfig.stryker.json'),
  'utf8',
);
const javascriptLayout = resolveLayout({}, [], { javascript: true });
const roots = [];

afterAll(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function typeCheckConfig(layout, { withProjectConfig }) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-flags-'));
  roots.push(root);
  if (withProjectConfig) {
    writeFileSync(path.join(root, 'tsconfig.json'), '{}');
  }
  const transform = layoutTransformFor('tsconfig.quality.json', layout);
  return JSON.parse(transform(shippedQuality, path.join(root, '.nitpicker-x.json')))
    .compilerOptions;
}

describe('TypeScript-only compiler flags of the type check', () => {
  it('ship in the default tsconfig', () => {
    const { compilerOptions } = JSON.parse(shippedQuality);

    expect(FLAGS.map((flag) => compilerOptions[flag])).toEqual([true, true, true]);
  });

  it('sit on top of the project tsconfig', () => {
    const options = typeCheckConfig(resolveLayout(), { withProjectConfig: true });

    expect(FLAGS.map((flag) => options[flag])).toEqual([true, true, true]);
  });

  it('are off for a JavaScript project, with or without its own tsconfig', () => {
    const flagValues = [true, false].map((withProjectConfig) => {
      const options = typeCheckConfig(javascriptLayout, { withProjectConfig });
      return FLAGS.map((flag) => options[flag] ?? false);
    });

    expect(flagValues).toEqual([
      [false, false, false],
      [false, false, false],
    ]);
  });

  it('are not part of the mutation tsconfig', () => {
    const { compilerOptions } = JSON.parse(shippedStryker);

    expect(FLAGS.map((flag) => flag in compilerOptions)).toEqual([false, false, false]);
  });
});
