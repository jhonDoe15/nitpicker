import { RuleTester } from 'eslint';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import tseslint from 'typescript-eslint';
import { VALIDATION_LIBRARIES } from '../../../../libraries/validation-libraries.mjs';
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

const fieldError = (id, factory) => ({
  messageId: 'unvalidatedField',
  data: { factory, example: SCHEMA_FORMS[id].example },
});
const loose = { messageId: 'looseObject' };

describe('the library catalog', () => {
  it('has schema forms for every validation library except the decorator and type ones', () => {
    const ids = VALIDATION_LIBRARIES.map(({ id }) => id);
    expect(ids.filter((id) => !(id in SCHEMA_FORMS))).toEqual(['class-validator', 'typia']);
  });
});

tester.run('no-unvalidated-schema-field valibot', rule, {
  valid: [
    "import * as v from 'valibot'; const s = v.object({ name: v.pipe(v.string(), v.minLength(1)) });",
    "import * as v from 'valibot'; const s = v.array(v.unknown());",
    "import * as v from 'valibot'; const s = v.object({ value: v.pipe(v.unknown(), v.check(isPrice)) });",
    "import * as v from 'valibot'; const s = v.strictObject({ a: v.string() });",
    "import * as v from 'valibot'; const s = v.objectWithRest({ a: v.string() }, v.number());",
    'const s = v.object({ a: v.unknown() });',
    "import * as v from 'other'; const s = v.looseObject({ a: v.unknown() });",
  ],
  invalid: [
    {
      code: "import * as v from 'valibot'; const s = v.object({ a: v.unknown(), b: v.any() });",
      errors: [fieldError('valibot', 'v.unknown()'), fieldError('valibot', 'v.any()')],
    },
    {
      code: "import { object, optional, unknown } from 'valibot'; const s = object({ a: optional(unknown()) });",
      errors: [fieldError('valibot', 'v.unknown()')],
    },
    {
      code: "import * as v from 'valibot'; const s = v.object({ a: v.record(v.string(), v.any()), b: v.tuple([v.string(), v.unknown()]) });",
      errors: [fieldError('valibot', 'v.any()'), fieldError('valibot', 'v.unknown()')],
    },
    {
      code: "import * as v from 'valibot'; const s = v.looseObject({ a: v.string() });",
      errors: [loose],
    },
    {
      code: "import * as v from 'valibot'; const s = v.objectWithRest({ a: v.string() }, v.unknown());",
      errors: [loose],
    },
  ],
});

tester.run('no-unvalidated-schema-field yup', rule, {
  valid: [
    "import * as yup from 'yup'; const s = yup.object({ a: yup.mixed().oneOf(['x', 'y']) });",
    "import * as yup from 'yup'; const s = yup.object({ a: yup.mixed().test('price', 'bad', isPrice) });",
    "import * as yup from 'yup'; const s = yup.object({ a: yup.mixed<File>((value) => value instanceof File) });",
    "import * as yup from 'yup'; const s = yup.object({ a: yup.string().required() });",
    "import * as yup from 'yup'; const s = yup.object({ a: yup.mixed().strip() });",
  ],
  invalid: [
    {
      code: "import * as yup from 'yup'; const s = yup.object({ a: yup.mixed().required() });",
      errors: [fieldError('yup', 'yup.mixed()')],
    },
    {
      code: "import { array, mixed, object } from 'yup'; const s = object().shape({ a: array().of(mixed()) });",
      errors: [fieldError('yup', 'yup.mixed()')],
    },
  ],
});

tester.run('no-unvalidated-schema-field joi', rule, {
  valid: [
    "import Joi from 'joi'; const s = Joi.object({ a: Joi.any().valid('x', 'y') });",
    "import Joi from 'joi'; const s = Joi.object({ a: Joi.any().custom(checkPrice) });",
    "import Joi from 'joi'; const s = Joi.object({ a: Joi.string() }).unknown(false);",
    "import Joi from 'joi'; const s = Joi.object().pattern(/^x/, Joi.number());",
    "import Joi from 'joi'; const s = Joi.object({ a: Joi.string() }).prefs({ convert: false });",
  ],
  invalid: [
    {
      code: "import Joi from 'joi'; const s = Joi.object({ a: Joi.any().required(), b: Joi.array().items(Joi.any()) });",
      errors: [fieldError('joi', 'Joi.any()'), fieldError('joi', 'Joi.any()')],
    },
    {
      code: "import Joi from 'joi'; const s = Joi.object().keys({ a: Joi.any().allow(null) });",
      errors: [fieldError('joi', 'Joi.any()')],
    },
    {
      code: "import Joi from 'joi'; const s = Joi.object({ a: Joi.string() }).unknown();",
      errors: [loose],
    },
    {
      code: "import Joi from 'joi'; const s = Joi.object({ a: Joi.string() }).unknown(true);",
      errors: [loose],
    },
    {
      code: "import Joi from 'joi'; const s = Joi.object().pattern(Joi.string(), Joi.any());",
      errors: [loose],
    },
    {
      code: "import Joi from 'joi'; const s = Joi.object({ a: Joi.string() }).prefs({ allowUnknown: true });",
      errors: [loose],
    },
  ],
});

