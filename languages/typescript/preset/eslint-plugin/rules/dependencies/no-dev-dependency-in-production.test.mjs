import { RuleTester } from 'eslint';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import tseslint from 'typescript-eslint';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { rule } from './no-dev-dependency-in-production.mjs';
import { packageNameOf } from './package-manifest.mjs';

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

function project(name, manifest) {
  const directory = path.join(root, name);
  mkdirSync(path.join(directory, 'src/main'), { recursive: true });
  if (manifest !== undefined) {
    writeFileSync(path.join(directory, 'package.json'), manifest);
  }
  return path.join(directory, 'src/main/feature.ts');
}

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

const message = (name) => ({ messageId: 'devDependency', data: { name } });

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
    { filename: brokenManifest, code: "import { z } from 'zod';" },
    { filename: nullManifest, code: "import { z } from 'zod';" },
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

describe('the message', () => {
  it('names the allowed form and the exception route', () => {
    expect(rule.meta.messages.devDependency).toBe(
      '{{name}} is only a devDependency, but production code imports it. Move it to "dependencies" in package.json, or add an exception for this rule in nitpicker.config.json.',
    );
  });
});
