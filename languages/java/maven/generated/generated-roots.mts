import path from 'node:path';
import { isGeneratedJvm } from '../../adapters/generated/generated-sources.mjs';
import { fieldOf, textOf } from '../../../../shared/values/readers.mts';
import ROOT_RULES from '../../gradle/generated/generated-roots.json' with { type: 'json' };

export type GeneratedLocation = {
  readonly basedir: string;
  readonly buildDirectory?: string | undefined;
};

const GENERATED_SETTING = 'generated';
const ANALYZE_KEY = 'analyze';

export const PROCESSOR_OUTPUT = textOf(fieldOf(ROOT_RULES, 'processorOutput'));
const PROBE_FILE = textOf(fieldOf(ROOT_RULES, 'probeFile'));

export function inside(parent: string, directory: string): boolean {
  const relative = path.relative(parent, directory);
  return relative === '' || !(relative.startsWith('..') || path.isAbsolute(relative));
}

function strictlyInside(parent: string, directory: string): boolean {
  return path.relative(parent, directory) !== '' && inside(parent, directory);
}

export function buildDirectoryOf(module: GeneratedLocation): string {
  return module.buildDirectory ?? path.join(module.basedir, 'target');
}

export function analyzesGenerated(configs: unknown): boolean {
  return fieldOf(fieldOf(configs, GENERATED_SETTING), ANALYZE_KEY) === true;
}

export function isGeneratedRoot(module: GeneratedLocation, root: string): boolean {
  const resolved = path.resolve(module.basedir, root);
  const build = path.resolve(module.basedir, buildDirectoryOf(module));
  const relative = path.relative(module.basedir, resolved).split(path.sep).join('/');
  return (
    (strictlyInside(module.basedir, build) && inside(build, resolved)) ||
    isGeneratedJvm(module.basedir, `${relative}/${PROBE_FILE}`)
  );
}

export function handWrittenRoots(
  module: GeneratedLocation,
  roots: readonly string[],
  configs: unknown,
): string[] {
  return analyzesGenerated(configs)
    ? [...roots]
    : roots.filter((root) => !isGeneratedRoot(module, root));
}

export function generatedRoots(module: GeneratedLocation, roots: readonly string[]): string[] {
  return roots.filter((root) => isGeneratedRoot(module, root));
}
