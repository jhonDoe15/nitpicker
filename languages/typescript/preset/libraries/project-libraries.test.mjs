import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveHeadPolicy, withHeadCheckoutFacts } from '../head-policy.mjs';
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
      packages: {
        '.': {
          production: { validation: ['valibot'], logger: ['winston'] },
          development: { validation: ['zod', 'yup'], logger: ['pino'] },
        },
      },
    });
  });

  it('finds nothing in a project without a manifest', () => {
    expect(detectLibraries(path.join(tmpdir(), 'nitpicker-no-such-project'))).toEqual({
      validation: [],
      logger: [],
      packages: {},
    });
  });

  it('puts the detected libraries into the head policy of a TypeScript project', () => {
    const root = projectWith({ '.': { dependencies: { joi: '17.0.0', pino: '9.0.0' } } });

    expect(resolveHeadPolicy({}, root).libraries).toEqual({
      validation: ['joi'],
      logger: ['pino'],
      packages: {
        '.': {
          production: { validation: ['joi'], logger: ['pino'] },
          development: { validation: [], logger: [] },
        },
      },
    });
  });
});

describe('libraries of the base run', () => {
  it('takes the libraries of every package from the head checkout', () => {
    const root = projectWith({
      '.': { dependencies: { joi: '17.0.0' } },
      'packages/api': { dependencies: { valibot: '1.0.0' } },
    });
    const head = resolveHeadPolicy({}, root);
    const base = withHeadCheckoutFacts({ libraries: { validation: [], logger: [] } }, head);

    expect(base.libraries).toEqual(head.libraries);
    expect(Object.keys(base.libraries.packages)).toEqual(['.', 'packages/api']);
  });

  it('takes the colocated test placement of a checkout without test roots', () => {
    const head = resolveHeadPolicy({}, projectWith({ '.': {} }));
    const base = withHeadCheckoutFacts({ layout: { sourceRoots: ['lib'] } }, head);

    expect(base.layout).toEqual({ sourceRoots: ['lib'], colocatedTests: true });
    expect(withHeadCheckoutFacts({ layout: {} }, { layout: {} }).layout).toEqual({});
  });
});

describe('libraries of the manifest nearest a file', () => {
  const fallback = { validation: ['zod'], logger: [] };
  const monorepo = {
    '.': { dependencies: { joi: '17.0.0' } },
    'packages/api': { dependencies: { valibot: '1.0.0' }, devDependencies: { yup: '1.0.0' } },
    'packages/api/src': {},
    'packages/node_modules/dep': { dependencies: { arktype: '2.0.0' } },
    'dist/lib': { dependencies: { zod: '4.0.0' } },
  };

  it('lists the nearest package first, then the ones above it up to the root', () => {
    const root = projectWith(monorepo);
    const libraries = detectLibraries(root, (file) => file.startsWith('dist/'));
    const file = path.join(root, 'packages/api/src/handler.ts');

    expect(librariesForFile({ filename: file, cwd: root }, libraries)).toEqual({
      validation: ['valibot', 'joi', 'yup'],
      logger: [],
    });
  });

  it('records every package directory that declares libraries, except dependencies and excluded folders', () => {
    const root = projectWith(monorepo);

    expect(Object.keys(detectLibraries(root, (file) => file.startsWith('dist/')).packages)).toEqual(
      ['.', 'packages/api'],
    );
  });

  it('reads the root manifest for a file at the root', () => {
    const root = projectWith({ '.': { dependencies: { arktype: '2.0.0' } } });
    const filename = path.join(root, 'index.ts');

    expect(librariesForFile({ filename, cwd: root }, detectLibraries(root))).toEqual({
      validation: ['arktype'],
      logger: [],
    });
  });

  it('uses the policy libraries for a file outside the project or a relative file name', () => {
    const root = projectWith({ '.': { dependencies: { arktype: '2.0.0' } } });
    const libraries = { ...fallback, packages: detectLibraries(root).packages };

    expect(librariesForFile({ filename: '/elsewhere/x.ts', cwd: root }, libraries)).toBe(libraries);
    expect(librariesForFile({ filename: '<input>', cwd: root }, libraries)).toBe(libraries);
  });

  it('uses the policy libraries when the policy lists no packages', () => {
    const filename = path.join(tmpdir(), 'x.ts');

    expect(librariesForFile({ filename, cwd: tmpdir() }, fallback)).toBe(fallback);
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
