import type { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { configuredRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from '../no-unvalidated-schema-field.mts';
import { SCHEMA_FORMS } from './schema-forms.mts';

type CaseRow = [string, Exclude<RuleTester.InvalidTestCase['errors'], number>];

const tester = configuredRuleTester({
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module', parser: tseslint.parser },
});

const forms: Readonly<Record<keyof typeof SCHEMA_FORMS, { allowed?: string; example: string }>> =
  SCHEMA_FORMS;
const field = { messageId: 'unvalidatedField' };
const fields = (count: number) => Array.from({ length: count }, () => field);
const loose = (id: keyof typeof SCHEMA_FORMS, form: string) => ({
  messageId: 'looseObject',
  data: { form, allowed: forms[id].allowed },
});
const ajv = "import Ajv from 'ajv'; const ajv = new Ajv();";

const forms1: CaseRow[] = [
  [
    "import * as v from 'valibot'; const s = v.object({ a: v.nullish(v.any()), b: v.exactOptional(v.unknown()), c: v.undefinedable(v.any()), d: v.nonOptional(v.any()), e: v.nonNullable(v.any()), f: v.nonNullish(v.any()), g: v.set(v.any()), h: v.map(v.string(), v.any()) });",
    fields(8),
  ],
  [
    "import * as t from 'io-ts'; const s = t.strict({ a: t.readonlyArray(t.any), b: t.readonly(t.unknown), c: t.tuple([t.string, t.unknown]), d: t.record(t.string, t.any) });",
    fields(4),
  ],
  [
    "import { any, defaulted, map, nullable, object, record, set, string, tuple } from 'superstruct'; const s = object({ a: set(any()), b: map(string(), any()), c: record(string(), any()), d: tuple([string(), any()]), e: nullable(any()), f: defaulted(any(), 1) });",
    fields(6),
  ],
  [
    "import { Array, Dictionary, Optional, Partial, Record, String, Tuple, Unknown } from 'runtypes'; const s = Record({ a: Array(Unknown), b: Dictionary(Unknown), c: Tuple(String, Unknown), d: Optional(Unknown) }); const p = Partial({ e: Unknown });",
    fields(5),
  ],
  [
    "import { Schema } from 'effect'; const s = Schema.Struct({ a: Schema.NonEmptyArray(Schema.Any), b: Schema.Tuple(Schema.String, Schema.Unknown), c: Schema.optionalWith(Schema.Unknown, { exact: true }), d: Schema.NullOr(Schema.Any), e: Schema.UndefinedOr(Schema.Any), f: Schema.NullishOr(Schema.Any), g: Schema.mutable(Schema.Array(Schema.Unknown)) });",
    fields(7),
  ],
  [
    "import * as v from '@badrap/valita'; const s = v.object({ a: v.record(v.unknown()), b: v.tuple([v.string(), v.unknown()]) });",
    fields(2),
  ],
  [
    "import { Type } from '@sinclair/typebox'; const s = Type.Object({ a: Type.Tuple([Type.String(), Type.Any()]), b: Type.Readonly(Type.Unknown()), c: Type.ReadonlyOptional(Type.Any()) });",
    fields(3),
  ],
  [
    "import { z } from 'zod'; const a = Base.safeExtend({ x: z.any() }); const b = Base.augment({ y: z.unknown() });",
    fields(2),
  ],
  [
    "import Joi from 'joi'; const s = Joi.object({ a: Joi.string() }).append({ b: Joi.any() });",
    fields(1),
  ],
];

tester.run('no-unvalidated-schema-field containers of every library', rule, {
  valid: [],
  invalid: forms1.map(([code, errors]) => ({ code, errors })),
});

const forms2: CaseRow[] = [
  [
    "import { z } from 'zod'; const s = z.object({ a: z.string() }).passthrough();",
    [loose('zod', '.passthrough()')],
  ],
  [
    "import * as v from 'valibot'; const s = v.looseObject({ a: v.string() });",
    [loose('valibot', 'v.looseObject()')],
  ],
  [
    "import Joi from 'joi'; const a = Joi.object().preferences({ allowUnknown: true }); const b = Joi.object().options({ allowUnknown: true });",
    [loose('joi', 'allowUnknown: true'), loose('joi', 'allowUnknown: true')],
  ],
  [
    "import { Type } from '@sinclair/typebox'; const s = Type.Object({ a: Type.String() }, { additionalProperties: Type.Any() });",
    [loose('typebox', 'additionalProperties: true or an unchecked schema')],
  ],
  [
    "import { Schema } from 'effect'; const s = Schema.Struct({ a: Schema.String }, Schema.Record({ key: Schema.String, value: Schema.Any }));",
    [loose('effect', 'A Struct index signature of Schema.Unknown or Schema.Any')],
  ],
  [
    "import * as v from '@badrap/valita'; const s = v.object({ a: v.string() }).rest(v.unknown());",
    [loose('valita', '.rest(v.unknown())')],
  ],
];

tester.run('no-unvalidated-schema-field loose forms name the allowed form', rule, {
  valid: [],
  invalid: forms2.map(([code, errors]) => ({ code, errors })),
});

const forms3: CaseRow[] = [
  [
    `${ajv} ajv.addSchema({ type: 'object', patternProperties: { '^x': {} } }); const check = await ajv.compileAsync({ allOf: [{ properties: { a: {} } }] });`,
    [loose('ajv', 'A patternProperties entry of {} or true'), field],
  ],
  [
    "import Ajv from 'ajv'; const check = new Ajv().compile({ $defs: { item: { type: 'object', additionalProperties: {} } } });",
    [loose('ajv', 'additionalProperties: {}')],
  ],
  [
    "import Ajv from 'ajv/dist/jtd'; const ajv = new Ajv(); const parse = ajv.compileParser({ properties: { a: {} } });",
    [field],
  ],
  [
    "function build(ajv) { return ajv.compile({ type: 'object', properties: { a: true } }); }",
    [
      {
        messageId: 'unvalidatedField',
        data: { factory: 'The JSON Schema true', example: forms.ajv.example },
      },
    ],
  ],
];

tester.run('no-unvalidated-schema-field ajv calls and nesting', rule, {
  valid: [
    "const ajv = makeValidator(); const check = ajv.compile({ type: 'object', additionalProperties: true });",
    `${ajv} const base = { type: 'string' }; const check = ajv.compile({ ...base, properties: { ...shared, a: { ...base } } });`,
  ],
  invalid: forms3.map(([code, errors]) => ({ code, errors })),
});

const forms4: CaseRow[] = [
  [
    "import { ValidateIf } from 'class-validator'; class Dto { @ValidateIf((o) => o.kind === 'a') payload?: unknown; }",
    [field],
  ],
  [
    "import typia from 'typia'; type Event = { a: Partial<Record<string, any>>; b: Map<string, unknown>; c: Set<any>; d: ReadonlyArray<unknown> }; const ok = typia.is<Event>(input);",
    fields(4),
  ],
  [
    "import typia from 'typia'; interface Item { a: any } const all = typia.assert<Item[]>(input); const one = typia.assert<Array<Item> | null>(input); const map = typia.is<Record<string, Item>>(input);",
    fields(3),
  ],
  [
    "import typia from 'typia'; interface Item { a: unknown } type Order = { items: Item[] }; const order = typia.assert<Order>(input);",
    fields(1),
  ],
  [
    "import { Allow } from 'class-validator'; class Dto { @Allow() accessor payload: unknown; }",
    fields(1),
  ],
];

tester.run('no-unvalidated-schema-field class-validator and typia paths', rule, {
  valid: [
    "import typia from 'typia'; interface Item { name: string } const items = typia.assert<Item[] | null>(input);",
    "import { IsString, ValidateIf } from 'class-validator'; class Dto { @ValidateIf((o) => o.kind === 'a') @IsString() name?: string; }",
  ],
  invalid: forms4.map(([code, errors]) => ({ code, errors })),
});

const forms5: CaseRow[] = [
  [
    "import { Schema } from 'effect'; const s = Schema.Struct({ a: Schema.String }, { key: Schema.String, value: Schema.Unknown });",
    [loose('effect', 'A Struct index signature of Schema.Unknown or Schema.Any')],
  ],
];

tester.run('no-unvalidated-schema-field arktype tuples and effect index signatures', rule, {
  valid: [
    "import { type } from 'arktype'; const s = type({ a: ['string', '=', 'any'], b: ['number', '|', 'unknown'] });",
  ],
  invalid: forms5.map(([code, errors]) => ({ code, errors })),
});
