import { RuleTester } from 'eslint';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import tseslint from 'typescript-eslint';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { exceptionHint } from '../../../../../../shared/hygiene/rules.mjs';
import { rule } from './no-dev-dependency-in-production.mjs';
import { packageNameOf } from './package-manifest.mjs';
import { isTestSupportFile } from './test-support.mjs';

RuleTester.afterAll = afterAll;
RuleTester.afterEach = afterEach;
RuleTester.beforeAll = beforeAll;
RuleTester.beforeEach = beforeEach;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-dev-dependency-'));
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

function project(name, manifest, extraFiles = {}) {
  const directory = path.join(root, name);
  mkdirSync(path.join(directory, 'src/main'), { recursive: true });
  if (manifest !== undefined) {
    writeFileSync(path.join(directory, 'package.json'), manifest);
  }
  for (const [file, text] of Object.entries(extraFiles)) {
    mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
    writeFileSync(path.join(directory, file), text);
  }
  return path.join(directory, 'src/main/feature.ts');
}

const inProject = (filename, file) => path.join(path.dirname(filename), file);
const projectPath = (file) => path.relative(process.cwd(), file).split(path.sep).join('/');

const app = project(
  'app',
  JSON.stringify({
    dependencies: { express: '^5.0.0' },
    devDependencies: {
      zod: '^4.0.0',
      vitest: '^4.0.0',
      '@scope/tool': '^1.0.0',
      express: '^5.0.0',
    },
    peerDependencies: { react: '^19.0.0' },
    optionalDependencies: { fsevents: '^2.0.0' },
  }),
);
const appWithRuntimeAndDev = project(
  'both',
  JSON.stringify({
    dependencies: { zod: '^4.0.0' },
    devDependencies: { zod: '^4.0.0' },
  }),
);
const noManifest = project('none');
const brokenManifest = project('broken', '{');
const nullManifest = project('null', 'null');
const arrayManifest = project('array', '[1]');
const viteApp = project('vite-app', JSON.stringify({ devDependencies: { react: '^19.0.0' } }), {
  'vite.config.ts': 'export default {};\n',
});
const scriptedApp = project(
  'scripted-app',
  JSON.stringify({
    scripts: { build: 'tsc -b && vite build' },
    devDependencies: { react: '^19.0.0' },
  }),
);
const angularApp = project('angular-app', JSON.stringify({ devDependencies: { rxjs: '^7.0.0' } }), {
  'angular.json': '{}\n',
});
const viteLibrary = project(
  'vite-library',
  JSON.stringify({ exports: './dist/index.js', devDependencies: { react: '^19.0.0' } }),
  { 'vite.config.ts': 'export default {};\n' },
);
const nonBundlerBuild = project(
  'tsc-build',
  JSON.stringify({ scripts: { build: 'tsc -b' }, devDependencies: { react: '^19.0.0' } }),
);
const nested = project('nested', JSON.stringify({ devDependencies: { zod: '^4.0.0' } }), {
  'src/main/esm/package.json': JSON.stringify({ type: 'module' }),
});
const nestedFile = inProject(nested, 'esm/feature.ts');

const message = (name, filename = app) => ({
  messageId: 'devDependency',
  data: {
    name,
    hint: exceptionHint('nitpicker/no-dev-dependency-in-production', projectPath(filename)),
  },
});
const unreadable = (filename) => ({
  messageId: 'unreadableManifest',
  data: { manifest: projectPath(path.join(filename, '../../../package.json')) },
});

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module', parser: tseslint.parser },
});

