import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { relativeLocation } from './relative-paths.mjs';
import { typeScript7Options } from './typescript7-options.mjs';

export function lintTypeScriptConfig(projectConfigPath) {
  const { config, directory, extended, parsed } = parseLintConfig(projectConfigPath);
  const layers = [...extended.values()].map((entry) => entry.extendedConfig?.raw);
  const options = flattenedOptions([...layers, config], parsed.options, directory);
  const context = { directory, resolvedOptions: parsed.options };
  return JSON.stringify({
    compilerOptions: { ...typeScript7Options(options, context), noEmit: true },
    files: parsed.fileNames.map((fileName) => relativeLocation(directory, fileName)),
    ...(config.references === undefined ? {} : { references: config.references }),
  });
}

export function lintConfigSources(projectConfigPath) {
  const { config, extended } = parseLintConfig(projectConfigPath);
  return [
    ...[...extended].map(([file, entry]) => ({
      file,
      options: entry.extendedConfig?.raw?.compilerOptions ?? {},
    })),
    { file: projectConfigPath, options: config.compilerOptions ?? {} },
  ];
}

function parseLintConfig(projectConfigPath) {
  const { config, error } = ts.parseConfigFileTextToJson(
    projectConfigPath,
    readFileSync(projectConfigPath, 'utf8'),
  );
  if (error !== undefined) {
    throw new Error(`Lint TypeScript config ${projectConfigPath} is not valid JSON`);
  }
  const directory = path.dirname(projectConfigPath);
  const extended = new Map();
  const parsed = ts.parseJsonConfigFileContent(
    config,
    ts.sys,
    directory,
    undefined,
    projectConfigPath,
    undefined,
    undefined,
    extended,
  );
  return { config, directory, extended, parsed };
}

function flattenedOptions(layers, resolvedOptions, directory) {
  const declared = Object.assign({}, ...layers.map((layer) => layer?.compilerOptions ?? {}));
  return Object.fromEntries(
    Object.entries(declared)
      .filter(([name]) => Object.hasOwn(resolvedOptions, name))
      .map(([name, value]) => [name, portableValue(value, resolvedOptions[name], directory)]),
  );
}

function portableValue(declared, resolved, directory) {
  if (JSON.stringify(declared) === JSON.stringify(resolved)) return declared;
  if (isAbsolutePath(resolved)) return relativeLocation(directory, resolved);
  return Array.isArray(resolved) && resolved.length > 0 && resolved.every(isAbsolutePath)
    ? resolved.map((location) => relativeLocation(directory, location))
    : declared;
}

function isAbsolutePath(value) {
  return typeof value === 'string' && path.isAbsolute(value);
}
