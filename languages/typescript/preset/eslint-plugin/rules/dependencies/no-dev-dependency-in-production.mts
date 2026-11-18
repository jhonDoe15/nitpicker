import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import path from 'node:path';
import { exceptionHint as untypedExceptionHint } from '../../../../../../shared/hygiene/rules.mjs';
import { stringValue } from '../analysis/constant-resolution.mts';
import { nearestManifest, packageNameOf, type Manifest } from './package-manifest.mts';
import { isTestSupportFile } from './test-support.mts';

type MessageIds = 'devDependency' | 'unreadableManifest';
type Context = Readonly<TSESLint.RuleContext<MessageIds, []>>;
type ModuleDeclaration =
  TSESTree.ImportDeclaration | TSESTree.ExportNamedDeclaration | TSESTree.ExportAllDeclaration;
type ReadableManifest = Extract<Manifest, { kind: 'manifest' }>;
type UnreadableManifest = Extract<Manifest, { kind: 'unreadable' }>;
type Report = {
  readonly context: Context;
  readonly manifest: ReadableManifest;
  readonly node: TSESTree.Node;
  readonly specifier: string | undefined;
  readonly file: string;
};

const exceptionHint: (rule: string, path: string) => string = untypedExceptionHint;

const RULE_ID = 'nitpicker/no-dev-dependency-in-production';

function isTypeOnly(node: ModuleDeclaration): boolean {
  if (node.type !== AST_NODE_TYPES.ImportDeclaration) {
    return node.exportKind === 'type';
  }
  return (
    node.importKind === 'type' ||
    (node.specifiers.length > 0 &&
      node.specifiers.every(
        (specifier) =>
          specifier.type === AST_NODE_TYPES.ImportSpecifier && specifier.importKind === 'type',
      ))
  );
}

function reportDevelopmentImport({ context, manifest, node, specifier, file }: Report): void {
  const name = specifier === undefined ? undefined : packageNameOf(specifier);
  if (name !== undefined && manifest.development.has(name) && !manifest.runtime.has(name)) {
    const hint = exceptionHint(RULE_ID, file);
    context.report({ node, messageId: 'devDependency', data: { name, hint } });
  }
}

function projectPath(context: Context, file: string): string {
  return path.relative(context.cwd, file).split(path.sep).join('/');
}

function unreadableManifestVisitor(
  context: Context,
  manifest: UnreadableManifest,
): TSESLint.RuleListener {
  return {
    Program(node: TSESTree.Program) {
      const data = { manifest: projectPath(context, manifest.file) };
      context.report({ node, messageId: 'unreadableManifest', data });
    },
  };
}

function isRequireCall(node: TSESTree.CallExpression): boolean {
  return node.callee.type === AST_NODE_TYPES.Identifier && node.callee.name === 'require';
}

export const rule: TSESLint.RuleModule<MessageIds> = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Production code imports only packages listed in dependencies',
    },
    schema: [],
    messages: {
      devDependency:
        '{{name}} is only a devDependency, but production code imports it. Move it to "dependencies" in package.json. {{hint}}',
      unreadableManifest:
        '{{manifest}} is not a JSON object, so imports cannot be checked against its dependencies. Fix the file.',
    },
  },
  create(context) {
    const file = projectPath(context, context.filename);
    const manifest = nearestManifest(path.dirname(context.filename));
    if (manifest === undefined || isTestSupportFile(file)) {
      return {};
    }
    if (manifest.kind === 'unreadable') {
      return unreadableManifestVisitor(context, manifest);
    }
    if (manifest.bundledApp) {
      return {};
    }
    const readable: ReadableManifest = manifest;
    function check(node: TSESTree.Node, specifier: string | undefined): void {
      reportDevelopmentImport({ context, manifest: readable, node, specifier, file });
    }
    function checkDeclaration(node: ModuleDeclaration): void {
      if (!isTypeOnly(node)) {
        check(node, stringValue(node.source));
      }
    }
    return {
      ImportDeclaration: checkDeclaration,
      ExportNamedDeclaration: checkDeclaration,
      ExportAllDeclaration: checkDeclaration,
      ImportExpression(node: TSESTree.ImportExpression) {
        check(node, stringValue(node.source));
      },
      CallExpression(node: TSESTree.CallExpression) {
        if (isRequireCall(node)) {
          check(node, stringValue(node.arguments[0]));
        }
      },
    };
  },
};
