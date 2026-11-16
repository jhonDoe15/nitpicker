export type SchemaId =
  | 'zod'
  | 'valibot'
  | 'yup'
  | 'joi'
  | 'io-ts'
  | 'arktype'
  | 'ajv'
  | 'typebox'
  | 'superstruct'
  | 'runtypes'
  | 'effect'
  | 'valita';
type Leaf =
  | { readonly kind: 'call'; readonly display: string; readonly noArguments: boolean }
  | { readonly kind: 'value'; readonly display: string };
export type LooseForm = {
  readonly factory?: string;
  readonly method?: string;
  readonly form: string;
  readonly rest?: number | 'tail';
  readonly unlessFalse?: true;
  readonly option?: readonly [number, string];
};
export type SchemaForms = {
  readonly namespaces: readonly string[];
  readonly globals: readonly string[];
  readonly objects: readonly string[];
  readonly leaves: Readonly<Record<string, Leaf>>;
  readonly casts: readonly string[];
  readonly containers: readonly string[];
  readonly containerChildren: Readonly<Record<string, 'value'>>;
  readonly elementMethods: Readonly<Record<string, 'receiver' | 'arguments'>>;
  readonly loose: readonly LooseForm[];
  readonly stringLeaves: RegExp | undefined;
  readonly example: string;
  readonly allowed?: string;
};
type FormSpec = Partial<SchemaForms> & { readonly example: string };

const LOOSE_OBJECT = 'looseObject';
const OBJECT = 'object';
const ARRAY = 'array';
const RECORD = 'record';
const TUPLE = 'tuple';
const OPTIONAL = 'optional';
const NULLABLE = 'nullable';
const NULLISH = 'nullish';
const READONLY = 'readonly';
const ALLOW_UNKNOWN = 'allowUnknown';
const ALLOW_UNKNOWN_FORM = 'allowUnknown: true';
const OBJECT_TYPE = 'Object';
const RECORD_TYPE = 'Record';
const ARRAY_TYPE = 'Array';
const TUPLE_TYPE = 'Tuple';

function call(
  display: string,
  options: { readonly noArguments: boolean } = { noArguments: false },
): Leaf {
  return { kind: 'call', display, ...options };
}

function value(display: string): Leaf {
  return { kind: 'value', display };
}

function forms(spec: FormSpec): SchemaForms {
  return {
    namespaces: [],
    globals: [],
    objects: [],
    leaves: {},
    casts: [],
    containers: [],
    containerChildren: {},
    elementMethods: {},
    loose: [],
    stringLeaves: undefined,
    ...spec,
  };
}

