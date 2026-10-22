import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { CONFIG_FILE_NAME, configError, isPlainObject } from '../../../shared/config.mjs';
import { validateExtends } from './settings.mjs';

export function parseConfigFile(file, label) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(
      `${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  return parsed;
}

export function repositoryRootOf(directory) {
  try {
    return realpathSync(
      execFileSync('git', ['rev-parse', '--show-toplevel'], {
        cwd: directory,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim(),
    );
  } catch (error) {
    throw new Error(
      `${CONFIG_FILE_NAME}: "extends" needs the project to be inside a git repository`,
      { cause: error },
    );
  }
}

function labelOf(repositoryRoot, file) {
  return path.relative(repositoryRoot, file).split(path.sep).join('/');
}

function extendedFile({ layer, repositoryRoot }) {
  const target = path.resolve(path.dirname(layer.file), layer.config.extends);
  if (!target.startsWith(repositoryRoot + path.sep)) {
    throw configError(
      `${layer.label}: "extends" ${layer.config.extends} leaves the repository. A shared config must live inside it`,
    );
  }
  if (!existsSync(target)) {
    throw configError(
      `${layer.label}: "extends" points at ${layer.config.extends}, which does not exist`,
    );
  }
  const real = realpathSync(target);
  if (!real.startsWith(repositoryRoot + path.sep)) {
    throw configError(
      `${layer.label}: "extends" ${layer.config.extends} resolves outside the repository`,
    );
  }
  return real;
}

function hasExtends(layer) {
  return isPlainObject(layer.config) && layer.config.extends !== undefined;
}

function readLayer(file, label) {
  return { file, label, config: parseConfigFile(file, label) };
}

export function readLayers(configPath, { repositoryRoot } = {}) {
  const first = readLayer(realpathSync(configPath), CONFIG_FILE_NAME);
  const layers = [first];
  let root = repositoryRoot;
  for (const layer of layers) {
    if (hasExtends(layer)) {
      validateExtendsOf(layer);
      root ??= repositoryRootOf(path.dirname(layer.file));
      const file = extendedFile({ layer, repositoryRoot: root });
      const label = labelOf(root, file);
      rejectCycle(layers, { file, label, from: layer });
      layers.push(readLayer(file, label));
    }
  }
  return layers.toReversed();
}

function validateExtendsOf(layer) {
  try {
    validateExtends(layer.config.extends);
  } catch (error) {
    throw new Error(error.message.replace(`${CONFIG_FILE_NAME}:`, `${layer.label}:`), {
      cause: error,
    });
  }
}

function rejectCycle(layers, { file, label, from }) {
  if (layers.some((layer) => layer.file === file)) {
    const chain = [...layers.map((layer) => layer.label), label];
    throw configError(`${from.label}: "extends" forms a cycle: ${chain.join(' -> ')}`);
  }
}
