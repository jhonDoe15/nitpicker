import { extensionOf, isInertPath } from './inert-files.mts';
import { isGlobalInput } from './build-files.mts';

export type SourceInputs = { readonly scope: 'sources'; readonly extensions: readonly string[] };
type ScopeInputs = {
  readonly scope: 'everything' | 'repository' | 'execution';
};
export type Inputs = ScopeInputs | SourceInputs;
export type InputChange = { readonly path: string; readonly kind: string };

export const EVERYTHING_INPUTS = Object.freeze({ scope: 'everything' });
export const REPOSITORY_INPUTS = Object.freeze({ scope: 'repository' });
export const EXECUTION_INPUTS = Object.freeze({ scope: 'execution' });

const CONFIG_EXTENSIONS = [
  'json',
  'jsonc',
  'json5',
  'yaml',
  'yml',
  'toml',
  'ini',
  'cfg',
  'conf',
  'xml',
  'properties',
];

export function sourceInputs(extensions: readonly string[]): SourceInputs {
  return Object.freeze({
    scope: 'sources',
    extensions: Object.freeze([...new Set([...extensions, ...CONFIG_EXTENSIONS])]),
  });
}

function isSourceLike(inputs: SourceInputs, file: string): boolean {
  const name = file.slice(file.lastIndexOf('/') + 1);
  const extension = extensionOf(file);
  return name.startsWith('.') || extension === '' || inputs.extensions.includes(extension);
}

export function touchesInputs<Change extends InputChange>(
  inputs: Inputs | undefined,
  change: Change,
  {
    readsContent = () => true,
    roots = [],
  }: {
    readonly readsContent?: (change: Change) => boolean;
    readonly roots?: readonly string[];
  } = {},
): boolean {
  const { path: file } = change;
  if (inputs === undefined || inputs.scope === 'everything' || isGlobalInput(file)) {
    return true;
  }
  if (!isInertPath(file, { roots, images: inputs.scope !== 'execution' })) {
    return inputs.scope !== 'sources' || isSourceLike(inputs, file);
  }
  return inputs.scope === 'repository' && readsContent(change);
}
