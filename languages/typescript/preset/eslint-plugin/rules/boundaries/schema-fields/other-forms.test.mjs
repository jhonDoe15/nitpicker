import { RuleTester } from 'eslint';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import tseslint from 'typescript-eslint';
import { applyJavascriptDialect } from '../../../../../../javascript/preset/eslint-dialect.mjs';
import { strictPresetConfig } from '../../../../eslint-config/strict.mjs';
import { defaultResolvedLayout } from '../../../../layout.mjs';
import { rule } from '../no-unvalidated-schema-field.mjs';

RuleTester.afterAll = afterAll;

RuleTester.afterEach = afterEach;

RuleTester.beforeAll = beforeAll;

RuleTester.beforeEach = beforeEach;

RuleTester.describe = describe;

RuleTester.it = it;

RuleTester.itOnly = it.only;

const typescript = new RuleTester({
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module', parser: tseslint.parser },
});

const javascript = new RuleTester({
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
});

const commonJs = new RuleTester({
  languageOptions: { ecmaVersion: 'latest', sourceType: 'commonjs' },
});

const field = { messageId: 'unvalidatedField' };
const loose = { messageId: 'looseObject' };
const ajv = "import Ajv from 'ajv'; const ajv = new Ajv();";

typescript.run('no-unvalidated-schema-field ajv', rule, {
  valid: [
    `${ajv} const check = ajv.compile({ type: 'object', properties: { a: { type: 'string' } }, additionalProperties: false });`,
    `${ajv} const check = ajv.compile({ type: 'object', properties: { a: { type: 'string', minLength: 1 } } });`,
    "const check = validator.compile({ type: 'object', properties: { a: {} } });",
    `${ajv} const check = ajv.compile({});`,
  ],
  invalid: [
    {
      code: `${ajv} const check = ajv.compile({ type: 'object', properties: { a: {}, b: true, c: { type: 'string' } } });`,
      errors: [field, field],
    },
    {
      code: `${ajv} const schema = { type: 'object', properties: { a: { type: 'string' } }, additionalProperties: true } as const; const check = ajv.compile(schema);`,
      errors: [loose],
    },
    {
      code: `${ajv} const ok = ajv.validate({ type: 'array', items: { type: 'object', properties: { id: {} } } }, data);`,
      errors: [field],
    },
    {
      code: "import { ajv } from './validation'; const check = ajv.compile({ type: 'object', properties: { a: { type: 'string' } }, additionalProperties: {} });",
      errors: [loose],
    },
  ],
});

typescript.run('no-unvalidated-schema-field class-validator', rule, {
  valid: [
    "import { IsOptional, IsString } from 'class-validator'; class Dto { @IsOptional() @IsString() name?: string; }",
    "import { IsOptional } from 'class-validator'; import { IsSlug } from './validators'; class Dto { @IsOptional() @IsSlug() slug?: string; }",
    'class Dto { name?: string; }',
    "import { ApiProperty } from '@nestjs/swagger'; class Dto { @ApiProperty() name?: string; }",
  ],
  invalid: [
    {
      code: "import { Allow } from 'class-validator'; class Dto { @Allow() payload: unknown; }",
      errors: [
        {
          ...field,
          data: { factory: '@Allow() alone', example: '@IsString() @MinLength(1) or @IsEmail()' },
        },
      ],
    },
    {
      code: "import { IsOptional } from 'class-validator'; import { ApiProperty } from '@nestjs/swagger'; class Dto { @ApiProperty() @IsOptional() meta?: Meta; }",
      errors: [field],
    },
    {
      code: "import * as validator from 'class-validator'; class Dto { @validator.IsDefined() value: unknown; }",
      errors: [field],
    },
  ],
});

typescript.run('no-unvalidated-schema-field typia', rule, {
  valid: [
    "import typia from 'typia'; const user = typia.assert<{ name: string }>(input);",
    "import typia from 'typia'; const text = typia.json.stringify<{ meta: unknown }>(value);",
    "import typia from 'typia'; const items = typia.assert<unknown[]>(input);",
  ],
  invalid: [
    {
      code: "import typia from 'typia'; const user = typia.assert<{ name: string; meta: unknown; tags: any[] }>(input);",
      errors: [field, field],
    },
    {
      code: "import typia from 'typia'; interface User { inner: { extra: Record<string, unknown> } } const check = typia.createIs<User>();",
      errors: [field],
    },
    {
      code: "import { assertEquals } from 'typia'; type Event = { payload: unknown | null }; const event = assertEquals<Event>(input);",
      errors: [field],
    },
  ],
});

javascript.run('no-unvalidated-schema-field in JavaScript', rule, {
  valid: [
    "import { z } from 'zod'; export const schema = z.object({ name: z.string().min(1) });",
    "import * as v from 'valibot'; export const schema = v.object({ name: v.string() });",
  ],
  invalid: [
    {
      code: "import { z } from 'zod'; export const schema = z.object({ name: z.unknown() }).passthrough();",
      errors: [loose, field],
    },
    {
      code: "import * as v from 'valibot'; export const schema = v.object({ name: v.any() });",
      errors: [field],
    },
    {
      code: "import Joi from 'joi'; export const schema = Joi.object({ name: Joi.any() }).unknown();",
      errors: [loose, field],
    },
  ],
});

commonJs.run('no-unvalidated-schema-field with require', rule, {
  valid: ["const Joi = require('joi'); module.exports = Joi.object({ a: Joi.string() });"],
  invalid: [
    {
      code: "const Joi = require('joi'); module.exports = Joi.object({ a: Joi.any() });",
      errors: [field],
    },
    {
      code: "const { object, any } = require('superstruct'); module.exports = object({ a: any() });",
      errors: [field],
    },
    {
      code: "const { Type } = require('@sinclair/typebox'); module.exports = Type.Object({ a: Type.Unknown() });",
      errors: [field],
    },
  ],
});

describe('the presets that run no-unvalidated-schema-field', () => {
  const ruleId = 'nitpicker/no-unvalidated-schema-field';
  const productionFiles = (entries) =>
    entries.filter((entry) => entry.rules?.[ruleId] === 'error').flatMap((entry) => entry.files);

  it('runs on TypeScript production code in the default TypeScript preset', () => {
    const files = productionFiles(strictPresetConfig(defaultResolvedLayout, {}));
    expect(files.some((glob) => String(glob).includes('ts,'))).toBe(true);
  });

  it('runs on JavaScript production code in the JavaScript preset', () => {
    const entries = applyJavascriptDialect(strictPresetConfig(defaultResolvedLayout, {}), {
      preset: 'javascript',
    });
    expect(productionFiles(entries).some((glob) => String(glob).includes('mjs,cjs'))).toBe(true);
  });
});
