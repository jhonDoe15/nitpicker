import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import path from 'node:path';
import { reachableModules as untypedReachableModules } from '../../../modules/module-resolution.mjs';
import {
  moduleSourcesOf as untypedModuleSourcesOf,
  statementSources as untypedStatementSources,
} from '../../../modules/module-sources.mjs';
import { isBrowserEndToEndTest } from '../analysis/test-code-analysis.mts';
import { moduleMocks } from '../runner-apis/module-mocks.mts';
import { type RunnerApis, runnerApisOf } from '../runner-apis/runner-apis.mts';
import { awaited } from '../effects/lazy-relations.mts';
import { isNode, nameOf, type SourceCode } from '../typed/node-views.mts';
import { readLayout } from '../typed/policy-views.mts';
import { calleeNameOf } from '../typed/syntax-views.mts';
import { appendAll } from '../../../../../../shared/lists/lists.mts';

type ReachStep =
  | { readonly file: string; readonly truncated?: undefined }
  | { readonly truncated: boolean; readonly file?: undefined };

type ReachLimits = { readonly maxDepth: number; readonly maxFiles: number };

type ScopeContext = Pick<
  Readonly<TSESLint.RuleContext<string, readonly unknown[]>>,
  'cwd' | 'filename' | 'settings' | 'sourceCode'
>;

type TransparentWrapper =
  | TSESTree.AwaitExpression
  | TSESTree.ChainExpression
  | TSESTree.TSAsExpression
  | TSESTree.TSNonNullExpression
  | TSESTree.TSSatisfiesExpression
  | TSESTree.TSTypeAssertion;

type IdentifierDeclarator = TSESTree.VariableDeclarator & { readonly id: TSESTree.Identifier };

const reachableModules: (
  entries: string,
  specifiersOf: (file: string) => readonly string[],
  limits: ReachLimits,
) => Iterable<ReachStep> = untypedReachableModules;
const moduleSourcesOf: (file: string) => string[] = untypedModuleSourcesOf;
const statementSources: (statement: TSESTree.Node) => string[] = untypedStatementSources;
const createObject: <Prototype extends object>(
  prototype: Prototype,
  properties: PropertyDescriptorMap,
) => Prototype = Object.create;

const layout = readLayout();
const REACT_PACKAGE = 'react';
const reactTestModule = /^(?:@testing-library\/.+|react(?:-[^/]+)?(?:\/.*)?|enzyme(?:\/.*)?)$/u;
const projectTestUtilsModule = /^\.{1,2}\/(?:.*\/)?[^/]*test-utils[^/]*$/u;
const testingLibraryModule =
  /^(?:@testing-library\/.+|enzyme(?:\/.*)?|react-test-renderer(?:\/.*)?)$/u;
const testingLibraryQueryModule = /^@testing-library\/(?!user-event$|jest-dom(?:\/|$)).+$/u;
const componentFile = /\.[cm]?[jt]sx$/u;
const TEST_UTILS_NAME = 'test-utils';
const LIMITS = { maxDepth: 4, maxFiles: 50 };
const UTILS_MODULE_SETTING = 'testing-library/utils-module';

function isReactTestModule(source: string): boolean {
  return reactTestModule.test(source) || projectTestUtilsModule.test(source);
}

function moduleNameOf(file: string): string {
  const base = path.basename(file).replace(/\.[^.]+$/u, '');
  return base === 'index' ? path.basename(path.dirname(file)) : base;
}

function isTestHelperModule(file: string): boolean {
  return (
    moduleNameOf(file).includes(TEST_UTILS_NAME) ||
    moduleSourcesOf(file).some((source) => testingLibraryModule.test(source))
  );
}

function reachesTestHelper(source: string, filename: string): boolean {
  function specifiersOf(file: string): readonly string[] {
    return file === filename ? [source] : moduleSourcesOf(file);
  }
  for (const step of reachableModules(filename, specifiersOf, LIMITS)) {
    if (step.file === undefined) {
      return false;
    }
    if (isTestHelperModule(step.file)) {
      return true;
    }
  }
  return false;
}

function topLevelCalls(statement: TSESTree.ProgramStatement): (TSESTree.Node | undefined)[] {
  if (statement.type === AST_NODE_TYPES.ExpressionStatement) {
    return [awaited(statement.expression)];
  }
  return statement.type === AST_NODE_TYPES.VariableDeclaration
    ? statement.declarations.map((declarator) => awaited(declarator.init ?? undefined))
    : [];
}

function mockedSources(apis: RunnerApis, statement: TSESTree.ProgramStatement): (string | undefined)[] {
  return topLevelCalls(statement)
    .filter((node) => node?.type === AST_NODE_TYPES.CallExpression)
    .flatMap((call) => moduleMocks(apis, call).map(({ name }) => name));
}

function topLevelSources(program: TSESTree.Program): (string | undefined)[] {
  const apis = runnerApisOf(program);
  return program.body.flatMap((statement) => [
    ...statementSources(statement),
    ...mockedSources(apis, statement),
  ]);
}

function testHelperOf(sources: readonly string[], filename: string): string | undefined {
  return path.isAbsolute(filename)
    ? sources
        .filter((source) => !isReactTestModule(source))
        .find((source) => reachesTestHelper(source, filename))
    : undefined;
}

