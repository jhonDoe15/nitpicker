import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { firstFileIn } from '../../../../../shared/filesystem.mjs';
import { projectFilePaths } from '../../../../../shared/project-files/project-files.mjs';
import { propertyName } from '../../syntax/property-names.mjs';
import { VITEST_CONFIG_NAMES } from './setup-files.mjs';

const RESTORE_FLAGS = { unstubGlobals: 'globals', unstubEnvs: 'envs' };
const PROJECT_CONFIG_FILE = /^vite(?:st)?(?:\.[\w-]+)?\.config\./u;

function literalProperty(objectNode, name) {
  const found = objectNode?.properties.find((property) => propertyName(property) === name);
  return found !== undefined && ts.isStringLiteralLike(found.initializer)
    ? found.initializer.text
    : undefined;
}

function flagScope(flag, base) {
  const testObject = ts.findAncestor(flag.parent, ts.isObjectLiteralExpression);
  const projectObject = ts.findAncestor(testObject?.parent, ts.isObjectLiteralExpression);
  const root = literalProperty(testObject, 'root') ?? literalProperty(projectObject, 'root');
  return path.posix.normalize(path.posix.join(base, root ?? '.'));
}

function nodesOf(sourceFile) {
  const nodes = [sourceFile];
  for (const node of nodes) {
    nodes.push(...node.getChildren(sourceFile));
  }
  return nodes;
}

function configsMatching(files, pattern) {
  const listed = new Set(files);
  const directories = [...new Set(files.map((file) => path.posix.dirname(file)))]
    .filter((directory) => path.matchesGlob(directory, pattern))
    .flatMap((directory) =>
      VITEST_CONFIG_NAMES.map((name) => path.posix.join(directory, name))
        .filter((candidate) => listed.has(candidate))
        .slice(0, 1),
    );
  const direct = files.filter(
    (file) =>
      PROJECT_CONFIG_FILE.test(path.posix.basename(file)) && path.matchesGlob(file, pattern),
  );
  return [...directories, ...direct];
}

function projectConfigs(base, entries) {
  const files = projectFilePaths(base);
  return entries.flatMap((entry) =>
    configsMatching(files, entry.replace(/^\.\//u, '').replace(/\/$/u, '')).map((match) =>
      path.join(base, match),
    ),
  );
}

function projectEntries(nodes) {
  return nodes
    .filter((node) => propertyName(node) === 'projects')
    .filter((node) => ts.isArrayLiteralExpression(node.initializer))
    .flatMap((node) => node.initializer.elements.filter(ts.isStringLiteralLike))
    .map((element) => element.text)
    .filter((entry) => !entry.startsWith('!'));
}

function configNodes(configPath) {
  const text = readFileSync(configPath, 'utf8');
  return nodesOf(ts.createSourceFile(configPath, text, ts.ScriptTarget.Latest, true));
}

function flagsIn(projectRoot, configPath, nodes) {
  const base = path.relative(projectRoot, path.dirname(configPath)).replaceAll('\\', '/') || '.';
  return nodes
    .filter((node) => Object.hasOwn(RESTORE_FLAGS, propertyName(node) ?? ''))
    .filter((node) => node.initializer.kind === ts.SyntaxKind.TrueKeyword)
    .map((node) => ({ scope: flagScope(node, base), restores: RESTORE_FLAGS[propertyName(node)] }));
}

function restoresInConfigs(projectRoot, rootConfig) {
  const rootNodes = configNodes(rootConfig);
  const children = projectConfigs(path.dirname(rootConfig), projectEntries(rootNodes));
  return [
    ...flagsIn(projectRoot, rootConfig, rootNodes),
    ...children.flatMap((child) => flagsIn(projectRoot, child, configNodes(child))),
  ];
}

export function stubRestoresIn(projectRoot) {
  const configPath = firstFileIn(projectRoot, VITEST_CONFIG_NAMES);
  if (configPath === undefined) {
    return [];
  }
  const scopes = new Map();
  for (const { scope, restores } of restoresInConfigs(projectRoot, configPath)) {
    scopes.set(scope, {
      scope,
      globals: false,
      envs: false,
      ...scopes.get(scope),
      [restores]: true,
    });
  }
  return [...scopes.values()];
}
