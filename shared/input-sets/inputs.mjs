import { extensionOf, isInertPath } from './inert-files.mjs';
import { isGlobalInput } from './build-files.mjs';

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

export function sourceInputs(extensions) {
  return Object.freeze({
    scope: 'sources',
    extensions: Object.freeze([...new Set([...extensions, ...CONFIG_EXTENSIONS])]),
  });
}

function isSourceLike(inputs, file) {
  const name = file.slice(file.lastIndexOf('/') + 1);
  const extension = extensionOf(file);
  return name.startsWith('.') || extension === '' || inputs.extensions.includes(extension);
}

export function touchesInputs(inputs, change, { readsContent = () => true, roots = [] } = {}) {
  const { path: file } = change;
  if (inputs === undefined || inputs.scope === 'everything' || isGlobalInput(file)) {
    return true;
  }
  if (!isInertPath(file, { roots, images: inputs.scope !== 'execution' })) {
    return inputs.scope === 'sources' ? isSourceLike(inputs, file) : true;
  }
  return inputs.scope === 'repository' && readsContent(change);
}
