import type { ValidationLibrary, ValidationSpec } from './typed/library-types.mts';

const VALIDATE = 'validate';
const ASSERT = 'assert';
const IS = 'is';
const PARSE = 'parse';
const CREATE = 'create';
const PARSE_FAMILY = [PARSE, 'safeParse', 'parseAsync', 'safeParseAsync'];

function library(spec: ValidationSpec): ValidationLibrary {
  return {
    anyReceiver: [],
    derivedReceiver: [],
    namespace: [],
    imported: [],
    transform: [],
    factories: [],
    callable: false,
    ...spec,
  };
}

export const VALIDATION_LIBRARIES: readonly [ValidationLibrary, ...ValidationLibrary[]] = [
  library({
    id: 'zod',
    packages: ['zod'],
    phrase: 'a zod schema',
    anyReceiver: PARSE_FAMILY,
    namespace: PARSE_FAMILY,
    call: 'schema.safeParse',
    example: 'schema.parse or schema.safeParse',
  }),
  library({
    id: 'valibot',
    packages: ['valibot'],
    phrase: 'a valibot schema',
    namespace: [...PARSE_FAMILY, ASSERT, IS],
    imported: [...PARSE_FAMILY, ASSERT, IS],
    factories: ['parser', 'safeParser', 'parserAsync', 'safeParserAsync'],
    call: 'v.safeParse',
    example: 'v.parse or v.safeParse',
  }),
  library({
    id: 'yup',
    packages: ['yup'],
    phrase: 'a yup schema',
    anyReceiver: ['validateSync'],
    derivedReceiver: [VALIDATE, 'validateAt', 'validateSyncAt', 'isValid', 'isValidSync'],
    call: 'schema.validateSync',
    example: 'schema.validateSync or schema.validate',
  }),
  library({
    id: 'joi',
    packages: ['joi', '@hapi/joi'],
    phrase: 'a joi schema',
    derivedReceiver: [VALIDATE, 'validateAsync'],
    namespace: ['attempt', ASSERT],
    call: 'schema.validate',
    example: 'schema.validate or Joi.attempt',
  }),
  library({
    id: 'io-ts',
    packages: ['io-ts'],
    phrase: 'an io-ts codec',
    anyReceiver: ['decode'],
    derivedReceiver: [VALIDATE],
    call: 'codec.decode',
    example: 'codec.decode',
  }),
  library({
    id: 'arktype',
    packages: ['arktype'],
    phrase: 'an arktype schema',
    derivedReceiver: [ASSERT],
    callable: true,
    call: 'schema.assert',
    example: 'schema.assert or schema(data)',
  }),
  library({
    id: 'class-validator',
    packages: ['class-validator', 'class-transformer'],
    phrase: 'a class-validator class',
    imported: [VALIDATE, 'validateSync', 'validateOrReject'],
    transform: ['plainToInstance', 'plainToClass'],
    call: 'validateOrReject',
    example: 'validateOrReject after plainToInstance',
  }),
  library({
    id: 'ajv',
    packages: ['ajv'],
    phrase: 'an ajv schema',
    derivedReceiver: [VALIDATE],
    callable: true,
    call: 'ajv.validate',
    example: 'ajv.validate or a function from ajv.compile',
  }),
  library({
    id: 'typebox',
    packages: ['@sinclair/typebox', 'typebox'],
    phrase: 'a typebox schema',
    derivedReceiver: ['Parse', 'Decode'],
    namespace: ['Parse', 'Decode', 'Assert'],
    call: 'Value.Parse',
    example: 'Value.Parse or Value.Decode',
  }),
  library({
    id: 'superstruct',
    packages: ['superstruct'],
    phrase: 'a superstruct struct',
    namespace: [ASSERT, CREATE, VALIDATE, 'mask', IS],
    imported: [ASSERT, CREATE, VALIDATE, 'mask', IS],
    call: CREATE,
    example: 'create or assert',
  }),
  library({
    id: 'runtypes',
    packages: ['runtypes'],
    phrase: 'a runtypes runtype',
    derivedReceiver: [PARSE, 'check', ASSERT, 'guard', VALIDATE],
    call: 'Type.check',
    example: 'Type.check or Type.parse',
  }),
  library({
    id: 'typia',
    packages: ['typia'],
    phrase: 'a typia validator',
    namespace: [ASSERT, 'assertEquals', IS, 'equals', VALIDATE, 'validateEquals'],
    call: 'typia.assert',
    example: 'typia.assert<T> or typia.is<T>',
  }),
  library({
    id: 'effect',
    packages: ['effect', '@effect/schema'],
    phrase: 'an effect schema',
    factories: [
      'decodeUnknownSync',
      'decodeUnknown',
      'decodeUnknownEither',
      'decodeUnknownPromise',
      'decodeSync',
      'decode',
    ],
    call: 'Schema.decodeUnknownSync(schema)',
    example: 'Schema.decodeUnknownSync(schema)(data)',
  }),
  library({
    id: 'valita',
    packages: ['@badrap/valita'],
    phrase: 'a valita schema',
    derivedReceiver: [PARSE, 'try'],
    call: 'schema.parse',
    example: 'schema.parse',
  }),
];
