import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import path from 'node:path';
import {
  packageSpecifierPattern as untypedPackageSpecifierPattern,
  uiFrameworks,
} from '../../../architecture/domain-packages.mjs';
import {
  reachableModules as untypedReachableModules,
  resolveModuleSpecifier as untypedResolveModuleSpecifier,
} from '../../../modules/module-resolution.mjs';
import {
  moduleSourceOf as untypedModuleSourceOf,
  moduleSourcesOf as untypedModuleSourcesOf,
} from '../../../modules/module-sources.mjs';

type MessageIds = 'uiFramework' | 'jsxInDomain' | 'uiFrameworkThroughShared';
type ReachStep =
  | { readonly file: string; readonly truncated?: undefined }
  | { readonly truncated: boolean; readonly file?: undefined };
type ModuleSourceNode =
  | TSESTree.ImportDeclaration
  | TSESTree.ImportExpression
  | TSESTree.ExportNamedDeclaration
  | TSESTree.ExportAllDeclaration
  | TSESTree.TSImportEqualsDeclaration
  | TSESTree.CallExpression;

const packageSpecifierPattern: (packages: readonly string[]) => RegExp =
  untypedPackageSpecifierPattern;
const resolveModuleSpecifier: (
  written: string,
  containingFile: string,
) => { readonly kind: string; readonly path?: string | undefined } = untypedResolveModuleSpecifier;
const reachableModules: (
  entries: string,
  specifiersOf: (file: string) => readonly string[],
  limits: { readonly maxDepth: number; readonly maxFiles: number },
) => Iterable<ReachStep> = untypedReachableModules;
const moduleSourceOf: (node: TSESTree.Node) => string | undefined = untypedModuleSourceOf;
const moduleSourcesOf: (file: string) => string[] = untypedModuleSourcesOf;

const UI_FRAMEWORK = packageSpecifierPattern(uiFrameworks);
const SHARED_MODULE = /(?:^|\/)main\/shared\//u;
const LIMITS = { maxDepth: 6, maxFiles: 100 };

function isSharedModule(file: string): boolean {
  return SHARED_MODULE.test(file.replaceAll('\\', '/'));
}

function frameworkReachedThroughShared(source: string, filename: string): string | undefined {
  const entry = resolveModuleSpecifier(source, filename).path;
  if (entry === undefined || !isSharedModule(entry)) {
    return undefined;
  }
  function specifiersOf(file: string): readonly string[] {
    if (file === filename) {
      return [source];
    }
    return isSharedModule(file) ? moduleSourcesOf(file) : [];
  }
  for (const step of reachableModules(filename, specifiersOf, LIMITS)) {
    if (step.truncated === true) {
      return undefined;
    }
    const framework =
      step.file === undefined
        ? undefined
        : specifiersOf(step.file).find((next) => UI_FRAMEWORK.test(next));
    if (framework !== undefined) {
      return framework;
    }
  }
  return undefined;
}

export const rule: TSESLint.RuleModule<MessageIds> = {
  meta: {
    type: 'problem',
    docs: { description: 'Keep UI frameworks and UI state libraries out of domain/' },
    schema: [],
    messages: {
      uiFramework:
        'domain/ does not import a UI framework or UI state library (`{{source}}`): components, hooks and stores live in adapters/ (or shared/ui) and call the logic in domain/, which takes and returns plain values. An exception fits only when a framework requires this file in domain/.',
      jsxInDomain:
        'domain/ does not render: JSX belongs to a component in adapters/ (or shared/ui), which calls the logic in domain/ and renders its plain result. An exception fits only when a framework requires this file in domain/.',
      uiFrameworkThroughShared:
        'domain/ does not import a UI framework or UI state library, here `{{framework}}` through `{{source}}`: components, hooks and stores live in adapters/ (or shared/ui) and call the logic in domain/, which takes and returns plain values. An exception fits only when a framework requires this file in domain/.',
    },
  },
  create(context) {
    function check(node: ModuleSourceNode): void {
      const source = moduleSourceOf(node);
      if (source === undefined) {
        return;
      }
      if (UI_FRAMEWORK.test(source)) {
        context.report({ node, messageId: 'uiFramework', data: { source } });
        return;
      }
      const framework = path.isAbsolute(context.filename)
        ? frameworkReachedThroughShared(source, context.filename)
        : undefined;
      if (framework !== undefined) {
        context.report({
          node,
          messageId: 'uiFrameworkThroughShared',
          data: { framework, source },
        });
      }
    }
    function checkJsx(node: TSESTree.JSXElement | TSESTree.JSXFragment): void {
      if (!node.parent.type.startsWith('JSX')) {
        context.report({ node, messageId: 'jsxInDomain' });
      }
    }
    return {
      JSXElement: checkJsx,
      JSXFragment: checkJsx,
      ImportDeclaration: check,
      ImportExpression: check,
      ExportNamedDeclaration: check,
      ExportAllDeclaration: check,
      TSImportEqualsDeclaration: check,
      CallExpression: check,
    };
  },
};
