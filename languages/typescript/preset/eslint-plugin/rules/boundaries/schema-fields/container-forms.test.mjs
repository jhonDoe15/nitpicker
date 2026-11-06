import { RuleTester } from 'eslint';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from 'vitest';
import tseslint from 'typescript-eslint';
import { rule } from '../no-unvalidated-schema-field.mjs';
import { SCHEMA_FORMS } from './schema-forms.mjs';

RuleTester.afterAll = afterAll;

RuleTester.afterEach = afterEach;

RuleTester.beforeAll = beforeAll;

RuleTester.beforeEach = beforeEach;

RuleTester.describe = describe;

RuleTester.it = it;

RuleTester.itOnly = it.only;

const tester = new RuleTester({
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module', parser: tseslint.parser },
});

const field = { messageId: 'unvalidatedField' };
const fields = (count) => Array.from({ length: count }, () => field);
const loose = (id, form) => ({
  messageId: 'looseObject',
  data: { form, allowed: SCHEMA_FORMS[id].allowed },
});
const ajv = "import Ajv from 'ajv'; const ajv = new Ajv();";

tester.run('no-unvalidated-schema-field containers of every library', rule, {
  valid: [],
  invalid: [
    {
      code: "import * as v from 'valibot'; const s = v.object({ a: v.nullish(v.any()), b: v.exactOptional(v.unknown()), c: v.undefinedable(v.any()), d: v.nonOptional(v.any()), e: v.nonNullable(v.any()), f: v.nonNullish(v.any()), g: v.set(v.any()), h: v.map(v.string(), v.any()) });",
      errors: fields(8),
    },
    {
      code: "import * as t from 'io-ts'; const s = t.strict({ a: t.readonlyArray(t.any), b: t.readonly(t.unknown), c: t.tuple([t.string, t.unknown]), d: t.record(t.string, t.any) });",
      errors: fields(4),
    },
    {
      code: "import { any, defaulted, map, nullable, object, record, set, string, tuple } from 'superstruct'; const s = object({ a: set(any()), b: map(string(), any()), c: record(string(), any()), d: tuple([string(), any()]), e: nullable(any()), f: defaulted(any(), 1) });",
      errors: fields(6),
    },
    {
      code: "import { Array, Dictionary, Optional, Partial, Record, String, Tuple, Unknown } from 'runtypes'; const s = Record({ a: Array(Unknown), b: Dictionary(Unknown), c: Tuple(String, Unknown), d: Optional(Unknown) }); const p = Partial({ e: Unknown });",
      errors: fields(5),
    },
    {
      code: "import { Schema } from 'effect'; const s = Schema.Struct({ a: Schema.NonEmptyArray(Schema.Any), b: Schema.Tuple(Schema.String, Schema.Unknown), c: Schema.optionalWith(Schema.Unknown, { exact: true }), d: Schema.NullOr(Schema.Any), e: Schema.UndefinedOr(Schema.Any), f: Schema.NullishOr(Schema.Any), g: Schema.mutable(Schema.Array(Schema.Unknown)) });",
      errors: fields(7),
    },
    {
      code: "import * as v from '@badrap/valita'; const s = v.object({ a: v.record(v.unknown()), b: v.tuple([v.string(), v.unknown()]) });",
      errors: fields(2),
    },
    {
      code: "import { Type } from '@sinclair/typebox'; const s = Type.Object({ a: Type.Tuple([Type.String(), Type.Any()]), b: Type.Readonly(Type.Unknown()), c: Type.ReadonlyOptional(Type.Any()) });",
      errors: fields(3),
    },
    {
      code: "import { z } from 'zod'; const a = Base.safeExtend({ x: z.any() }); const b = Base.augment({ y: z.unknown() });",
      errors: fields(2),
    },
    {
      code: "import Joi from 'joi'; const s = Joi.object({ a: Joi.string() }).append({ b: Joi.any() });",
      errors: fields(1),
    },
  ],
});

