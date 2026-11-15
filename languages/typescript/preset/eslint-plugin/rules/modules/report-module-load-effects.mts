import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { stylesheetSpecifier as untypedStylesheetSpecifier } from '../../../layout.mjs';
import { SYNC_API_MODULES } from '../analysis/node/node-sync-modules.mts';
import {
  importedCalleeName,
  moduleBindings,
  type ModuleBindings,
} from '../analysis/subprocess-calls.mts';
import { ancestorsOf, type SourceCode } from '../typed/node-views.mts';
import { calleeNameOf } from '../typed/syntax-views.mts';
import { guardedByMain, isMainGuard } from './entry/main-guard.mts';

type MessageIds =
  | 'sideEffectImport'
  | 'staticBlock'
  | 'topLevelAwait'
  | 'topLevelControl'
  | 'topLevelExpression'
  | 'importTimeEffect';
type Options = readonly [Readonly<Record<string, unknown>>?];
type CallLike = TSESTree.NewExpression | TSESTree.CallExpression;

const stylesheetSpecifier: RegExp = untypedStylesheetSpecifier;

const SYNC_MODULES = new Set(SYNC_API_MODULES);

const ENTRY_HINT =
  " Move the work into a function that the app entry calls. The entry (the module script in Vite's " +
  'index.html, else src/main.tsx, and the NestJS entry in nest-cli.json) is detected; for another entry ' +
  'file, list it under `layout.entryPoints` in nitpicker.config.json.';

const TOP_LEVEL_CONTROL = new Set<string>([
  AST_NODE_TYPES.BlockStatement,
  AST_NODE_TYPES.DoWhileStatement,
  AST_NODE_TYPES.ForInStatement,
  AST_NODE_TYPES.ForOfStatement,
  AST_NODE_TYPES.ForStatement,
  AST_NODE_TYPES.IfStatement,
  AST_NODE_TYPES.SwitchStatement,
  AST_NODE_TYPES.TryStatement,
  AST_NODE_TYPES.WhileStatement,
  AST_NODE_TYPES.WithStatement,
]);

function isDirective(node: TSESTree.ExpressionStatement): boolean {
  return typeof node.directive === 'string';
}

function isTopLevelControl(node: TSESTree.Node, sourceCode: SourceCode): boolean {
  return (
    node.parent?.type === AST_NODE_TYPES.Program &&
    TOP_LEVEL_CONTROL.has(node.type) &&
    !isMainGuard(node, sourceCode)
  );
}

function executesAtModuleLoad(node: TSESTree.Node, sourceCode: SourceCode): boolean {
  for (const current of ancestorsOf(node)) {
    if (
      current.type === AST_NODE_TYPES.ArrowFunctionExpression ||
      current.type === AST_NODE_TYPES.FunctionDeclaration ||
      current.type === AST_NODE_TYPES.FunctionExpression ||
      guardedByMain(current, node, sourceCode)
    ) {
      return false;
    }
    if (current.type === AST_NODE_TYPES.Program) {
      return true;
    }
  }
  return false;
}

function memberPath(node: TSESTree.Node): (string | undefined)[] {
  const chain = [node];
  for (const current of chain) {
    if (current.type === AST_NODE_TYPES.MemberExpression) {
      chain.push(current.object);
    }
  }
  return chain.map(calleeNameOf).reverse();
}

const EFFECT_CALLEES = new Set<string | undefined>([
  'fetch',
  'setTimeout',
  'setInterval',
  'setImmediate',
  'queueMicrotask',
  'randomUUID',
  'randomBytes',
  'randomInt',
  'getRandomValues',
  'addEventListener',
]);
const GLOBAL_OBJECTS = new Set<string | undefined>(['globalThis', 'window', 'self', 'crypto']);
const EFFECT_MEMBER_CALLS = new Set<string | undefined>([
  'Date.now',
  'performance.now',
  'Math.random',
]);
const EFFECT_CONSTRUCTORS = new Set<string>([
  'Worker',
  'WebSocket',
  'XMLHttpRequest',
  'EventSource',
]);

function isModuleLevelDeclaration(node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.VariableDeclaration &&
    (node.parent.type === AST_NODE_TYPES.Program ||
      (node.parent.type === AST_NODE_TYPES.ExportNamedDeclaration &&
        node.parent.parent.type === AST_NODE_TYPES.Program))
  );
}

function calleeText(callee: TSESTree.Node): string | undefined {
  const path = memberPath(callee);
  return path.every((segment) => segment !== undefined) ? path.join('.') : undefined;
}

