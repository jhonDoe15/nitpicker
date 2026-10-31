import { readInside } from '../../../../../shared/conventions/read-inside.mjs';
import { parseIni } from '../../configuration/ini-parser.mjs';
import { attempt, parseToml } from '../../project-tools/project-tool-layers.mjs';

const PYPROJECT = 'pyproject.toml';
const IMPORT_LINTER_FILES = ['setup.cfg', '.importlinter', PYPROJECT];
const SECTION = 'importlinter';
const CONTRACT_PREFIX = `${SECTION}:`;

function iniValue(value) {
  return value.includes('\n')
    ? value
        .split('\n')
        .map((entry) => entry.trim())
        .filter((entry) => entry !== '')
    : value;
}

function iniOptions(options) {
  return Object.fromEntries([...options].map(([key, value]) => [key, iniValue(value)]));
}

function iniConfig(text) {
  const sections = parseIni(text);
  if (!sections.has(SECTION)) {
    return undefined;
  }
  return {
    session: iniOptions(sections.get(SECTION)),
    contracts: [...sections]
      .filter(([name]) => name.startsWith(CONTRACT_PREFIX))
      .map(([name, options]) => ({ id: name.split(':').at(-1), options: iniOptions(options) })),
  };
}

function tomlValue(value) {
  if (Array.isArray(value)) {
    return value.map(String);
  }
  if (typeof value === 'boolean') {
    return value ? 'True' : 'False';
  }
  return String(value);
}

function tomlOptions(table) {
  return Object.fromEntries(Object.entries(table).map(([key, value]) => [key, tomlValue(value)]));
}

function tomlConfig(text) {
  const table = parseToml(text).tool?.importlinter;
  if (table === undefined || Object.keys(table).length === 0) {
    return undefined;
  }
  const { contracts = [], ...session } = table;
  return {
    session: tomlOptions(session),
    contracts: contracts.map((contract, index) => ({
      id: String(contract.id ?? contract.name ?? index),
      options: tomlOptions(contract),
    })),
  };
}

function configIn(root, file) {
  const text = readInside(root, file, 'utf8');
  if (text === undefined) {
    return undefined;
  }
  const { value, error } = attempt(() => (file === PYPROJECT ? tomlConfig(text) : iniConfig(text)));
  if (error !== undefined) {
    throw Object.assign(new Error(`${file}: ${error.message}`, { cause: error }), { file });
  }
  return value === undefined ? undefined : { file, ...value };
}

export function readImportLinterConfig(root) {
  for (const file of IMPORT_LINTER_FILES) {
    const config = configIn(root, file);
    if (config !== undefined) {
      return config;
    }
  }
  return undefined;
}
