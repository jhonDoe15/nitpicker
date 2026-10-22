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
const RULE_EXCEPTION =
  'add an exception for nitpicker/no-handwritten-boundary-guard in nitpicker.config.json.';
const UNION_NOTE =
  'A predicate over a union (`(result): result is Ok => result.kind === "ok"`) is fine.';
const predicateMessage = (how) =>
  `Do not hand-write a type guard for unknown input: parse it once at the boundary with ${how}. ${UNION_NOTE} If the guard is genuinely needed, ${RULE_EXCEPTION}`;
const ZOD_PREDICATE_MESSAGE = predicateMessage('a zod schema (schema.parse or schema.safeParse)');
const unparsed = (call) => ({
  message: `Pass \`JSON.parse(text)\` straight into \`${call}(...)\` inside the same \`try\`. If the text is trusted and already typed, ${RULE_EXCEPTION}`,
});
const domainMessage = (library) =>
  `domain/ code takes typed values, not unknown (also through a type alias). Write a readonly type for this value in domain/; adapters/ parses the input with ${library} schema and passes the result in (the parsed value is assignable to a readonly type; do not import the schema type from adapters/). A caught error may be typed unknown as \`cause\` or \`error\`. If the value is genuinely opaque, add an exception for this rule in nitpicker.config.json.`;

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
          message: predicateMessage('a valibot schema (v.parse or v.safeParse)'),
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
            message: domainMessage('a valibot'),
          },
        ],
      },
    ],
  },
);

tester.run(
  'unknown in domain names a library without a type helper',
  unknownInDomainRule({ validation: ['joi'] }),
  {
    valid: [],
    invalid: [
      {
        code: DOMAIN_CODE,
        errors: [
          {
            message: domainMessage('a joi'),
          },
        ],
      },
    ],
  },
);

tester.run(
  'boundary guard keeps its narrowing, copy and overload checks with valibot',
  guardRule('valibot'),
  {
    valid: ['function isOk(result: Result): result is Ok { return result.kind === "ok"; }'],
    invalid: [
      {
        code: 'function read(value: unknown) { return typeof value === "object"; }',
        errors: [
          {
            message: `Do not hand-narrow an \`unknown\` value with \`typeof x === "object"\` or \`"key" in x\`: parse it once at the boundary with a valibot schema (v.parse or v.safeParse). A caught error is read with \`error instanceof Error\`. If the narrowing is genuinely needed, ${RULE_EXCEPTION}`,
          },
        ],
      },
      {
        code: 'const copy = JSON.parse(JSON.stringify(value));',
        errors: [
          {
            message: `Copy a value with \`structuredClone(value)\`, not \`JSON.parse(JSON.stringify(value))\`. If it is deliberate, ${RULE_EXCEPTION}`,
          },
        ],
      },
      {
        code: 'function pick(a: string): string;\nfunction pick(a: number): number;\nfunction pick(a: unknown): unknown { return a; }',
        errors: [
          {
            message: `This overload implementation returns unknown or any, which makes its overload signatures a cast. Return a typed value, or split it into separate functions. If it is deliberate, ${RULE_EXCEPTION}`,
          },
        ],
      },
    ],
  },
);