export const SCHEMA_FORMS: Readonly<Record<SchemaId, SchemaForms>> = {
  zod: forms({
    namespaces: ['z'],
    globals: ['z', 'zod'],
    objects: [OBJECT, 'strictObject', LOOSE_OBJECT],
    leaves: { unknown: call('z.unknown()'), any: call('z.any()') },
    casts: ['custom'],
    containers: [RECORD, ARRAY, 'set', 'map', TUPLE, OPTIONAL, NULLABLE, NULLISH, READONLY],
    elementMethods: { array: 'receiver' },
    example: 'z.string().trim().min(1) or z.email()',
    allowed: 'z.object({...}), which drops unknown keys, or z.strictObject({...}) to reject them',
    loose: [
      { factory: LOOSE_OBJECT, form: 'z.looseObject()' },
      { method: 'passthrough', form: '.passthrough()' },
      { method: 'loose', form: '.loose()' },
      { method: 'catchall', rest: 0, form: '.catchall(z.unknown())' },
    ],
  }),
  valibot: forms({
    objects: [OBJECT, 'strictObject', LOOSE_OBJECT, 'objectWithRest'],
    leaves: { unknown: call('v.unknown()'), any: call('v.any()') },
    containers: [
      ARRAY,
      RECORD,
      'set',
      'map',
      TUPLE,
      OPTIONAL,
      NULLABLE,
      NULLISH,
      'exactOptional',
      'undefinedable',
      'nonOptional',
      'nonNullable',
      'nonNullish',
    ],
    example: 'v.pipe(v.string(), v.trim(), v.minLength(1)) or v.pipe(v.string(), v.email())',
    allowed: 'v.object({...}), which drops unknown keys, or v.strictObject({...}) to reject them',
    loose: [
      { factory: LOOSE_OBJECT, form: 'v.looseObject()' },
      { factory: 'objectWithRest', rest: 1, form: 'v.objectWithRest(..., v.unknown())' },
    ],
  }),
  yup: forms({
    objects: [OBJECT],
    leaves: { mixed: call('yup.mixed()', { noArguments: true }) },
    containers: [ARRAY],
    elementMethods: { of: 'arguments' },
    example: 'yup.string().trim().required() or mixed().oneOf([...]) or mixed().test(...)',
  }),
  joi: forms({
    objects: [OBJECT],
    leaves: { any: call('Joi.any()') },
    containers: [ARRAY],
    elementMethods: { items: 'arguments' },
    example: 'Joi.string().trim().min(1) or Joi.any().valid(...) or Joi.any().custom(...)',
    allowed: 'Joi.object({...}) as it is, which rejects unknown keys, or name the extra keys',
    loose: [
      { method: 'unknown', unlessFalse: true, form: '.unknown()' },
      { method: 'pattern', rest: 1, form: '.pattern(key, Joi.any())' },
      { method: 'prefs', option: [0, ALLOW_UNKNOWN], form: ALLOW_UNKNOWN_FORM },
      { method: 'preferences', option: [0, ALLOW_UNKNOWN], form: ALLOW_UNKNOWN_FORM },
      { method: 'options', option: [0, ALLOW_UNKNOWN], form: ALLOW_UNKNOWN_FORM },
    ],
  }),
  'io-ts': forms({
    objects: ['type', 'strict', 'partial'],
    leaves: { unknown: value('t.unknown'), any: value('t.any') },
    containers: [ARRAY, 'readonlyArray', RECORD, READONLY, TUPLE],
    example: 't.string with a refinement or a branded codec',
  }),
  arktype: forms({
    objects: ['type'],
    stringLeaves: /^\s*(unknown|any)\s*(\[\]\s*)*$/,
    example: '"string > 0" or "string.email"',
  }),
  ajv: forms({
    example: "{ type: 'string', minLength: 1 } or { type: 'string', format: 'email' }",
    allowed:
      'additionalProperties: false, which rejects unknown keys (removeAdditional on the Ajv instance drops them instead)',
  }),
  typebox: forms({
    namespaces: ['Type'],
    objects: [OBJECT_TYPE],
    leaves: { Unknown: call('Type.Unknown()'), Any: call('Type.Any()') },
    containers: [ARRAY_TYPE, RECORD_TYPE, TUPLE_TYPE, 'Optional', 'Readonly', 'ReadonlyOptional'],
    example: "Type.String({ minLength: 1 }) or Type.String({ format: 'email' })",
    allowed:
      'Type.Object({...}) without additionalProperties, which Value.Parse cleans of unknown keys, or additionalProperties: false to reject them',
    loose: [
      {
        factory: OBJECT_TYPE,
        option: [1, 'additionalProperties'],
        form: 'additionalProperties: true or an unchecked schema',
      },
    ],
  }),
  superstruct: forms({
    objects: [OBJECT, 'type', 'partial'],
    leaves: { unknown: call('unknown()'), any: call('any()') },
    containers: [ARRAY, RECORD, 'set', 'map', TUPLE, OPTIONAL, NULLABLE, 'defaulted'],
    example: 'nonempty(string()) or refine(string(), ...)',
  }),
  runtypes: forms({
    objects: [OBJECT_TYPE, RECORD_TYPE, 'Partial'],
    leaves: { Unknown: value('Unknown') },
    containers: [ARRAY_TYPE, 'Dictionary', RECORD_TYPE, TUPLE_TYPE, 'Optional'],
    example: 'String.withConstraint(...) or a literal union',
  }),
  effect: forms({
    namespaces: ['Schema'],
    objects: ['Struct'],
    leaves: { Unknown: value('Schema.Unknown'), Any: value('Schema.Any') },
    containers: [
      ARRAY_TYPE,
      'NonEmptyArray',
      RECORD_TYPE,
      TUPLE_TYPE,
      OPTIONAL,
      'optionalWith',
      'NullOr',
      'UndefinedOr',
      'NullishOr',
      'mutable',
    ],
    containerChildren: { Record: 'value' },
    example: 'Schema.NonEmptyTrimmedString or Schema.String.pipe(Schema.pattern(...))',
    allowed:
      'Schema.Struct({...}) without the index signature, which drops unknown keys on decode, or a Record whose value schema validates',
    loose: [
      {
        factory: 'Struct',
        rest: 'tail',
        form: 'A Struct index signature of Schema.Unknown or Schema.Any',
      },
    ],
  }),
  valita: forms({
    objects: [OBJECT],
    leaves: { unknown: call('v.unknown()') },
    containers: [ARRAY, RECORD, TUPLE],
    example: 'v.string().assert((value) => value.length > 0)',
    allowed: 'v.object({...}), which rejects unknown keys, or .rest() with a validating schema',
    loose: [{ method: 'rest', rest: 0, form: '.rest(v.unknown())' }],
  }),
};

const SHAPE_METHODS = new Set<string | undefined>([
  'extend',
  'safeExtend',
  'augment',
  'shape',
  'keys',
  'append',
]);

const NON_VALIDATING_METHODS = new Set<string | undefined>([
  OPTIONAL,
  NULLABLE,
  NULLISH,
  'default',
  'prefault',
  'catch',
  'describe',
  'meta',
  READONLY,
  'brand',
  'required',
  'notRequired',
  'defined',
  'nonNullable',
  'label',
  'description',
  'note',
  'tag',
  'example',
  'allow',
  'empty',
  'failover',
  'exist',
  'annotations',
  'withBrand',
]);

export function isShapeMethod(name: string | undefined): boolean {
  return SHAPE_METHODS.has(name);
}

export function isNonValidatingMethod(name: string | undefined): boolean {
  return NON_VALIDATING_METHODS.has(name);
}
