import { readDependencyNames } from '../eslint-config/scope-support.mjs';

const ZOD = {
  id: 'zod',
  packages: ['zod'],
  methods: ['parse', 'safeParse', 'parseAsync', 'safeParseAsync'],
  functions: [],
  call: 'schema.safeParse',
  example: 'schema.parse or schema.safeParse',
  infer: 'z.infer<typeof schema>',
};

const VALIDATION_LIBRARIES = [
  ZOD,
  {
    id: 'valibot',
    packages: ['valibot'],
    methods: ['parse', 'safeParse', 'parseAsync', 'safeParseAsync', 'assert'],
    functions: ['parse', 'safeParse', 'parseAsync', 'safeParseAsync', 'assert'],
    call: 'v.safeParse',
    example: 'v.parse or v.safeParse',
    infer: 'v.InferOutput<typeof schema>',
  },
  {
    id: 'yup',
    packages: ['yup'],
    methods: ['validate', 'validateSync', 'cast'],
    functions: [],
    call: 'schema.validateSync',
    example: 'schema.validateSync or schema.validate',
    infer: 'InferType<typeof schema>',
  },
  {
    id: 'joi',
    packages: ['joi', '@hapi/joi'],
    methods: ['validate', 'validateAsync', 'attempt', 'assert'],
    functions: [],
    call: 'schema.validate',
    example: 'schema.validate or Joi.attempt',
    infer: undefined,
  },
  {
    id: 'io-ts',
    packages: ['io-ts'],
    methods: ['decode', 'validate'],
    functions: [],
    call: 'codec.decode',
    example: 'codec.decode',
    infer: 't.TypeOf<typeof codec>',
  },
  {
    id: 'arktype',
    packages: ['arktype'],
    methods: ['assert', 'parse'],
    functions: [],
    call: 'schema.assert',
    example: 'schema.assert',
    infer: 'typeof schema.infer',
  },
  {
    id: 'class-validator',
    packages: ['class-validator', 'class-transformer'],
    methods: ['validate', 'validateSync', 'validateOrReject', 'plainToInstance'],
    functions: ['validate', 'validateSync', 'validateOrReject', 'plainToInstance', 'plainToClass'],
    call: 'validateOrReject',
    example: 'validateOrReject or plainToInstance',
    infer: undefined,
  },
  {
    id: 'ajv',
    packages: ['ajv'],
    methods: ['validate', 'compile'],
    functions: [],
    call: 'ajv.validate',
    example: 'ajv.validate',
    infer: undefined,
  },
  {
    id: 'typebox',
    packages: ['@sinclair/typebox', 'typebox'],
    methods: ['Parse', 'Decode', 'Check', 'Assert'],
    functions: [],
    call: 'Value.Parse',
    example: 'Value.Parse or Value.Decode',
    infer: 'Static<typeof schema>',
  },
];

const LOGGER_LIBRARIES = [
  { id: 'pino', packages: ['pino', 'nestjs-pino', 'pino-http'], errorField: true },
  { id: 'bunyan', packages: ['bunyan'], errorField: true },
  { id: 'winston', packages: ['winston'], errorField: false },
  { id: 'log4js', packages: ['log4js'], errorField: false },
  { id: 'loglevel', packages: ['loglevel'], errorField: false },
  { id: 'consola', packages: ['consola'], errorField: false },
  { id: 'tslog', packages: ['tslog'], errorField: false },
  { id: 'roarr', packages: ['roarr'], errorField: false },
  { id: 'signale', packages: ['signale'], errorField: false },
];

function detect(table, names) {
  return table
    .filter(({ packages }) => packages.some((name) => names.includes(name)))
    .map(({ id }) => id);
}

export function detectLibraries(projectRoot) {
  const names = readDependencyNames(projectRoot);
  return {
    validation: detect(VALIDATION_LIBRARIES, names),
    logger: detect(LOGGER_LIBRARIES, names),
  };
}

function validationLibraries(libraries) {
  const detected = VALIDATION_LIBRARIES.filter(({ id }) => libraries?.validation?.includes(id));
  return detected.length === 0 ? [ZOD] : detected;
}

export function validationBehavior(libraries) {
  const accepted = validationLibraries(libraries);
  const [primary] = accepted;
  return {
    name: primary.id,
    call: primary.call,
    example: primary.example,
    infer: primary.infer,
    isZod: primary.id === 'zod',
    methods: new Set(accepted.flatMap(({ methods }) => methods)),
    functions: new Set(accepted.flatMap(({ functions }) => functions)),
  };
}

export function appliesPinoErrorShape(libraries) {
  const detected = LOGGER_LIBRARIES.filter(({ id }) => libraries?.logger?.includes(id));
  return detected.length === 0 || detected.some(({ errorField }) => errorField);
}
