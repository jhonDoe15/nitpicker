import { readFileSync } from 'node:fs';
import path from 'node:path';
import { codeExtensions } from '../layout.mjs';

const scopePackages = {
  react: ['react'],
  i18n: ['react-intl', '@formatjs/intl'],
};

const storySuffixes = ['stories', 'story'];
export const storyGlobs = [`**/*.{${storySuffixes.join(',')}}.${codeExtensions}`];

export function readManifest(projectRoot) {
  try {
    return JSON.parse(readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
  } catch {
    return {};
  }
}

export function readDependencyNames(projectRoot) {
  const manifest = readManifest(projectRoot);
  return [
    ...Object.keys(manifest?.dependencies ?? {}),
    ...Object.keys(manifest?.devDependencies ?? {}),
  ];
}

export function hasScopePackage(projectRoot, scope) {
  return readDependencyNames(projectRoot).some((name) => scopePackages[scope].includes(name));
}

export function isReactProject({ projectRoot, react = {} }) {
  return react.enabled ?? hasScopePackage(projectRoot, 'react');
}

export function productionScope(layout) {
  return {
    files: layout.sourceGlobs,
    ignores: [...layout.testGlobs, ...layout.sourceTestDirectoryGlobs],
  };
}
