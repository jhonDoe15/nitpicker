import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { CONFIG_FILE_NAME } from '../../../shared/config.mts';
import { GIT_TIMEOUT_MS } from '../../../shared/processes/deadlines.mts';
import type { ConfigLayer } from '../../../shared/values/config-types.mts';
import { fieldOf, isPlainObject, messageOf, textOf } from '../../../shared/values/readers.mts';
import { validateExtends } from './settings.mts';

type Extension = { readonly file: string; readonly label: string; readonly from: ConfigLayer };

export function parseConfigFile(file: string, label: string): unknown {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${messageOf(error)}`, { cause: error });
  }
  return parsed;
}

export function repositoryRootOf(directory: string): string {
  try {
    return realpathSync(
      execFileSync('git', ['rev-parse', '--show-toplevel'], {
        cwd: directory,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: GIT_TIMEOUT_MS,
      }).trim(),
    );
  } catch (error) {
    throw new Error(
      `${CONFIG_FILE_NAME}: "extends" needs the project to be inside a git repository`,
      { cause: error },
    );
  }
}

function labelOf(repositoryRoot: string, file: string): string {
  return path.relative(repositoryRoot, file).split(path.sep).join('/');
}

function extendedFile({
  layer,
  repositoryRoot,
}: {
  readonly layer: ConfigLayer;
  readonly repositoryRoot: string;
}): string {
  const extension = textOf(fieldOf(layer.config, 'extends'));
  const target = path.resolve(path.dirname(layer.file), extension);
  if (!target.startsWith(repositoryRoot + path.sep)) {
    throw new Error(
      `${layer.label}: "extends" ${extension} leaves the repository. A shared config must live inside it`,
    );
  }
  if (!(existsSync(target) && statSync(target).isFile())) {
    throw new Error(`${layer.label}: "extends" points at ${extension}, which is not a file`);
  }
  const real = realpathSync(target);
  if (!real.startsWith(repositoryRoot + path.sep)) {
    throw new Error(
      `${layer.label}: "extends" ${extension} is a link that resolves outside the repository`,
    );
  }
  return real;
}

function hasExtends(layer: ConfigLayer): boolean {
  return isPlainObject(layer.config) && layer.config['extends'] !== undefined;
}

function readLayer(file: string, label: string): ConfigLayer {
  return { file, label, config: parseConfigFile(file, label) };
}

export function readLayers(
  configPath: string,
  { repositoryRoot }: { readonly repositoryRoot?: string | undefined } = {},
): ConfigLayer[] {
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

function validateExtendsOf(layer: ConfigLayer): void {
  try {
    validateExtends(fieldOf(layer.config, 'extends'));
  } catch (error) {
    throw new Error(
      messageOf(error).replace(`${CONFIG_FILE_NAME}:`, () => `${layer.label}:`),
      {
        cause: error,
      },
    );
  }
}

function rejectCycle(layers: readonly ConfigLayer[], { file, label, from }: Extension): void {
  if (layers.some((layer) => layer.file === file)) {
    const chain = [...layers.map((layer) => layer.label), label];
    throw new Error(`${from.label}: "extends" forms a cycle: ${chain.join(' -> ')}`);
  }
}
