const PYDANTIC = 'pydantic';
const MSGSPEC = 'msgspec';
const CATTRS = 'cattrs';
const MARSHMALLOW = 'marshmallow';
const VOLUPTUOUS = 'voluptuous';
const CERBERUS = 'cerberus';
type Validator = {
  readonly name: string;
  readonly packages: readonly string[];
  readonly importRoots: readonly string[];
  readonly call: string;
};

export const VALIDATORS: readonly [Validator, ...Validator[]] = [
  {
    name: PYDANTIC,
    packages: [PYDANTIC, 'pydantic-settings'],
    importRoots: [PYDANTIC, 'pydantic_settings'],
    call: 'Model.model_validate(data)',
  },
  {
    name: MSGSPEC,
    packages: [MSGSPEC],
    importRoots: [MSGSPEC],
    call: 'msgspec.json.decode(raw, type=Model)',
  },
  {
    name: CATTRS,
    packages: [CATTRS, 'cattr', 'attrs', 'attr'],
    importRoots: [CATTRS],
    call: 'cattrs.structure(data, Model)',
  },
  {
    name: MARSHMALLOW,
    packages: [MARSHMALLOW, 'marshmallow-dataclass', 'marshmallow-enum'],
    importRoots: [MARSHMALLOW, 'marshmallow_dataclass'],
    call: 'Schema().load(data)',
  },
  {
    name: 'dataclasses-json',
    packages: ['dataclasses-json'],
    importRoots: ['dataclasses_json'],
    call: 'Model.from_dict(data)',
  },
  {
    name: VOLUPTUOUS,
    packages: [VOLUPTUOUS],
    importRoots: [VOLUPTUOUS],
    call: 'Schema(spec)(data)',
  },
  {
    name: CERBERUS,
    packages: [CERBERUS],
    importRoots: [CERBERUS],
    call: 'Validator(schema).validate(data)',
  },
];

export const LOGGERS = [
  { name: 'structlog', packages: ['structlog'] },
  { name: 'loguru', packages: ['loguru'] },
];

export const DATABASES = [
  { name: 'asyncpg', packages: ['asyncpg'] },
  {
    name: 'format',
    packages: ['psycopg', 'psycopg2', 'psycopg2-binary', 'pymysql', 'mysqlclient', 'aiomysql'],
  },
  { name: 'format', packages: ['mysql-connector-python', 'aiopg'] },
  { name: 'named', packages: ['databases'] },
  { name: 'sqlite', packages: ['aiosqlite'] },
];

export const DEFAULT_DATABASE = 'format';
export const DEFAULT_LOGGER = 'logging';
export const DEFAULT_VALIDATOR = 'pydantic';

export function validatorNamed(name: string): Validator {
  return VALIDATORS.find((validator) => validator.name === name) ?? VALIDATORS[0];
}
