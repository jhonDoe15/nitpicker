import { readFileSync } from 'node:fs';
import path from 'node:path';
import type TypeScript from 'typescript';
import { typescriptApi } from '../../../adapters/typed/typescript-program.mts';
import { firstFileIn, projectFilePaths, propertyName } from '../typed/files/file-views.mts';
import { VITEST_CONFIG_NAMES } from './setup-files.mts';
import { appendAll } from '../../../../../shared/lists/lists.mts';

type RestoreScope = {
  readonly scope: string;
  readonly restores: 'globals' | 'envs' | 'concurrent';
};
type Restores = { scope: string; globals: boolean; envs: boolean; concurrent: boolean };

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
    appendAll(nodes, node.getChildren(sourceFile));
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

function sequenceFlag(node: TypeScript.Node): TypeScript.PropertyAssignment | undefined {
  if (!ts.isPropertyAssignment(node) || propertyName(node) !== 'concurrent') {
    return undefined;
  }
  const holder = node.parent.parent;
  const inTest =
    ts.isPropertyAssignment(holder) &&
    propertyName(holder) === 'sequence' &&
    ts.isPropertyAssignment(holder.parent.parent) &&
    propertyName(holder.parent.parent) === 'test';
  return inTest ? node : undefined;
}

function concurrentScope(flag: TypeScript.PropertyAssignment, base: string): string | undefined {
  const testObject = ts.findAncestor(flag.parent.parent, ts.isObjectLiteralExpression);
  const projectObject = ts.findAncestor(testObject?.parent, ts.isObjectLiteralExpression);
  const root = literalProperty(testObject, 'root') ?? literalProperty(projectObject, 'root');
  const inProjectList = ts.findAncestor(testObject, ts.isArrayLiteralExpression) !== undefined;
  return inProjectList && root === undefined
    ? undefined
    : path.posix.normalize(path.posix.join(base, root ?? '.'));
}

function configBase(projectRoot: string, configPath: string): string {
  return path.relative(projectRoot, path.dirname(configPath)).replaceAll('\\', '/') || '.';
}

function flagsIn(
  projectRoot: string,
  configPath: string,
  nodes: readonly TypeScript.Node[],
): RestoreScope[] {
  const base = configBase(projectRoot, configPath);
  return nodes.flatMap((node) => {
    const name = ts.isPropertyAssignment(node) ? propertyName(node) : undefined;
    return ts.isPropertyAssignment(node) &&
      (name === 'unstubGlobals' || name === 'unstubEnvs') &&
      node.initializer.kind === ts.SyntaxKind.TrueKeyword
      ? [{ scope: flagScope(node, base), restores: RESTORE_FLAGS[name] }]
      : [];
  });
}

function concurrentFlagsIn(
  projectRoot: string,
  configPath: string,
  nodes: readonly TypeScript.Node[],
): { readonly scopes: RestoreScope[]; readonly optedOut: boolean } {
  const base = configBase(projectRoot, configPath);
  const flags = nodes.flatMap((node) => {
    const flag = sequenceFlag(node);
    return flag === undefined ? [] : [flag];
  });
  const scopes = flags.flatMap((flag) => {
    const scope =
      flag.initializer.kind === ts.SyntaxKind.TrueKeyword ? concurrentScope(flag, base) : undefined;
    return scope === undefined ? [] : [{ scope, restores: 'concurrent' as const }];
  });
  return {
    scopes,
    optedOut: flags.some((flag) => flag.initializer.kind !== ts.SyntaxKind.TrueKeyword),
  };
}

function restoresInConfigs(projectRoot: string, rootConfig: string): RestoreScope[] {
  const rootNodes = configNodes(rootConfig);
  const children = projectConfigs(path.dirname(rootConfig), projectEntries(rootNodes));
  const configs = [
    { file: rootConfig, nodes: rootNodes },
    ...children.map((child) => ({ file: child, nodes: configNodes(child) })),
  ];
  const concurrent = configs.map(({ file, nodes }) => concurrentFlagsIn(projectRoot, file, nodes));
  return [
    ...configs.flatMap(({ file, nodes }) => flagsIn(projectRoot, file, nodes)),
    ...(concurrent.some(({ optedOut }) => optedOut)
      ? []
      : concurrent.flatMap(({ scopes }) => scopes)),
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
      concurrent: false,
      ...scopes.get(scope),
      [restores]: true,
    });
  }
  return [...scopes.values()];
}
