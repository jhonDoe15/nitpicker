import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import path from 'node:path';
import {
  reachableModules as untypedReachableModules,
  resolveModuleSpecifier as untypedResolveModuleSpecifier,
} from '../../../../modules/module-resolution.mjs';
import {
  moduleReferencesOf as untypedModuleReferencesOf,
  statementSources as untypedStatementSources,
} from '../../../../modules/module-sources.mjs';
import { isBrowserEndToEndTest } from '../../analysis/test-code-analysis.mts';
import { readLayout } from '../../typed/policy-views.mts';

type Options = readonly [{ readonly exemptPattern?: string }?];
type Context = Readonly<TSESLint.RuleContext<'missingRuntime', Options>>;
type ModuleReference = {
  readonly source: string;
  readonly runtime: boolean;
  readonly reexport: boolean;
};
type ReachStep =
  | { readonly file: string; readonly truncated?: undefined }
  | { readonly truncated: boolean; readonly file?: undefined };

const reachableModules: (
  entries: string,
  specifiersOf: (file: string) => readonly string[],
  limits: { readonly maxDepth: number; readonly maxFiles: number },
) => Iterable<ReachStep> = untypedReachableModules;
const resolveModuleSpecifier: (
  written: string,
  containingFile: string,
) => { readonly kind: string; readonly path?: string | undefined } = untypedResolveModuleSpecifier;
const moduleReferencesOf: (file: string) => ModuleReference[] = untypedModuleReferencesOf;
const statementSources: (statement: TSESTree.Node) => string[] = untypedStatementSources;

const layout = readLayout();
const { testRoots } = layout;

const DEFAULT_EXEMPT_PATTERN = String.raw`/(?:${testRoots.join('|')})/contract/|\.policy\.test\.[cm]?[jt]s$`;
const RUNNABLE_TEST = /\.(?:test|spec)\.[cm]?[jt]sx?$/;
const TEST_SUPPORT = new RegExp(
  `(?:^|/)(?:__tests__|fixtures)(?:/|$)|^(?:${testRoots.join('|')})(?:/|$)|\\.(?:test|spec)\\.[cm]?[jt]sx?$`,
);

const relativeModule = /^\.{1,2}\//u;
const MAX_REEXPORT_DEPTH = 3;
const MAX_REEXPORTED_FILES = 50;

function resolveModule(fromFile: string, source: string): string | undefined {
  const resolved = resolveModuleSpecifier(source, fromFile);
  return resolved.kind === 'file' ? resolved.path : undefined;
}

function reexportSources(file: string): string[] {
  return moduleReferencesOf(file)
    .filter(({ reexport }) => reexport)
    .map(({ source }) => source);
}

function helperFiles(helper: string): string[] {
  const reexported = [
    ...reachableModules(helper, reexportSources, {
      maxDepth: MAX_REEXPORT_DEPTH,
      maxFiles: MAX_REEXPORTED_FILES,
    }),
  ];
  return [helper, ...reexported.map(({ file }) => file).filter((file) => file !== undefined)];
}

function helperReaches(testFile: string, source: string): boolean {
  const helper = resolveModule(testFile, source);
  return (
    helper !== undefined &&
    helperFiles(helper).some((file) =>
      moduleReferencesOf(file).some(
        (reference) => reference.runtime && isProductionModule(file, reference.source),
      ),
    )
  );
}

function isRuntimeImport(node: TSESTree.ImportDeclaration): boolean {
  if (node.importKind === 'type') {
    return false;
  }
  if (node.specifiers.length === 0) {
    return true;
  }
  return node.specifiers.some(
    (specifier) =>
      specifier.type !== AST_NODE_TYPES.ImportSpecifier || specifier.importKind !== 'type',
  );
}

function isProductionModule(filename: string, source: string): boolean {
  const sourceRoot = layout.sourceRoots.find(
    (root) => source.includes(`/${root}/`) || source.startsWith(`${root}/`),
  );
  if (
    sourceRoot !== undefined &&
    layout.isSourceFile(source.slice(source.indexOf(`${sourceRoot}/`)))
  ) {
    return true;
  }
  const resolved = (
    relativeModule.test(source)
      ? path.resolve(path.dirname(filename), source)
      : (resolveModule(filename, source) ?? '')
  ).replaceAll('\\', '/');
  const resolvedRoot = layout.sourceRootOf(`${resolved}/`);
  return (
    resolvedRoot !== undefined &&
    !TEST_SUPPORT.test(resolved.slice(resolved.indexOf(`/${resolvedRoot}/`) + 1))
  );
}

function reachesProduction(filename: string, source: string): boolean {
  if (isProductionModule(filename, source)) {
    return true;
  }
  return helperReaches(filename, source);
}

function isProductionRequire(filename: string, node: TSESTree.CallExpression): boolean {
  const [argument] = node.arguments;
  return (
    node.callee.type === AST_NODE_TYPES.Identifier &&
    node.callee.name === 'require' &&
    argument?.type === AST_NODE_TYPES.Literal &&
    typeof argument.value === 'string' &&
    reachesProduction(filename, argument.value)
  );
}

function isExemptTest(context: Context, filename: string): boolean {
  const exemptTest = new RegExp(context.options[0]?.exemptPattern ?? DEFAULT_EXEMPT_PATTERN);
  const projectFile = path.relative(context.cwd, filename).replaceAll('\\', '/');
  return (
    !RUNNABLE_TEST.test(filename) ||
    exemptTest.test(filename) ||
    isBrowserEndToEndTest({
      sources: context.sourceCode.ast.body.flatMap(statementSources),
      projectFile,
      layout,
    })
  );
}

export const rule: TSESLint.RuleModule<'missingRuntime', Options> = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require tests to execute a production runtime dependency',
    },
    schema: [
      {
        type: 'object',
        properties: {
          exemptPattern: { type: 'string' },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      missingRuntime:
        'This test imports no production code at runtime (only types, libraries, or helpers that import none). Import the code under test from the source root, directly or through a helper such as a render function that imports it. Shared helpers belong in a file not named *.test.* or *.spec.*.',
    },
  },
  create(context) {
    const filename = context.filename.replaceAll('\\', '/');
    if (isExemptTest(context, filename)) {
      return {};
    }

    let program: TSESTree.Program | undefined;
    let hasProductionRuntime = false;

    return {
      Program(node) {
        program = node;
      },
      ImportDeclaration(node) {
        if (isRuntimeImport(node) && reachesProduction(filename, node.source.value)) {
          hasProductionRuntime = true;
        }
      },
      ImportExpression(node) {
        if (
          node.source.type === AST_NODE_TYPES.Literal &&
          typeof node.source.value === 'string' &&
          reachesProduction(filename, node.source.value)
        ) {
          hasProductionRuntime = true;
        }
      },
      CallExpression(node) {
        if (isProductionRequire(filename, node)) {
          hasProductionRuntime = true;
        }
      },
      'Program:exit'() {
        if (!hasProductionRuntime && program !== undefined) {
          context.report({ node: program, messageId: 'missingRuntime' });
        }
      },
    };
  },
};
