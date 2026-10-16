import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveHeadPolicy } from '../head-policy.mjs';
import {
  appliesPinoErrorShape,
  detectLibraries,
  validationBehavior,
} from './project-libraries.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function projectWith(manifest) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-libraries-'));
  roots.push(root);
  mkdirSync(root, { recursive: true });
  writeFileSync(path.join(root, 'package.json'), JSON.stringify(manifest));
  return root;
}

describe('library detection', () => {
  it('reads validation and logger libraries from dependencies and devDependencies', () => {
    const root = projectWith({
      dependencies: { valibot: '1.0.0', winston: '3.0.0' },
      devDependencies: { yup: '1.0.0' },
    });

    expect(detectLibraries(root)).toEqual({ validation: ['valibot', 'yup'], logger: ['winston'] });
  });

  it('finds nothing in a project without a manifest', () => {
    expect(detectLibraries(path.join(tmpdir(), 'nitpicker-no-such-project'))).toEqual({
      validation: [],
      logger: [],
    });
  });

  it('puts the detected libraries into the head policy of a TypeScript project', () => {
    const root = projectWith({ dependencies: { joi: '17.0.0', pino: '9.0.0' } });

    expect(resolveHeadPolicy({}, root).libraries).toEqual({
      validation: ['joi'],
      logger: ['pino'],
    });
  });
});

describe('validation behavior', () => {
  it('falls back to zod when no validation library is detected', () => {
    expect(validationBehavior(undefined).name).toBe('zod');
    expect(validationBehavior({ validation: [] }).name).toBe('zod');
  });

  it('names zod first when it is one of several libraries', () => {
    const behavior = validationBehavior({ validation: ['yup', 'zod'] });

    expect([
      behavior.name,
      behavior.methods.has('validateSync'),
      behavior.methods.has('parse'),
    ]).toEqual(['zod', true, true]);
  });

  it('accepts only the detected library methods', () => {
    const behavior = validationBehavior({ validation: ['yup'] });

    expect([behavior.methods.has('validateSync'), behavior.methods.has('parse')]).toEqual([
      true,
      false,
    ]);
  });
});

describe('logger error shape', () => {
  it.each([
    [undefined, true],
    [{ logger: [] }, true],
    [{ logger: ['pino'] }, true],
    [{ logger: ['bunyan'] }, true],
    [{ logger: ['winston'] }, false],
    [{ logger: ['consola', 'pino'] }, true],
  ])('for %j the Pino shape applies: %s', (libraries, applies) => {
    expect(appliesPinoErrorShape(libraries)).toBe(applies);
  });
});
