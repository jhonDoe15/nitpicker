import tseslint from 'typescript-eslint';
import { readManifest } from '../scope-support.mjs';

const NEST_CORE = '@nestjs/core';

export function isNestProject(projectRoot) {
  const manifest = readManifest(projectRoot);
  return [manifest?.dependencies, manifest?.peerDependencies].some((dependencies) =>
    Object.hasOwn(dependencies ?? {}, NEST_CORE),
  );
}

export function nestScopeConfigFor(files) {
  return [
    {
      files,
      plugins: { '@typescript-eslint': tseslint.plugin },
      rules: { '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }] },
    },
  ];
}
