import { RuleTester } from 'eslint';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from 'vitest';
import tseslint from 'typescript-eslint';
import { boundaryGuardRule } from '../eslint-plugin/rules/boundaries/no-handwritten-boundary-guard.mjs';
import { unknownInDomainRule } from '../eslint-plugin/rules/boundaries/no-unknown-in-domain.mjs';
import { structuredCatchLoggingRule } from '../eslint-plugin/rules/errors/structured-catch-logging.mjs';
import { appliesPinoErrorShape, validationBehavior } from './project-libraries.mjs';

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
  return boundaryGuardRule(validationBehavior({ validation }));
}

const PREDICATE = 'function isUser(value: unknown): value is User { return true; }';
const ZOD_PREDICATE_MESSAGE =
  'Do not hand-write a type guard for external data: parse it once at the boundary with a zod schema (schema.parse or schema.safeParse).';

tester.run('boundary guard with no validation library detected', guardRule(), {
  valid: ['const data = schema.parse(JSON.parse(text));'],
  invalid: [
    { code: PREDICATE, errors: [{ message: ZOD_PREDICATE_MESSAGE }] },
    {
      code: 'const data = schema.validate(JSON.parse(text));',
      errors: [
        {
          message:
            'Pass `JSON.parse(text)` straight into `schema.safeParse(...)` inside the same `try`.',
        },
      ],
    },
  ],
});

tester.run('boundary guard with valibot', guardRule('valibot'), {
  valid: [
    'const data = v.parse(Schema, JSON.parse(text));',
    "import { safeParse } from 'valibot'; const result = safeParse(Schema, JSON.parse(text));",
  ],
  invalid: [
    {
      code: PREDICATE,
      errors: [
        {
          message:
            'Do not hand-write a type guard for external data: parse it once at the boundary with a valibot schema (v.parse or v.safeParse).',
        },
      ],
    },
    {
      code: 'const data = JSON.parse(text);',
      errors: [
        {
          message:
            'Pass `JSON.parse(text)` straight into `v.safeParse(...)` inside the same `try`.',
        },
      ],
    },
  ],
});

tester.run(
  'boundary guard with yup, joi and class-validator',
  guardRule('yup', 'class-validator'),
  {
    valid: [
      'const data = schema.validateSync(JSON.parse(text));',
      'const user = plainToInstance(User, JSON.parse(text));',
      'const raw = JSON.parse(text); await validateOrReject(raw);',
    ],
    invalid: [{ code: 'const data = schema.parse(JSON.parse(text));', errors: 1 }],
  },
);

tester.run('boundary guard with zod next to another library', guardRule('zod', 'joi'), {
  valid: [
    'const a = schema.parse(JSON.parse(text));',
    'const b = schema.validate(JSON.parse(text));',
  ],
  invalid: [{ code: PREDICATE, errors: [{ message: ZOD_PREDICATE_MESSAGE }] }],
});

const DOMAIN_CODE = 'export function total(order: { id: unknown }) { return order; }';

tester.run(
  'unknown in domain names the validation library',
  unknownInDomainRule(validationBehavior({ validation: ['valibot'] })),
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
  unknownInDomainRule(validationBehavior({ validation: ['joi'] })),
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

const PINO_CATCH = "try { run(); } catch (error) { logger.error({ error }, 'failed'); }";
const WINSTON_CATCH = "try { run(); } catch (error) { logger.error('failed', { error }); }";

tester.run(
  'catch logging when the project logs with winston',
  structuredCatchLoggingRule(appliesPinoErrorShape({ logger: ['winston'] })),
  {
    valid: [PINO_CATCH, WINSTON_CATCH],
    invalid: [],
  },
);

tester.run(
  'catch logging when the project logs with bunyan',
  structuredCatchLoggingRule(appliesPinoErrorShape({ logger: ['bunyan'] })),
  {
    valid: [],
    invalid: [{ code: PINO_CATCH, errors: 1 }],
  },
);

tester.run(
  'catch logging when winston and pino are both present',
  structuredCatchLoggingRule(appliesPinoErrorShape({ logger: ['winston', 'pino'] })),
  {
    valid: [],
    invalid: [{ code: PINO_CATCH, errors: 1 }],
  },
);