tester.run('no-unvalidated-schema-field loose forms name the allowed form', rule, {
  valid: [],
  invalid: [
    {
      code: "import { z } from 'zod'; const s = z.object({ a: z.string() }).passthrough();",
      errors: [loose('zod', '.passthrough()')],
    },
    {
      code: "import * as v from 'valibot'; const s = v.looseObject({ a: v.string() });",
      errors: [loose('valibot', 'v.looseObject()')],
    },
    {
      code: "import Joi from 'joi'; const a = Joi.object().preferences({ allowUnknown: true }); const b = Joi.object().options({ allowUnknown: true });",
      errors: [loose('joi', 'allowUnknown: true'), loose('joi', 'allowUnknown: true')],
    },
    {
      code: "import { Type } from '@sinclair/typebox'; const s = Type.Object({ a: Type.String() }, { additionalProperties: Type.Any() });",
      errors: [loose('typebox', 'additionalProperties: true or an unchecked schema')],
    },
    {
      code: "import { Schema } from 'effect'; const s = Schema.Struct({ a: Schema.String }, Schema.Record({ key: Schema.String, value: Schema.Any }));",
      errors: [loose('effect', 'A Struct index signature of Schema.Unknown or Schema.Any')],
    },
    {
      code: "import * as v from '@badrap/valita'; const s = v.object({ a: v.string() }).rest(v.unknown());",
      errors: [loose('valita', '.rest(v.unknown())')],
    },
  ],
});

tester.run('no-unvalidated-schema-field ajv calls and nesting', rule, {
  valid: [
    "const ajv = makeValidator(); const check = ajv.compile({ type: 'object', additionalProperties: true });",
    `${ajv} const base = { type: 'string' }; const check = ajv.compile({ ...base, properties: { ...shared, a: { ...base } } });`,
  ],
  invalid: [
    {
      code: `${ajv} ajv.addSchema({ type: 'object', patternProperties: { '^x': {} } }); const check = await ajv.compileAsync({ allOf: [{ properties: { a: {} } }] });`,
      errors: [loose('ajv', 'A patternProperties entry of {} or true'), field],
    },
    {
      code: "import Ajv from 'ajv'; const check = new Ajv().compile({ $defs: { item: { type: 'object', additionalProperties: {} } } });",
      errors: [loose('ajv', 'additionalProperties: {}')],
    },
    {
      code: "import Ajv from 'ajv/dist/jtd'; const ajv = new Ajv(); const parse = ajv.compileParser({ properties: { a: {} } });",
      errors: [field],
    },
    {
      code: "function build(ajv) { return ajv.compile({ type: 'object', properties: { a: true } }); }",
      errors: [
        {
          messageId: 'unvalidatedField',
          data: { factory: 'The JSON Schema true', example: SCHEMA_FORMS.ajv.example },
        },
      ],
    },
  ],
});

tester.run('no-unvalidated-schema-field class-validator and typia paths', rule, {
  valid: [
    "import typia from 'typia'; interface Item { name: string } const items = typia.assert<Item[] | null>(input);",
    "import { IsString, ValidateIf } from 'class-validator'; class Dto { @ValidateIf((o) => o.kind === 'a') @IsString() name?: string; }",
  ],
  invalid: [
    {
      code: "import { ValidateIf } from 'class-validator'; class Dto { @ValidateIf((o) => o.kind === 'a') payload?: unknown; }",
      errors: [field],
    },
    {
      code: "import typia from 'typia'; type Event = { a: Partial<Record<string, any>>; b: Map<string, unknown>; c: Set<any>; d: ReadonlyArray<unknown> }; const ok = typia.is<Event>(input);",
      errors: fields(4),
    },
    {
      code: "import typia from 'typia'; interface Item { a: any } const all = typia.assert<Item[]>(input); const one = typia.assert<Array<Item> | null>(input); const map = typia.is<Record<string, Item>>(input);",
      errors: fields(3),
    },
    {
      code: "import typia from 'typia'; interface Item { a: unknown } type Order = { items: Item[] }; const order = typia.assert<Order>(input);",
      errors: fields(1),
    },
    {
      code: "import { Allow } from 'class-validator'; class Dto { @Allow() accessor payload: unknown; }",
      errors: fields(1),
    },
  ],
});

tester.run('no-unvalidated-schema-field arktype tuples and effect index signatures', rule, {
  valid: [
    "import { type } from 'arktype'; const s = type({ a: ['string', '=', 'any'], b: ['number', '|', 'unknown'] });",
  ],
  invalid: [
    {
      code: "import { Schema } from 'effect'; const s = Schema.Struct({ a: Schema.String }, { key: Schema.String, value: Schema.Unknown });",
      errors: [loose('effect', 'A Struct index signature of Schema.Unknown or Schema.Any')],
    },
  ],
});