ruleTester.run('no-dev-dependency-in-production', rule, {
  valid: [
    { filename: app, code: "import express from 'express';" },
    { filename: app, code: "import { useState } from 'react';" },
    { filename: app, code: "import { join } from 'node:path';" },
    { filename: app, code: "import { join } from 'path';" },
    { filename: app, code: "import { helper } from './helper.js';" },
    { filename: app, code: "import { helper } from '../helper.js';" },
    { filename: app, code: "import { helper } from '#internal/helper';" },
    { filename: app, code: "import type { ZodType } from 'zod';" },
    { filename: app, code: "import { type ZodType } from 'zod';" },
    { filename: app, code: "export type { ZodType } from 'zod';" },
    { filename: app, code: "import 'unknown-side-effect';" },
    { filename: app, code: 'const name = pick(); await import(name);' },
    { filename: app, code: 'const load = require(name);' },
    { filename: app, code: 'const value = other("zod");' },
    { filename: app, code: "import fsevents from 'fsevents';" },
    { filename: appWithRuntimeAndDev, code: "import { z } from 'zod';" },
    { filename: noManifest, code: "import { z } from 'zod';" },
    { filename: viteApp, code: "import { useState } from 'react';" },
    { filename: scriptedApp, code: "import { useState } from 'react';" },
    { filename: angularApp, code: "import { of } from 'rxjs';" },
    { filename: inProject(app, '../setupTests.ts'), code: "import 'vitest';" },
    { filename: inProject(app, '__mocks__/api.ts'), code: "import { vi } from 'vitest';" },
    { filename: inProject(app, 'Button.stories.tsx'), code: "import { z } from 'zod';" },
    { filename: inProject(app, '../testing/render.ts'), code: "import { z } from 'zod';" },
    { filename: inProject(app, '../test-support/render.ts'), code: "import { z } from 'zod';" },
  ],
  invalid: [
    { filename: app, code: "import { z } from 'zod';", errors: [message('zod')] },
    { filename: app, code: "import { z } from 'zod/v4';", errors: [message('zod')] },
    {
      filename: app,
      code: "import tool from '@scope/tool/dist/index.js';",
      errors: [message('@scope/tool')],
    },
    { filename: app, code: "import { type A, b } from 'zod';", errors: [message('zod')] },
    { filename: app, code: "import 'vitest';", errors: [message('vitest')] },
    { filename: app, code: "export { z } from 'zod';", errors: [message('zod')] },
    { filename: app, code: "export * from 'zod';", errors: [message('zod')] },
    { filename: app, code: "const { z } = await import('zod');", errors: [message('zod')] },
    { filename: app, code: "const { z } = require('zod');", errors: [message('zod')] },
    {
      filename: viteLibrary,
      code: "import { useState } from 'react';",
      errors: [message('react', viteLibrary)],
    },
    {
      filename: nonBundlerBuild,
      code: "import { useState } from 'react';",
      errors: [message('react', nonBundlerBuild)],
    },
    {
      filename: nestedFile,
      code: "import { z } from 'zod';",
      errors: [message('zod', nestedFile)],
    },
    {
      filename: brokenManifest,
      code: "import { z } from 'zod';",
      errors: [unreadable(brokenManifest)],
    },
    { filename: nullManifest, code: 'export {};', errors: [unreadable(nullManifest)] },
    { filename: arrayManifest, code: 'export {};', errors: [unreadable(arrayManifest)] },
  ],
});

describe('packageNameOf', () => {
  it('names the package behind a specifier and ignores local and built-in ones', () => {
    expect(packageNameOf('zod')).toBe('zod');
    expect(packageNameOf('zod/v4')).toBe('zod');
    expect(packageNameOf('@scope/tool/dist/x.js')).toBe('@scope/tool');
    expect(packageNameOf('./local')).toBeUndefined();
    expect(packageNameOf('../up')).toBeUndefined();
    expect(packageNameOf('/absolute')).toBeUndefined();
    expect(packageNameOf('#alias')).toBeUndefined();
    expect(packageNameOf('node:fs')).toBeUndefined();
  });
});

describe('isTestSupportFile', () => {
  it('knows the test helpers, mocks and stories that live next to production code', () => {
    const paths = [
      'src/setupTests.ts',
      'src/setup-tests.js',
      'src/vitest.setup.ts',
      'src/test-utils.tsx',
      'src/testUtils.ts',
      'src/test-utils/render.tsx',
      'src/testing/render.ts',
      'src/test-support/render.ts',
      'src/__mocks__/api.ts',
      'src/main/ui/Button.stories.tsx',
      '.storybook/preview.ts',
      'src/main/ui/Button.tsx',
      'src/main/testimonials/list.ts',
      'src/main/setup.ts',
    ];

    expect(paths.filter((file) => isTestSupportFile(file))).toEqual(paths.slice(0, 11));
  });
});

describe('the messages', () => {
  it('name the allowed form and print the exception entry', () => {
    expect(rule.meta.messages).toEqual({
      devDependency:
        '{{name}} is only a devDependency, but production code imports it. Move it to "dependencies" in package.json. {{hint}}',
      unreadableManifest:
        '{{manifest}} is not a JSON object, so imports cannot be checked against its dependencies. Fix the file.',
    });
    expect(exceptionHint('nitpicker/no-dev-dependency-in-production', 'src/main/a.ts')).toBe(
      'If this is intended, add {"rule":"nitpicker/no-dev-dependency-in-production","paths":["src/main/a.ts"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
    );
  });
});
