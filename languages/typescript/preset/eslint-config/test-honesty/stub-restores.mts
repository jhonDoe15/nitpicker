import { readFileSync } from 'node:fs';
import path from 'node:path';
import type TypeScript from 'typescript';
import { typescriptApi } from '../../../adapters/typed/typescript-program.mts';
import { firstFileIn, projectFilePaths, propertyName } from '../typed/files/file-views.mts';
import { VITEST_CONFIG_NAMES } from './setup-files.mts';

type RestoreScope = { readonly scope: string; readonly restores: 'globals' | 'envs' };
type Restores = { scope: string; globals: boolean; envs: boolean };

const ts = typescriptApi();

const RESTORE_FLAGS = { unstubGlobals: 'globals', unstubEnvs: 'envs' } as const;
const PROJECT_CONFIG_FILE = /^vite(?:st)?(?:\.[\w-]+)?\.config\./u;

function literalProperty(
  objectNode: TypeScript.ObjectLiteralExpression | undefined,
  name: string,
): string | undefined {
  const found = objectNode?.properties.find((property) => propertyName(property) === name);
  return found !== undefined &&
    ts.isPropertyAssignment(found) &&
    ts.isStringLiteralLike(found.initializer)
    ? found.initializer.text
    : undefined;
}

function flagScope(flag: TypeScript.Node, base: string): string {
  const testObject = ts.findAncestor(flag.parent, ts.isObjectLiteralExpression);
  const projectObject = ts.findAncestor(testObject?.parent, ts.isObjectLiteralExpression);
  const root = literalProperty(testObject, 'root') ?? literalProperty(projectObject, 'root');
  return path.posix.normalize(path.posix.join(base, root ?? '.'));
}

function nodesOf(sourceFile: TypeScript.SourceFile): TypeScript.Node[] {
  const nodes: TypeScript.Node[] = [sourceFile];
  for (const node of nodes) {
    nodes.push(...node.getChildren(sourceFile));
  }
  return nodes;
}

function configsMatching(files: readonly string[], pattern: string): string[] {
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

function projectConfigs(base: string, entries: readonly string[]): string[] {
  const files = projectFilePaths(base);
  return entries.flatMap((entry) =>
    configsMatching(files, entry.replace(/^\.\//u, '').replace(/\/$/u, '')).map((match) =>
      path.join(base, match),
    ),
  );
}

function projectEntries(nodes: readonly TypeScript.Node[]): string[] {
  return nodes
    .flatMap((node) =>
      ts.isPropertyAssignment(node) &&
      propertyName(node) === 'projects' &&
      ts.isArrayLiteralExpression(node.initializer)
        ? node.initializer.elements.filter(ts.isStringLiteralLike)
        : [],
    )
    .map((element) => element.text)
    .filter((entry) => !entry.startsWith('!'));
}

function configNodes(configPath: string): TypeScript.Node[] {
  const text = readFileSync(configPath, 'utf8');
  return nodesOf(ts.createSourceFile(configPath, text, ts.ScriptTarget.Latest, true));
}

function flagsIn(
  projectRoot: string,
  configPath: string,
  nodes: readonly TypeScript.Node[],
): RestoreScope[] {
  const base = path.relative(projectRoot, path.dirname(configPath)).replaceAll('\\', '/') || '.';
  return nodes.flatMap((node) => {
    const name = propertyName(node);
    return ts.isPropertyAssignment(node) &&
      (name === 'unstubGlobals' || name === 'unstubEnvs') &&
      node.initializer.kind === ts.SyntaxKind.TrueKeyword
      ? [{ scope: flagScope(node, base), restores: RESTORE_FLAGS[name] }]
      : [];
  });
}

function restoresInConfigs(projectRoot: string, rootConfig: string): RestoreScope[] {
  const rootNodes = configNodes(rootConfig);
  const children = projectConfigs(path.dirname(rootConfig), projectEntries(rootNodes));
  return [
    ...flagsIn(projectRoot, rootConfig, rootNodes),
    ...children.flatMap((child) => flagsIn(projectRoot, child, configNodes(child))),
  ];
}

export function stubRestoresIn(projectRoot: string): Restores[] {
  const configPath = firstFileIn(projectRoot, VITEST_CONFIG_NAMES);
  if (configPath === undefined) {
    return [];
  }
  const scopes = new Map<string, Restores>();
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