function isNodeSyncCall(node: CallLike, syncBindings: ModuleBindings): boolean {
  return importedCalleeName(node.callee, syncBindings)?.endsWith('Sync') === true;
}

function importTimeEffect(node: CallLike, syncBindings: ModuleBindings): string | undefined {
  if (node.type === AST_NODE_TYPES.NewExpression) {
    const name = calleeText(node.callee);
    const isClock = name === 'Date' && node.arguments.length === 0;
    return name !== undefined && (isClock || EFFECT_CONSTRUCTORS.has(name))
      ? `new ${name}()`
      : undefined;
  }
  const text = calleeText(node.callee);
  const name = text?.split('.').at(-1);
  const root = text?.split('.')[0];
  const isEffect =
    (EFFECT_CALLEES.has(name) && (text === name || GLOBAL_OBJECTS.has(root))) ||
    EFFECT_MEMBER_CALLS.has(text) ||
    isNodeSyncCall(node, syncBindings) ||
    text?.startsWith('process.') === true;
  return text !== undefined && isEffect ? `${text}()` : undefined;
}

function isCommonJsExport(expression: TSESTree.Node): boolean {
  if (expression.type !== AST_NODE_TYPES.AssignmentExpression || expression.operator !== '=') {
    return false;
  }
  const path = memberPath(expression.left);
  return (
    (path[0] === 'module' && path[1] === 'exports') || (path[0] === 'exports' && path.length > 1)
  );
}

function importTimeEffectAtLoad(
  node: CallLike,
  {
    syncBindings,
    sourceCode,
  }: { readonly syncBindings: ModuleBindings; readonly sourceCode: SourceCode },
): string | undefined {
  const call = importTimeEffect(node, syncBindings);
  return call !== undefined &&
    executesAtModuleLoad(node, sourceCode) &&
    ancestorsOf(node).some(isModuleLevelDeclaration)
    ? call
    : undefined;
}

export const rule: TSESLint.RuleModule<MessageIds, Options> = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Report statements that execute observable work while a module is imported',
    },
    schema: [
      {
        type: 'object',
        properties: { commonJsExports: { type: 'boolean' } },
        additionalProperties: false,
      },
    ],
    messages: {
      sideEffectImport: `Side-effect-only import executes code during module loading.${ENTRY_HINT}`,
      staticBlock: 'Static initialization block executes during module loading.',
      topLevelAwait: `Top-level await delays and executes work during module loading.${ENTRY_HINT}`,
      topLevelControl: `Top-level {{kind}} executes control flow during module loading.${ENTRY_HINT}`,
      topLevelExpression: `Top-level expression executes work during module loading.${ENTRY_HINT}`,
      importTimeEffect:
        '`{{call}}` runs when the module is imported. Move it into a function and call that from the composition root, passing the result in. An exception fits only when it must run at import.',
    },
  },
  create(context) {
    const commonJsExports = context.options[0]?.['commonJsExports'] === true;
    const { sourceCode } = context;
    const syncBindings = moduleBindings(sourceCode.ast, SYNC_MODULES);
    return {
      ImportDeclaration(node: TSESTree.ImportDeclaration) {
        if (node.specifiers.length === 0 && !stylesheetSpecifier.test(node.source.value)) {
          context.report({ node, messageId: 'sideEffectImport' });
        }
      },
      AwaitExpression(node: TSESTree.AwaitExpression) {
        if (executesAtModuleLoad(node, sourceCode)) {
          context.report({ node, messageId: 'topLevelAwait' });
        }
      },
      'NewExpression, CallExpression'(node: CallLike) {
        const call = importTimeEffectAtLoad(node, { syncBindings, sourceCode });
        if (call !== undefined) {
          context.report({ node, messageId: 'importTimeEffect', data: { call } });
        }
      },
      ExpressionStatement(node: TSESTree.ExpressionStatement) {
        if (
          node.parent.type !== AST_NODE_TYPES.Program ||
          isDirective(node) ||
          node.expression.type === AST_NODE_TYPES.AwaitExpression ||
          (commonJsExports && isCommonJsExport(node.expression))
        ) {
          return;
        }
        context.report({ node, messageId: 'topLevelExpression' });
      },
      StaticBlock(node: TSESTree.StaticBlock) {
        if (executesAtModuleLoad(node, sourceCode)) {
          context.report({ node, messageId: 'staticBlock' });
        }
      },
      ':statement'(node: TSESTree.Statement) {
        if (isTopLevelControl(node, sourceCode)) {
          context.report({
            node,
            messageId: 'topLevelControl',
            data: { kind: node.type },
          });
        }
      },
    };
  },
};
