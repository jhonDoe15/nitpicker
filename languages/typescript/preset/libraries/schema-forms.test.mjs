import { RuleTester } from 'eslint';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from 'vitest';
import tseslint from 'typescript-eslint';
import { boundaryGuardRule } from '../eslint-plugin/rules/boundaries/no-handwritten-boundary-guard.mjs';

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
const PHRASES = [
  ['zod', 'a zod schema'],
  ['valibot', 'a valibot schema'],
  ['yup', 'a yup schema'],
  ['joi', 'a joi schema'],
  ['io-ts', 'an io-ts codec'],
  ['arktype', 'an arktype schema'],
  ['class-validator', 'a class-validator class'],
  ['ajv', 'an ajv schema'],
  ['typebox', 'a typebox schema'],
  ['superstruct', 'a superstruct struct'],
  ['runtypes', 'a runtypes runtype'],
  ['typia', 'a typia validator'],
  ['effect', 'an effect schema'],
  ['valita', 'a valita schema'],
];

for (const [library, phrase] of PHRASES) {
  tester.run(`type guard message for ${library}`, guardRule(library), {
    valid: [],
    invalid: [
      { code: PREDICATE, errors: [{ message: new RegExp(`boundary with ${phrase} \\(`) }] },
    ],
  });
}

tester.run('schemas the file cannot resolve', guardRule('joi', 'yup', 'ajv', 'arktype'), {
  valid: [
    "import { userSchema } from './schemas'; const d = userSchema.validate(JSON.parse(t));",
    "import { userSchema } from './schemas'; const d = await userSchema.validate(JSON.parse(t));",
    'function read(schema: Schema, t: string) { return schema.validate(JSON.parse(t)); }',
    'class Reader { schema = build(); read(t: string) { return this.schema.validate(JSON.parse(t)); } }',
    "import { ajv } from './ajv'; const d = ajv.validate(S, JSON.parse(t));",
    "import { validateUser } from './compiled'; const d = validateUser(JSON.parse(t));",
    "import { userType } from './types'; const d = userType(JSON.parse(t));",
  ],
  invalid: [
    { code: 'const d = form.validate(JSON.parse(t));', errors: 1 },
    {
      code: 'function read(form: Form, t: string) { return form.validate(JSON.parse(t)); }',
      errors: 1,
    },
    { code: "import { form } from './forms'; const d = form.validate(JSON.parse(t));", errors: 1 },
    { code: 'const d = makeValidator(); const e = d(JSON.parse(t));', errors: 1 },
  ],
});

tester.run('other ways to call a parse', guardRule('zod', 'joi', 'valibot', 'io-ts'), {
  valid: [
    'const { parse } = schema; const d = parse(JSON.parse(t));',
    "const d = schema['parse'](JSON.parse(t));",
    "import Joi = require('joi'); const d = Joi.attempt(JSON.parse(t), S);",
    "const Joi = require('joi'); const s = Joi.object({}); const d = s.validate(JSON.parse(t));",
    "const Joi = require('joi'); const d = Joi.attempt(JSON.parse(t), S);",
    "import Joi from 'joi'; const s = Joi.object({}); const v = s.validate.bind(s); v(JSON.parse(t));",
    "import { parser } from 'valibot'; const p = parser(S); const d = p(JSON.parse(t));",
    "import * as v from 'valibot'; const d = v.is(S, JSON.parse(t));",
    "import { pipe } from 'fp-ts/function'; const d = pipe(JSON.parse(t), User.decode);",
    'const d = schema.safeParse(JSON.parse(t) as unknown);',
    'const d = schema.safeParse(JSON.parse(t)!);',
    'const raw = JSON.parse(t) as unknown; const d = schema.safeParse(raw);',
    'const raw = JSON.parse(t); const copy = raw; const d = schema.safeParse(copy);',
  ],
  invalid: [
    { code: 'const d = JSON.parse(t);', errors: 1 },
    {
      code: "import { pipe } from 'fp-ts/function'; const d = pipe(JSON.parse(t), String);",
      errors: 1,
    },
    { code: 'const d = JSON.parse(t); const e = { value: d }; const f = other(e);', errors: 1 },
  ],
});

tester.run('more libraries', guardRule('superstruct', 'runtypes', 'typia', 'effect', 'valita'), {
  valid: [
    "import { create } from 'superstruct'; const d = create(JSON.parse(t), User);",
    "import * as s from 'superstruct'; const d = s.assert(JSON.parse(t), User);",
    "import { Record, String } from 'runtypes'; const User = Record({ a: String }); const d = User.check(JSON.parse(t));",
    "import typia from 'typia'; const d = typia.assert<User>(JSON.parse(t));",
    "import { Schema } from 'effect'; const d = Schema.decodeUnknownSync(User)(JSON.parse(t));",
    "import { Schema } from 'effect'; const decode = Schema.decodeUnknownSync(User); const d = decode(JSON.parse(t));",
    "import * as v from '@badrap/valita'; const User = v.object({}); const d = User.parse(JSON.parse(t));",
  ],
  invalid: [
    { code: 'const d = create(JSON.parse(t), User);', errors: 1 },
    { code: "import typia from 'typia'; const d = typia.misc.clone(JSON.parse(t));", errors: 1 },
    { code: "import { Schema } from 'effect'; const d = Schema.make(JSON.parse(t));", errors: 1 },
  ],
});

const MANY_USES = Array.from({ length: 30 }, (_, index) => `log(d, ${String(index)});`).join(' ');

tester.run('a parsed value used many times', guardRule('zod'), {
  valid: [`const d = JSON.parse(t); ${MANY_USES} const r = schema.parse(d);`],
  invalid: [{ code: `const d = JSON.parse(t); ${MANY_USES}`, errors: 1 }],
});

tester.run('a long chain of aliases', guardRule('zod'), {
  valid: [
    `const a0 = JSON.parse(t); ${Array.from({ length: 40 }, (_, i) => `const a${String(i + 1)} = a${String(i)};`).join(' ')} schema.parse(a40);`,
  ],
  invalid: [],
});
