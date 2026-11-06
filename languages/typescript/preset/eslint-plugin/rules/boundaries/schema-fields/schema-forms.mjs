function call(display, options = {}) {
  return { kind: 'call', display, ...options };
}

function value(display) {
  return { kind: 'value', display };
}

function forms(spec) {
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

export const SCHEMA_FORMS = {
  zod: forms({
    namespaces: ['z'],
    globals: ['z', 'zod'],
    objects: ['object', 'strictObject', 'looseObject'],
    leaves: { unknown: call('z.unknown()'), any: call('z.any()') },
    casts: ['custom'],
    containers: [
      'record',
      'array',
      'set',
      'map',
      'tuple',
      'optional',
      'nullable',
      'nullish',
      'readonly',
    ],
    elementMethods: { array: 'receiver' },
    example: 'z.string().trim().min(1) or z.email()',
    allowed: 'z.object({...}), which drops unknown keys, or z.strictObject({...}) to reject them',
    loose: [
      { factory: 'looseObject', form: 'z.looseObject()' },
      { method: 'passthrough', form: '.passthrough()' },
      { method: 'loose', form: '.loose()' },
      { method: 'catchall', rest: 0, form: '.catchall(z.unknown())' },
    ],
  }),
  valibot: forms({
    objects: ['object', 'strictObject', 'looseObject', 'objectWithRest'],
    leaves: { unknown: call('v.unknown()'), any: call('v.any()') },
    containers: [
      'array',
      'record',
      'set',
      'map',
      'tuple',
      'optional',
      'nullable',
      'nullish',
      'exactOptional',
      'undefinedable',
      'nonOptional',
      'nonNullable',
      'nonNullish',
    ],
    example: 'v.pipe(v.string(), v.trim(), v.minLength(1)) or v.pipe(v.string(), v.email())',
    allowed: 'v.object({...}), which drops unknown keys, or v.strictObject({...}) to reject them',
    loose: [
      { factory: 'looseObject', form: 'v.looseObject()' },
      { factory: 'objectWithRest', rest: 1, form: 'v.objectWithRest(..., v.unknown())' },
    ],
  }),
  yup: forms({
    objects: ['object'],
    leaves: { mixed: call('yup.mixed()', { noArguments: true }) },
    containers: ['array'],
    elementMethods: { of: 'arguments' },
    example: 'yup.string().trim().required() or mixed().oneOf([...]) or mixed().test(...)',
  }),
  joi: forms({
    objects: ['object'],
    leaves: { any: call('Joi.any()') },
    containers: ['array'],
    elementMethods: { items: 'arguments' },
    example: 'Joi.string().trim().min(1) or Joi.any().valid(...) or Joi.any().custom(...)',
    allowed: 'Joi.object({...}) as it is, which rejects unknown keys, or name the extra keys',
    loose: [
      { method: 'unknown', unlessFalse: true, form: '.unknown()' },
      { method: 'pattern', rest: 1, form: '.pattern(key, Joi.any())' },
      { method: 'prefs', option: [0, 'allowUnknown'], form: 'allowUnknown: true' },
      { method: 'preferences', option: [0, 'allowUnknown'], form: 'allowUnknown: true' },
      { method: 'options', option: [0, 'allowUnknown'], form: 'allowUnknown: true' },
    ],
  }),
  'io-ts': forms({
    objects: ['type', 'strict', 'partial'],
    leaves: { unknown: value('t.unknown'), any: value('t.any') },
    containers: ['array', 'readonlyArray', 'record', 'readonly', 'tuple'],
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
    objects: ['Object'],
    leaves: { Unknown: call('Type.Unknown()'), Any: call('Type.Any()') },
    containers: ['Array', 'Record', 'Tuple', 'Optional', 'Readonly', 'ReadonlyOptional'],
    example: "Type.String({ minLength: 1 }) or Type.String({ format: 'email' })",
    allowed:
      'Type.Object({...}) without additionalProperties, which Value.Parse cleans of unknown keys, or additionalProperties: false to reject them',
    loose: [
      {
        factory: 'Object',
        option: [1, 'additionalProperties'],
        form: 'additionalProperties: true or an unchecked schema',
      },
    ],
  }),
  superstruct: forms({
    objects: ['object', 'type', 'partial'],
    leaves: { unknown: call('unknown()'), any: call('any()') },
    containers: ['array', 'record', 'set', 'map', 'tuple', 'optional', 'nullable', 'defaulted'],
    example: 'nonempty(string()) or refine(string(), ...)',
  }),
  runtypes: forms({
    objects: ['Object', 'Record', 'Partial'],
    leaves: { Unknown: value('Unknown') },
    containers: ['Array', 'Dictionary', 'Record', 'Tuple', 'Optional'],
    example: 'String.withConstraint(...) or a literal union',
  }),
  effect: forms({
    namespaces: ['Schema'],
    objects: ['Struct'],
    leaves: { Unknown: value('Schema.Unknown'), Any: value('Schema.Any') },
    containers: [
      'Array',
      'NonEmptyArray',
      'Record',
      'Tuple',
      'optional',
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
    objects: ['object'],
    leaves: { unknown: call('v.unknown()') },
    containers: ['array', 'record', 'tuple'],
    example: 'v.string().assert((value) => value.length > 0)',
    allowed: 'v.object({...}), which rejects unknown keys, or .rest() with a validating schema',
    loose: [{ method: 'rest', rest: 0, form: '.rest(v.unknown())' }],
  }),
};

const SHAPE_METHODS = new Set(['extend', 'safeExtend', 'augment', 'shape', 'keys', 'append']);

const NON_VALIDATING_METHODS = new Set([
  'optional',
  'nullable',
  'nullish',
  'default',
  'prefault',
  'catch',
  'describe',
  'meta',
  'readonly',
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

export function isShapeMethod(name) {
  return SHAPE_METHODS.has(name);
}

export function isNonValidatingMethod(name) {
  return NON_VALIDATING_METHODS.has(name);
}
