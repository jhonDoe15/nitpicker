import { existsSync, globSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const CONFIG_NAMES = ['vitest', 'vite'].flatMap((name) =>
  ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs'].map((extension) => `${name}.config.${extension}`),
);
const RESTORE_FLAGS = { unstubGlobals: 'globals', unstubEnvs: 'envs' };
const PROJECT_CONFIG_FILE = /^vite(?:st)?(?:\.[\w-]+)?\.config\./u;

function propertyName(node) {
  return ts.isPropertyAssignment(node) &&
    (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name))
    ? node.name.text
    : undefined;
}

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
  for (const node of nodes) nodes.push(...node.getChildren(sourceFile));
  return nodes;
}

function directoryConfig(directory) {
  const files = new Set(readdirSync(directory));
  const name = CONFIG_NAMES.find((candidate) => files.has(candidate));
  return name === undefined ? undefined : path.join(directory, name);
}

function projectConfigs(projectRoot, entries) {
  return entries.flatMap((entry) =>
    globSync(entry.replace(/^\.\//u, ''), { cwd: projectRoot })
      .map((match) => path.join(projectRoot, match))
      .flatMap((match) =>
        statSync(match).isDirectory()
          ? [directoryConfig(match)].filter((config) => config !== undefined)
          : [match].filter((config) => PROJECT_CONFIG_FILE.test(path.basename(config))),
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
  const configName = CONFIG_NAMES.find((name) => existsSync(path.join(projectRoot, name)));
  if (configName === undefined) return [];
  const scopes = new Map();
  for (const { scope, restores } of restoresInConfigs(
    projectRoot,
    path.join(projectRoot, configName),
  )) {
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
