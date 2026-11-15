import { globsMatcher, prefixesOf, resolveLayout } from '../types/typed-views.mts';
import type { PolicyConfig } from '../types/policy-types.mts';

export const PYTHON = 'python';
const GRADLE_EXTENSIONS = ['java', 'kt', 'kts'];
const PRESET_EXTENSIONS = new Map([
  [PYTHON, ['py']],
  ['go', ['go']],
  ['java', GRADLE_EXTENSIONS],
  ['kotlin', GRADLE_EXTENSIONS],
]);

export function matcherOf(globs: readonly string[] = []): (file: string) => boolean {
  return globsMatcher([...globs]);
}

export function isUnder(file: string, root: string): boolean {
  return root === '.' || root === '' || file === root || file.startsWith(`${root}/`);
}

export function usesLayout(config: PolicyConfig): boolean {
  return config.preset === undefined || !PRESET_EXTENSIONS.has(config.preset);
}

export function layoutOf(config: PolicyConfig): ReturnType<typeof resolveLayout> {
  return resolveLayout(config.layout, [], { javascript: config.preset === 'javascript' });
}

function extensionsOf(config: PolicyConfig): readonly string[] {
  return (
    (config.preset === undefined ? undefined : PRESET_EXTENSIONS.get(config.preset)) ??
    layoutOf(config).extensions
  );
}

export function foldersOf(file: string): string[] {
  return prefixesOf(file, '/');
}

export function codeOf(files: readonly string[], config: PolicyConfig): string[] {
  const extensions = new Set(extensionsOf(config));
  return files.filter((file) => extensions.has(file.slice(file.lastIndexOf('.') + 1)));
}