tester.run('no-unvalidated-schema-field typebox', rule, {
  valid: [
    "import { Type } from '@sinclair/typebox'; const s = Type.Object({ a: Type.String({ minLength: 1 }) });",
    "import { Type } from '@sinclair/typebox'; const s = Type.Object({ a: Type.String() }, { additionalProperties: false });",
    "import { Type } from '@sinclair/typebox'; const s = Type.Array(Type.Unknown());",
  ],
  invalid: [
    {
      code: "import { Type } from '@sinclair/typebox'; const s = Type.Object({ a: Type.Unknown(), b: Type.Optional(Type.Any()) });",
      errors: [fieldError('typebox', 'Type.Unknown()'), fieldError('typebox', 'Type.Any()')],
    },
    {
      code: "import Type from 'typebox'; const s = Type.Object({ a: Type.Record(Type.String(), Type.Unknown()) });",
      errors: [fieldError('typebox', 'Type.Unknown()')],
    },
    {
      code: "import { Type } from '@sinclair/typebox'; const s = Type.Object({ a: Type.String() }, { additionalProperties: true });",
      errors: [loose],
    },
  ],
});

tester.run('no-unvalidated-schema-field io-ts, superstruct, runtypes', rule, {
  valid: [
    "import * as t from 'io-ts'; const s = t.type({ a: t.string });",
    "import * as t from 'io-ts'; const s = t.array(t.unknown);",
    "import { object, refine, string } from 'superstruct'; const s = object({ a: refine(string(), 'x', isX) });",
    "import { Object, String, Unknown } from 'runtypes'; const s = Object({ a: String, b: Unknown.withConstraint(isPrice) });",
  ],
  invalid: [
    {
      code: "import * as t from 'io-ts'; const s = t.type({ a: t.unknown, b: t.array(t.any) });",
      errors: [fieldError('io-ts', 't.unknown'), fieldError('io-ts', 't.any')],
    },
    {
      code: "import { exact, partial, unknown } from 'io-ts'; const s = exact(partial({ a: unknown }));",
      errors: [fieldError('io-ts', 't.unknown')],
    },
    {
      code: "import { any, object, optional, type, unknown } from 'superstruct'; const s = object({ a: any(), b: optional(unknown()) }); const u = type({ c: any() });",
      errors: [
        fieldError('superstruct', 'any()'),
        fieldError('superstruct', 'unknown()'),
        fieldError('superstruct', 'any()'),
      ],
    },
    {
      code: "import { Object, Record, Unknown } from 'runtypes'; const s = Object({ a: Unknown.optional() }); const r = Record({ b: Unknown });",
      errors: [fieldError('runtypes', 'Unknown'), fieldError('runtypes', 'Unknown')],
    },
  ],
});

tester.run('no-unvalidated-schema-field effect and valita', rule, {
  valid: [
    "import { Schema } from 'effect'; const s = Schema.Struct({ a: Schema.NonEmptyTrimmedString });",
    "import { Schema } from 'effect'; const s = Schema.Struct({ a: Schema.Unknown.pipe(Schema.filter(isPrice)) });",
    "import { Schema } from 'effect'; const s = Schema.Struct({ a: Schema.String }, Schema.Record({ key: Schema.String, value: Schema.Number }));",
    "import * as v from '@badrap/valita'; const s = v.object({ a: v.string() });",
    "import * as v from '@badrap/valita'; const s = v.object({ a: v.unknown().assert(isPrice) });",
    "import * as v from '@badrap/valita'; const s = v.object({ a: v.string() }).rest(v.number());",
  ],
  invalid: [
    {
      code: "import { Schema } from 'effect'; const s = Schema.Struct({ a: Schema.Unknown, b: Schema.optional(Schema.Any), c: Schema.Record({ key: Schema.String, value: Schema.Unknown }) });",
      errors: [
        fieldError('effect', 'Schema.Unknown'),
        fieldError('effect', 'Schema.Any'),
        fieldError('effect', 'Schema.Unknown'),
      ],
    },
    {
      code: "import * as S from 'effect/Schema'; const s = S.Struct({ a: S.Array(S.Unknown) });",
      errors: [fieldError('effect', 'Schema.Unknown')],
    },
    {
      code: "import { Schema } from 'effect'; const s = Schema.Struct({ a: Schema.String }, Schema.Record({ key: Schema.String, value: Schema.Unknown }));",
      errors: [loose],
    },
    {
      code: "import * as v from '@badrap/valita'; const s = v.object({ a: v.unknown().optional(), b: v.array(v.unknown()) });",
      errors: [fieldError('valita', 'v.unknown()'), fieldError('valita', 'v.unknown()')],
    },
    {
      code: "import * as v from '@badrap/valita'; const s = v.object({ a: v.string() }).rest(v.unknown());",
      errors: [loose],
    },
  ],
});

tester.run('no-unvalidated-schema-field arktype', rule, {
  valid: [
    "import { type } from 'arktype'; const s = type({ name: 'string > 0', email: 'string.email' });",
    "import { type } from 'arktype'; const s = type('unknown[]');",
    "const s = type({ a: 'unknown' });",
  ],
  invalid: [
    {
      code: "import { type } from 'arktype'; const s = type({ a: 'unknown', 'b?': 'any', c: 'unknown[]' });",
      errors: [
        fieldError('arktype', '"unknown"'),
        fieldError('arktype', '"any"'),
        fieldError('arktype', '"unknown[]"'),
      ],
    },
    {
      code: "import { type } from 'arktype'; const s = type({ inner: { id: 'unknown' } });",
      errors: [fieldError('arktype', '"unknown"')],
    },
  ],
});
