import path from 'node:path';
import { parsedJsonc } from '../../../jsonc/jsonc.mjs';
import { readSource } from '../../migrations/revision-graph.mjs';

const CONFIG_FILE = /^sqlc\.(?:ya?ml|json)$/u;
const SQL_FILE = /\.sql$/u;
const DOWN_FILE = /\.down\.sql$/u;
const GLOB_PART = /[*?[\]]/u;
const ESCAPED = /[.+^${}()|\\]/gu;
const MYSQL_ENGINE = 'mysql';

function parsedConfig(file, text, parseYaml) {
  if (!file.endsWith('.json')) {
    return parseYaml?.(text)[0];
  }
  const parsed = parsedJsonc(text);
  return parsed.kind === 'json' ? parsed.value : undefined;
}

function isRelativePath(value) {
  return typeof value === 'string' && value.trim() !== '' && !path.posix.isAbsolute(value);
}

function configEntries(config) {
  if (config === null || typeof config !== 'object') {
    return [];
  }
  return [config.sql, config.packages]
    .filter(Array.isArray)
    .flat()
    .filter((entry) => entry !== null && typeof entry === 'object')
    .map((entry) => ({
      engine: typeof entry.engine === 'string' ? entry.engine : 'postgresql',
      schema: [entry.schema].flat().filter(isRelativePath),
    }));
}

function globPattern(target) {
  const source = target
    .replaceAll(ESCAPED, '\\$&')
    .replaceAll('*', '[^/]*')
    .replaceAll('?', '[^/]');
  return new RegExp(`^${source}$`, 'u');
}

function targetMatcher(folder, schema) {
  const target = path.posix.normalize(path.posix.join(folder, schema)).replace(/\/$/u, '');
  if (GLOB_PART.test(target)) {
    const pattern = globPattern(target);
    return (file) => pattern.test(file) || pattern.test(path.posix.dirname(file));
  }
  return (file) => file === target || path.posix.dirname(file) === target;
}

function isSchemaFile(file) {
  const base = path.posix.basename(file);
  return SQL_FILE.test(base) && !DOWN_FILE.test(base) && !base.startsWith('.');
}

function configTargets(projectRoot, file, parseYaml) {
  const text = readSource(projectRoot, file);
  const config = text === undefined ? undefined : parsedConfig(file, text, parseYaml);
  return configEntries(config).map(({ engine, schema }) => ({
    checked: engine !== MYSQL_ENGINE,
    matchers: schema.map((each) => targetMatcher(path.posix.dirname(file), each)),
  }));
}

export function sqlcSchemaFiles(projectRoot, files, parseYaml) {
  const sqlFiles = files.filter(isSchemaFile);
  const targets = files
    .filter((name) => CONFIG_FILE.test(path.posix.basename(name)))
    .flatMap((file) => configTargets(projectRoot, file, parseYaml));
  const found = new Map();
  for (const { checked, matchers } of targets) {
    for (const sqlFile of sqlFiles.filter((name) => matchers.some((matches) => matches(name)))) {
      found.set(sqlFile, found.get(sqlFile) !== false && checked);
    }
  }
  return {
    checked: [...found].filter(([, checked]) => checked).map(([file]) => file),
    mysql: new Set([...found].filter(([, checked]) => !checked).map(([file]) => file)),
  };
}
