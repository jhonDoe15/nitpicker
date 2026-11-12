import path from 'node:path';
import { readSource } from '../../migrations/revision-graph.mjs';

const CONFIG_FILE = /^sqlc\.(?:ya?ml|json)$/u;
const SQL_FILE = /\.sql$/iu;
const DOWN_FILE = /\.down\.sql$/iu;
const GLOB_PART = /[*?[\]]/u;
const ESCAPED = /[.+^${}()|\\]/gu;
const MYSQL_ENGINE = 'mysql';

function parsedConfig(file, text, parseYaml) {
  if (file.endsWith('.json')) {
    try {
      return JSON.parse(text);
    } catch {
      return undefined;
    }
  }
  return parseYaml?.(text)[0];
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
      schema: [entry.schema].flat().filter((each) => typeof each === 'string'),
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

export function sqlcSchemaFiles(projectRoot, files, parseYaml) {
  const sqlFiles = files.filter(isSchemaFile);
  const found = new Map();
  for (const file of files.filter((name) => CONFIG_FILE.test(path.posix.basename(name)))) {
    const text = readSource(projectRoot, file);
    const config = text === undefined ? undefined : parsedConfig(file, text, parseYaml);
    for (const { engine, schema } of configEntries(config)) {
      const matchers = schema.map((each) => targetMatcher(path.posix.dirname(file), each));
      for (const sqlFile of sqlFiles.filter((name) => matchers.some((matches) => matches(name)))) {
        found.set(sqlFile, found.get(sqlFile) === false ? false : engine !== MYSQL_ENGINE);
      }
    }
  }
  return {
    checked: [...found].filter(([, checked]) => checked).map(([file]) => file),
    mysql: new Set([...found].filter(([, checked]) => !checked).map(([file]) => file)),
  };
}
