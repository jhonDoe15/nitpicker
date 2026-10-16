import { RuleTester } from 'eslint';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from 'vitest';
import tseslint from 'typescript-eslint';
import { boundaryGuardRule } from '../eslint-plugin/rules/boundaries/no-handwritten-boundary-guard.mjs';
import { unknownInDomainRule } from '../eslint-plugin/rules/boundaries/no-unknown-in-domain.mjs';

Object.assign(RuleTester, {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  it,
  itOnly: it.only,
});
const tester = new RuleTester({
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module', parser: tseslint.parser },
});

function guardRule(...validation) {
  return boundaryGuardRule({ validation });
}

const PREDICATE = 'function isUser(value: unknown): value is User { return true; }';
const EXCEPTION =
  'If this is legitimate, add an exception for nitpicker/no-handwritten-boundary-guard in nitpicker.config.json.';
const ZOD_PREDICATE_MESSAGE = `Do not hand-write a type guard for external data: parse it once at the boundary with a zod schema (schema.parse or schema.safeParse). ${EXCEPTION}`;
const unparsed = (call) => ({
  message: `Pass \`JSON.parse(text)\` straight into \`${call}(...)\` inside the same \`try\`. ${EXCEPTION}`,
});

tester.run('boundary guard with no validation library detected', guardRule(), {
  valid: ['const data = schema.parse(JSON.parse(text));'],
  invalid: [
    { code: PREDICATE, errors: [{ message: ZOD_PREDICATE_MESSAGE }] },
    {
      code: 'const data = schema.validate(JSON.parse(text));',
      errors: [unparsed('schema.safeParse')],
    },
  ],
});

tester.run('boundary guard with valibot', guardRule('valibot'), {
  valid: [
    "import * as v from 'valibot'; const data = v.parse(Schema, JSON.parse(text));",
    "import { safeParse } from 'valibot'; const result = safeParse(Schema, JSON.parse(text));",
    "import { parse as read } from 'valibot'; const raw = JSON.parse(text); const out = read(Schema, raw);",
  ],
  invalid: [
    {
      code: PREDICATE,
      errors: [
        {
          message: `Do not hand-write a type guard for external data: parse it once at the boundary with a valibot schema (v.parse or v.safeParse). ${EXCEPTION}`,
        },
      ],
    },
    { code: 'const data = JSON.parse(text);', errors: [unparsed('v.safeParse')] },
    { code: 'const data = console.assert(JSON.parse(text));', errors: [unparsed('v.safeParse')] },
    { code: 'const data = schema.parse(JSON.parse(text));', errors: [unparsed('v.safeParse')] },
  ],
});

tester.run('boundary guard with yup', guardRule('yup'), {
  valid: [
    'const data = schema.validateSync(JSON.parse(text));',
    "import * as yup from 'yup'; const schema = yup.object({}); const data = await schema.validate(JSON.parse(text));",
    "import { object } from 'yup'; const schema = object({}).required(); schema.validate(JSON.parse(text));",
  ],
  invalid: [
    {
      code: 'const data = schema.cast(JSON.parse(text));',
      errors: [unparsed('schema.validateSync')],
    },
    {
      code: 'const data = form.validate(JSON.parse(text));',
      errors: [unparsed('schema.validateSync')],
    },
    {
      code: "import { form } from './forms'; const data = form.validate(JSON.parse(text));",
      errors: [unparsed('schema.validateSync')],
    },
  ],
});

tester.run('boundary guard with joi', guardRule('joi'), {
  valid: [
    "import Joi from 'joi'; const value = Joi.attempt(JSON.parse(text), Schema);",
    "import Joi from 'joi'; const schema = Joi.object({}); const result = schema.validate(JSON.parse(text));",
  ],
  invalid: [
    { code: 'const result = console.assert(JSON.parse(text));', errors: 1 },
    { code: 'const result = form.validate(JSON.parse(text));', errors: 1 },
  ],
});

