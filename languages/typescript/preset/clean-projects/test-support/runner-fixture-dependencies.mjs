import { readFileSync } from 'node:fs';
import path from 'node:path';

const configuredPackages = {
  'global-jsdom': () => import.meta.resolve('global-jsdom/register'),
  'jest-environment-jsdom': () => import.meta.resolve('jest-environment-jsdom'),
  sinon: () => import.meta.resolve('sinon'),
};

export function verifyRunnerFixtureDependencies(fixtureRoot) {
  const manifest = JSON.parse(readFileSync(path.join(fixtureRoot, 'package.json'), 'utf8'));
  const dependencies = { ...manifest.dependencies, ...manifest.devDependencies };
  for (const [name, resolve] of Object.entries(configuredPackages)) {
    if (dependencies[name] !== undefined) {
      resolve();
    }
  }
}
