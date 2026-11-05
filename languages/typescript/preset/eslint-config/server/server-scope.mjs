import { nitpickerRules } from '../../eslint-plugin/index.mjs';
import { securitySupportGlobs } from '../policy/security-facts.mjs';
import { productionScope, readManifest } from '../scope-support.mjs';
import { serverRuleIds } from './server-rules.mjs';

const SERVER_FRAMEWORKS = [
  '@nestjs/core',
  'express',
  'fastify',
  'hono',
  'koa',
  '@hapi/hapi',
  'restify',
  '@adonisjs/core',
  '@feathersjs/feathers',
  '@apollo/server',
  'graphql-yoga',
  'elysia',
  'h3',
];

const COMPONENT_FILES = '**/*.{tsx,jsx}';

export function isServerProject(projectRoot) {
  const manifest = readManifest(projectRoot);
  return [manifest?.dependencies, manifest?.peerDependencies].some((dependencies) =>
    SERVER_FRAMEWORKS.some((name) => Object.hasOwn(dependencies ?? {}, name)),
  );
}

export function serverScopeConfigFor(layout, { browser }) {
  const { files, ignores } = productionScope(layout);
  return [
    {
      files,
      ignores: [...ignores, ...securitySupportGlobs(), ...(browser ? [COMPONENT_FILES] : [])],
      plugins: { nitpicker: nitpickerRules },
      rules: Object.fromEntries(serverRuleIds.map((id) => [id, 'error'])),
    },
  ];
}