tester.run('boundary guard with class-validator', guardRule('class-validator'), {
  valid: [
    "import { validateOrReject } from 'class-validator'; import { plainToInstance } from 'class-transformer'; const dto = plainToInstance(User, JSON.parse(text)); await validateOrReject(dto);",
    "import { validateSync } from 'class-validator'; validateSync(JSON.parse(text));",
    "import { validateOrReject } from 'class-validator'; import { plainToInstance } from 'class-transformer'; await validateOrReject(plainToInstance(User, JSON.parse(text)));",
  ],
  invalid: [
    {
      code: "import { plainToInstance } from 'class-transformer'; const dto = plainToInstance(User, JSON.parse(text));",
      errors: 1,
    },
    { code: 'const user = plainToInstance(User, JSON.parse(text));', errors: 1 },
  ],
});

tester.run('boundary guard with ajv', guardRule('ajv'), {
  valid: [
    "import Ajv from 'ajv'; const ajv = new Ajv(); const ok = ajv.validate(schema, JSON.parse(text));",
    "import Ajv from 'ajv'; const ajv = new Ajv(); const validate = ajv.compile(schema); const ok = validate(JSON.parse(text));",
  ],
  invalid: [
    {
      code: "import Ajv from 'ajv'; const ajv = new Ajv(); const compiled = ajv.compile(JSON.parse(text));",
      errors: 1,
    },
    { code: 'const validate = makeValidator(); const ok = validate(JSON.parse(text));', errors: 1 },
  ],
});

tester.run('boundary guard with arktype', guardRule('arktype'), {
  valid: [
    "import { type } from 'arktype'; const User = type({ name: 'string' }); const user = User(JSON.parse(text));",
    "import { type } from 'arktype'; const User = type({ name: 'string' }); const user = User.assert(JSON.parse(text));",
  ],
  invalid: [
    { code: 'const user = console.assert(JSON.parse(text));', errors: 1 },
    { code: 'const User = makeType(); const user = User(JSON.parse(text));', errors: 1 },
  ],
});

tester.run('boundary guard with typebox', guardRule('typebox'), {
  valid: [
    "import { Value } from '@sinclair/typebox/value'; const out = Value.Parse(Schema, JSON.parse(text));",
  ],
  invalid: [
    {
      code: "import { Value } from '@sinclair/typebox/value'; const ok = Value.Check(Schema, JSON.parse(text));",
      errors: 1,
    },
  ],
});

tester.run('boundary guard with io-ts', guardRule('io-ts'), {
  valid: ['const decoded = User.decode(JSON.parse(text));'],
  invalid: [{ code: 'const decoded = User.encode(JSON.parse(text));', errors: 1 }],
});

tester.run('boundary guard with zod next to another library', guardRule('zod', 'joi'), {
  valid: [
    'const a = schema.parse(JSON.parse(text));',
    "import Joi from 'joi'; const b = Joi.attempt(JSON.parse(text), Schema);",
  ],
  invalid: [{ code: PREDICATE, errors: [{ message: ZOD_PREDICATE_MESSAGE }] }],
});

const DOMAIN_CODE = 'export function total(order: { id: unknown }) { return order; }';

tester.run(
  'unknown in domain names the validation library',
  unknownInDomainRule({ validation: ['valibot'] }),
  {
    valid: [],
    invalid: [
      {
        code: DOMAIN_CODE,
        errors: [
          {
            message:
              'domain/ code takes typed values, not unknown. Parse the input with a valibot schema in adapters/ and give this parameter or property the parsed type (v.InferOutput<typeof schema>). A caught error may be typed unknown as `cause` or `error`. If the value is genuinely opaque, add an exception for this rule in nitpicker.config.json.',
          },
        ],
      },
    ],
  },
);

tester.run(
  'unknown in domain without an inferred type helper',
  unknownInDomainRule({ validation: ['joi'] }),
  {
    valid: [],
    invalid: [
      {
        code: DOMAIN_CODE,
        errors: [
          {
            message:
              'domain/ code takes typed values, not unknown. Parse the input with a joi schema in adapters/ and give this parameter or property the parsed type. A caught error may be typed unknown as `cause` or `error`. If the value is genuinely opaque, add an exception for this rule in nitpicker.config.json.',
          },
        ],
      },
    ],
  },
);
