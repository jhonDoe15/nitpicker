export const VALIDATORS = [
  {
    name: 'pydantic',
    packages: ['pydantic', 'pydantic-settings'],
    importRoots: ['pydantic', 'pydantic_settings'],
    call: 'Model.model_validate(data)',
  },
  {
    name: 'msgspec',
    packages: ['msgspec'],
    importRoots: ['msgspec'],
    call: 'msgspec.json.decode(raw, type=Model)',
  },
  {
    name: 'cattrs',
    packages: ['cattrs', 'cattr', 'attrs', 'attr'],
    importRoots: ['cattrs'],
    call: 'cattrs.structure(data, Model)',
  },
  {
    name: 'marshmallow',
    packages: ['marshmallow', 'marshmallow-dataclass', 'marshmallow-enum'],
    importRoots: ['marshmallow', 'marshmallow_dataclass'],
    call: 'Schema().load(data)',
  },
  {
    name: 'dataclasses-json',
    packages: ['dataclasses-json'],
    importRoots: ['dataclasses_json'],
    call: 'Model.from_dict(data)',
  },
  {
    name: 'voluptuous',
    packages: ['voluptuous'],
    importRoots: ['voluptuous'],
    call: 'Schema(spec)(data)',
  },
  {
    name: 'cerberus',
    packages: ['cerberus'],
    importRoots: ['cerberus'],
    call: 'Validator(schema).validate(data)',
  },
];

export const LOGGERS = [
  { name: 'structlog', packages: ['structlog'] },
  { name: 'loguru', packages: ['loguru'] },
];

export const DEFAULT_LOGGER = 'logging';
export const DEFAULT_VALIDATOR = 'pydantic';

export function validatorNamed(name) {
  return VALIDATORS.find((validator) => validator.name === name) ?? VALIDATORS[0];
}