function reactTestScope(context: ScopeContext): {
  readonly inScope: boolean;
  readonly utilsModule: string | undefined;
} {
  const sources = topLevelSources(context.sourceCode.ast).filter(
    (source) => typeof source === 'string',
  );
  const helper = testHelperOf(sources, context.filename);
  const projectFile = path.relative(context.cwd, context.filename).replaceAll('\\', '/');
  const component =
    componentFile.test(context.filename) &&
    !isBrowserEndToEndTest({ sources, projectFile, layout });
  const direct = sources.some((source) => testingLibraryQueryModule.test(source));
  return {
    inScope: component || helper !== undefined || sources.some(isReactTestModule),
    utilsModule: direct ? undefined : helper,
  };
}

function withUtilsModule<Context extends ScopeContext>(context: Context, helper: string): Context {
  const settings = { ...context.settings, [UTILS_MODULE_SETTING]: helper };
  return createObject(context, { settings: { value: settings } });
}

export function inReactTestFilesOnly<MessageIds extends string, Options extends readonly unknown[]>(
  create: TSESLint.RuleCreateFunction<MessageIds, Options>,
): TSESLint.RuleCreateFunction<MessageIds, Options> {
  return (context) => {
    const { inScope, utilsModule } = reactTestScope(context);
    if (!inScope) {
      return {};
    }
    return create(utilsModule === undefined ? context : withUtilsModule(context, utilsModule));
  };
}

const moduleLoaders = new Set(['require', 'importActual', 'requireActual']);
const transparentWrappers = new Set<string>([
  AST_NODE_TYPES.AwaitExpression,
  AST_NODE_TYPES.ChainExpression,
  AST_NODE_TYPES.TSAsExpression,
  AST_NODE_TYPES.TSNonNullExpression,
  AST_NODE_TYPES.TSSatisfiesExpression,
  AST_NODE_TYPES.TSTypeAssertion,
]);

function isTransparentWrapper(node: TSESTree.Node): node is TransparentWrapper {
  return transparentWrappers.has(node.type);
}

function innerExpression(node: TSESTree.Node): TSESTree.Node | undefined {
  if (isTransparentWrapper(node)) {
    return node.type === AST_NODE_TYPES.AwaitExpression ? node.argument : node.expression;
  }
  const isDefault =
    node.type === AST_NODE_TYPES.MemberExpression &&
    !node.computed &&
    nameOf(node.property) === 'default';
  return isDefault ? node.object : undefined;
}

function coreExpression(node: TSESTree.Node): TSESTree.Node | undefined {
  const chain = [node];
  for (const current of chain) {
    const inner = innerExpression(current);
    if (inner !== undefined) {
      chain.push(inner);
    }
  }
  return chain.at(-1);
}

function loadsReact(node: TSESTree.Node | undefined): boolean {
  if (node?.type === AST_NODE_TYPES.ImportExpression) {
    return node.source.type === AST_NODE_TYPES.Literal && node.source.value === REACT_PACKAGE;
  }
  if (node?.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const [argument] = node.arguments;
  const name = calleeNameOf(node.callee);
  return (
    name !== undefined &&
    moduleLoaders.has(name) &&
    argument?.type === AST_NODE_TYPES.Literal &&
    argument.value === REACT_PACKAGE
  );
}

export function isReactExpression(
  node: TSESTree.Node | undefined,
  names: ReadonlySet<string>,
): boolean {
  const core = node === undefined ? undefined : coreExpression(node);
  if (core?.type === AST_NODE_TYPES.Identifier) {
    return names.has(core.name);
  }
  return loadsReact(core);
}

function importedNames(statement: TSESTree.Node): string[] {
  if (statement.type === AST_NODE_TYPES.TSImportEqualsDeclaration) {
    const reference = statement.moduleReference;
    const written =
      reference.type === AST_NODE_TYPES.TSExternalModuleReference
        ? reference.expression.value
        : undefined;
    return written === REACT_PACKAGE ? [statement.id.name] : [];
  }
  if (
    statement.type !== AST_NODE_TYPES.ImportDeclaration ||
    statement.source.value !== REACT_PACKAGE
  ) {
    return [];
  }
  return statement.specifiers
    .filter(
      (specifier) =>
        specifier.type !== AST_NODE_TYPES.ImportSpecifier ||
        nameOf(specifier.imported) === 'default',
    )
    .map((specifier) => specifier.local.name);
}

function children(node: TSESTree.Node, visitorKeys: SourceCode['visitorKeys']): TSESTree.Node[] {
  return (visitorKeys[node.type] ?? [])
    .flatMap((key) => {
      const value: unknown = Reflect.get(node, key);
      return [value].flat();
    })
    .filter(isNode);
}

export function descendants(
  root: TSESTree.Node,
  visitorKeys: SourceCode['visitorKeys'],
): TSESTree.Node[] {
  const found = [root];
  for (const node of found) {
    appendAll(found, children(node, visitorKeys));
  }
  return found;
}

function isIdentifierDeclarator(node: TSESTree.Node): node is IdentifierDeclarator {
  return (
    node.type === AST_NODE_TYPES.VariableDeclarator && node.id.type === AST_NODE_TYPES.Identifier
  );
}

export function reactBindingNames(sourceCode: SourceCode, seed: readonly string[]): Set<string> {
  const nodes = descendants(sourceCode.ast, sourceCode.visitorKeys);
  const names = new Set([...seed, ...nodes.flatMap(importedNames)]);
  const declarators = nodes
    .filter(isIdentifierDeclarator)
    .toSorted((left, right) => left.range[0] - right.range[0]);
  for (const declarator of declarators) {
    if (isReactExpression(declarator.init ?? undefined, names)) {
      names.add(declarator.id.name);
    }
  }
  return names;
}
