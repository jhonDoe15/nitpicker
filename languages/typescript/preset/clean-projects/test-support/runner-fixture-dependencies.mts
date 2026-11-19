import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fieldOf, fieldsOf, parseJson } from '../../../../../shared/values/readers.mts';

const configuredPackages: Readonly<Record<string, () => string>> = {
  'global-jsdom': () => import.meta.resolve('global-jsdom/register'),
  'jest-environment-jsdom': () => import.meta.resolve('jest-environment-jsdom'),
  sinon: () => import.meta.resolve('sinon'),
};

export function verifyRunnerFixtureDependencies(fixtureRoot: string): void {
  const manifest = parseJson(readFileSync(path.join(fixtureRoot, 'package.json'), 'utf8'));
  const dependencies = {
    ...fieldsOf(fieldOf(manifest, 'dependencies')),
    ...fieldsOf(fieldOf(manifest, 'devDependencies')),
  };
  for (const [name, resolve] of Object.entries(configuredPackages)) {
    if (dependencies[name] !== undefined) {
      resolve();
    }
  }
}
