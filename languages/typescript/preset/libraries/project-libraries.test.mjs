import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveHeadPolicy } from '../head-policy.mjs';
import { librariesForFile } from './file-libraries.mjs';
import { detectLibraries, loggerShapes, validationBehavior } from './project-libraries.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function projectWith(manifests) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-libraries-'));
  roots.push(root);
  for (const [directory, manifest] of Object.entries(manifests)) {
    mkdirSync(path.join(root, directory), { recursive: true });
    writeFileSync(path.join(root, directory, 'package.json'), JSON.stringify(manifest));
  }
  return root;
}

describe('library detection', () => {
  it('reads validation and logger libraries from the manifest, dependencies first', () => {
    const root = projectWith({
      '.': {
        dependencies: { valibot: '1.0.0', winston: '3.0.0' },
        devDependencies: { zod: '4.0.0', pino: '9.0.0', yup: '1.0.0' },
      },
    });

    expect(detectLibraries(root)).toEqual({
      validation: ['valibot', 'zod', 'yup'],
      logger: ['winston', 'pino'],
    });
  });

  it('finds nothing in a project without a manifest', () => {
    expect(detectLibraries(path.join(tmpdir(), 'nitpicker-no-such-project'))).toEqual({
      validation: [],
      logger: [],
    });
  });

  it('puts the detected libraries into the head policy of a TypeScript project', () => {
    const root = projectWith({ '.': { dependencies: { joi: '17.0.0', pino: '9.0.0' } } });

    expect(resolveHeadPolicy({}, root).libraries).toEqual({
      validation: ['joi'],
      logger: ['pino'],
    });
  });
});

describe('libraries of the manifest nearest a file', () => {
  const fallback = { validation: ['zod'], logger: [] };

  it('lists the nearest package first, then the ones above it up to the root', () => {
    const root = projectWith({
      '.': { dependencies: { joi: '17.0.0' } },
      'packages/api': { dependencies: { valibot: '1.0.0' }, devDependencies: { yup: '1.0.0' } },
      'packages/api/src': {},
    });
    const file = path.join(root, 'packages/api/src/handler.ts');

    expect(librariesForFile(file, fallback, root)).toEqual({
      validation: ['valibot', 'joi', 'yup'],
      logger: [],
    });
  });

  it('reads the root manifest for a file at the root', () => {
    const root = projectWith({ '.': { dependencies: { arktype: '2.0.0' } } });

    expect(librariesForFile(path.join(root, 'index.ts'), fallback, root)).toEqual({
      validation: ['arktype'],
      logger: [],
    });
  });

  it('uses the policy libraries for a file outside the project or a relative file name', () => {
    const root = projectWith({ '.': { dependencies: { arktype: '2.0.0' } } });

    expect(librariesForFile('/elsewhere/x.ts', fallback, root)).toBe(fallback);
    expect(librariesForFile('<input>', fallback, root)).toBe(fallback);
  });
});

describe('validation behavior', () => {
  it('falls back to zod when no validation library is detected', () => {
    expect(validationBehavior(undefined).name).toBe('zod');
    expect(validationBehavior({ validation: [] }).name).toBe('zod');
  });

  it('names the first detected library and accepts all of them', () => {
    const behavior = validationBehavior({ validation: ['yup', 'zod'] });

    expect([behavior.name, behavior.accepted.map(({ id }) => id)]).toEqual(['yup', ['yup', 'zod']]);
  });
});

describe('logger error shapes', () => {
  it.each([
    [undefined, ['err-field']],
    [{ logger: [] }, ['err-field']],
    [{ logger: ['pino'] }, ['err-field']],
    [{ logger: ['bunyan', 'pino'] }, ['err-field']],
    [{ logger: ['winston'] }, ['caught-value']],
    [{ logger: ['pino', 'winston'] }, ['err-field', 'caught-value']],
    [{ logger: ['winston', 'pino'] }, ['caught-value', 'err-field']],
  ])('for %j the shapes are %j', (libraries, shapes) => {
    expect(loggerShapes(libraries)).toEqual(shapes);
  });
});
