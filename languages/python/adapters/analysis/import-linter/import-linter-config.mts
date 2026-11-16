import { readInside } from '../../../../../shared/conventions/read-inside.mjs';
import { parseIni } from '../../configuration/ini-parser.mts';
import {
  fieldOf,
  fieldsOf,
  listOf,
  messageOf,
  textOf,
} from '../../../../../shared/values/readers.mts';
import { attempt, parseToml } from '../../project-tools/project-tool-layers.mts';

const PYPROJECT = 'pyproject.toml';
const IMPORT_LINTER_FILES = ['setup.cfg', '.importlinter', PYPROJECT];
const SECTION = 'importlinter';
const CONTRACT_PREFIX = `${SECTION}:`;

type Options = Record<string, string | string[]>;
type Contract = { id: string; options: Options };
type Config = { session: Options; contracts: Contract[] };
export type ImportLinterConfig = Config & { file: string };

function iniValue(value: string): string | string[] {
  return value.includes('\n')
    ? value
        .split('\n')
        .map((entry) => entry.trim())
        .filter((entry) => entry !== '')
    : value;
}

function iniOptions(options: ReadonlyMap<string, string>): Options {
  return Object.fromEntries([...options].map(([key, value]) => [key, iniValue(value)]));
}

function iniConfig(text: string): Config | undefined {
  const sections = parseIni(text);
  const session = sections.get(SECTION);
  if (session === undefined) {
    return undefined;
  }
  return {
    session: iniOptions(session),
    contracts: [...sections]
      .filter(([name]) => name.startsWith(CONTRACT_PREFIX))
      .map(([name, options]) => ({
        id: name.split(':').at(-1) ?? name,
        options: iniOptions(options),
      })),
  };
}

function tomlValue(value: unknown): string | string[] {
  if (Array.isArray(value)) {
    return value.map(String);
  }
  if (typeof value === 'boolean') {
    return value ? 'True' : 'False';
  }
  return textOf(value);
}

function tomlOptions(table: Readonly<Record<string, unknown>>): Options {
  return Object.fromEntries(Object.entries(table).map(([key, value]) => [key, tomlValue(value)]));
}

function tomlConfig(text: string): Config | undefined {
  const table = fieldsOf(fieldOf(fieldOf(parseToml(text), 'tool'), 'importlinter'));
  if (Object.keys(table).length === 0) {
    return undefined;
  }
  const { contracts, ...session } = table;
  return {
    session: tomlOptions(session),
    contracts: listOf(contracts).map((contract, index) => ({
      id: textOf(fieldOf(contract, 'id') ?? fieldOf(contract, 'name') ?? index),
      options: tomlOptions(fieldsOf(contract)),
    })),
  };
}

function configIn(root: string, file: string): ImportLinterConfig | undefined {
  const read = readInside(root, file, 'utf8');
  if (read === undefined) {
    return undefined;
  }
  const text = read.toString();
  const { value, error } = attempt(() => (file === PYPROJECT ? tomlConfig(text) : iniConfig(text)));
  if (error !== undefined) {
    throw Object.assign(new Error(`${file}: ${messageOf(error)}`, { cause: error }), { file });
  }
  return value === undefined ? undefined : { file, ...value };
}

export function readImportLinterConfig(root: string): ImportLinterConfig | undefined {
  for (const file of IMPORT_LINTER_FILES) {
    const config = configIn(root, file);
    if (config !== undefined) {
      return config;
    }
  }
  return undefined;
}
