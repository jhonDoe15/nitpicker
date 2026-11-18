import { readFileSync } from 'node:fs';
import path from 'node:path';
import { readStamped as untypedReadStamped } from '../../../../modules/stamped-file-cache.mjs';

export type PrismaField = {
  readonly type: string;
  readonly optional: boolean;
  readonly list: boolean;
  readonly id: boolean;
  readonly unique: boolean;
  readonly native: string | undefined;
};

export type PrismaSchema = {
  readonly provider: string | undefined;
  readonly models: ReadonlyMap<string, ReadonlyMap<string, PrismaField>>;
  readonly enums: ReadonlySet<string>;
};

export type PrismaKey = {
  readonly primary: boolean;
  readonly unique: boolean;
  readonly type: 'string' | 'number';
  readonly comparable: boolean;
};

type Cache<Value> = Map<string, { readonly stamp: string; readonly value: Value }>;

const readStamped: <Value>(
  cache: Cache<Value>,
  file: string,
  read: (file: string) => Value,
) => Value | undefined = untypedReadStamped;

const schemas: Cache<PrismaSchema> = new Map();
const BLOCK = /^(model|enum|datasource|view|type)\s+(\w+)\s*\{([\s\S]*?)^\}/gmu;
const FIELD = /^\s*(\w+)\s+(\w+)(\?|\[\])?(.*)$/u;
const PROVIDER = /provider\s*=\s*"([^"]+)"/u;
const NATIVE = /@db\.(\w+)/u;
const SCALARS = new Set([
  'String',
  'Int',
  'BigInt',
  'Float',
  'Decimal',
  'Boolean',
  'DateTime',
  'Json',
  'Bytes',
]);
const KEY_TYPES = new Map<string, 'string' | 'number'>([
  ['String', 'string'],
  ['Int', 'number'],
]);
const EXACT_PROVIDERS = new Set(['postgresql', 'cockroachdb', 'sqlite', 'mysql', 'sqlserver']);
const CASE_FOLDING_PROVIDERS = new Set(['mysql', 'sqlserver']);
const TEXT_NATIVES = new Set(['VarChar', 'Text']);
const NUMBER_NATIVES = new Set(['Int', 'Integer', 'SmallInt']);

function stripComment(line: string): string {
  const index = line.indexOf('//');
  const quotes = index === -1 ? 0 : line.slice(0, index).split('"').length - 1;
  return index !== -1 && quotes % 2 === 0 ? line.slice(0, index) : line;
}

function fieldOf(line: string): [string, PrismaField] | undefined {
  const match = FIELD.exec(line);
  const [, name, type, suffix = '', attributes = ''] = match ?? [];
  if (name === undefined || type === undefined || line.trimStart().startsWith('@@')) {
    return undefined;
  }
  return [
    name,
    {
      type,
      optional: suffix === '?',
      list: suffix === '[]',
      id: /(?<!@)@id\b/u.test(attributes),
      unique: /(?<!@)@unique\b/u.test(attributes),
      native: NATIVE.exec(attributes)?.[1],
    },
  ];
}

function parseSchema(file: string): PrismaSchema {
  const text = readFileSync(file, 'utf8').split('\n').map(stripComment).join('\n');
  const models = new Map<string, ReadonlyMap<string, PrismaField>>();
  const enums = new Set<string>();
  let provider: string | undefined;
  for (const [, kind, name = '', body = ''] of text.matchAll(BLOCK)) {
    if (kind === 'enum') {
      enums.add(name);
    } else if (kind === 'datasource') {
      provider = PROVIDER.exec(body)?.[1];
    } else {
      models.set(
        name,
        new Map(
          body
            .split('\n')
            .map(fieldOf)
            .filter((entry) => entry !== undefined),
        ),
      );
    }
  }
  return { provider, models, enums };
}

export function prismaSchema(declarationFile: string): PrismaSchema | undefined {
  const file = path.join(path.dirname(declarationFile), 'schema.prisma');
  try {
    return readStamped(schemas, file, parseSchema);
  } catch {
    return undefined;
  }
}

export function isScalarField(schema: PrismaSchema, field: PrismaField): boolean {
  return !field.list && (SCALARS.has(field.type) || schema.enums.has(field.type));
}

export function prismaKey(
  schema: PrismaSchema,
  model: string,
  property: string,
): PrismaKey | undefined {
  const field = schema.models.get(model)?.get(property);
  const type = field === undefined ? undefined : KEY_TYPES.get(field.type);
  if (field === undefined || type === undefined || field.optional || field.list) {
    return undefined;
  }
  const { provider } = schema;
  const natives = type === 'string' ? TEXT_NATIVES : NUMBER_NATIVES;
  const exact =
    provider !== undefined &&
    EXACT_PROVIDERS.has(provider) &&
    (field.native === undefined || natives.has(field.native)) &&
    !(type === 'string' && CASE_FOLDING_PROVIDERS.has(provider));
  return { primary: field.id, unique: field.unique, type, comparable: exact };
}
