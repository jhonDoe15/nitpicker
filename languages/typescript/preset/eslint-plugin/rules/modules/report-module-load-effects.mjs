import { stylesheetSpecifier } from '../../../layout.mjs';
import { ancestorsOf } from '../analysis/ancestry.mjs';
import { SYNC_API_MODULES } from '../analysis/node/node-sync-modules.mjs';
import { importedCalleeName, moduleBindings } from '../analysis/subprocess-calls.mjs';
import { guardedByMain, isMainGuard } from './entry/main-guard.mjs';

const SYNC_MODULES = new Set(SYNC_API_MODULES);

const ENTRY_HINT =
  " Move the work into a function that the app entry calls. The entry (the module script in Vite's index.html, else src/main.tsx) is detected; for another entry file, list it under `layout.entryPoints` in nitpicker.config.json.";

const TOP_LEVEL_CONTROL = new Set([
  'BlockStatement',
  'DoWhileStatement',
  'ForInStatement',
  'ForOfStatement',
  'ForStatement',
  'IfStatement',
  'SwitchStatement',
  'TryStatement',
  'WhileStatement',
  'WithStatement',
]);

function isDirective(node) {
  return typeof node.directive === 'string';
}

function isTopLevelControl(node, sourceCode) {
  return (
    node.parent?.type === 'Program' &&
    TOP_LEVEL_CONTROL.has(node.type) &&
    !isMainGuard(node, sourceCode)
  );
}

function executesAtModuleLoad(node, sourceCode) {
  for (const current of ancestorsOf(node)) {
    if (
      current.type === 'ArrowFunctionExpression' ||
      current.type === 'FunctionDeclaration' ||
      current.type === 'FunctionExpression' ||
      guardedByMain(current, node, sourceCode)
    ) {
      return false;
    }
    if (current.type === 'Program') {
      return true;
    }
  }
  return false;
}

function segmentName(node) {
  if (node.type === 'Identifier') {
    return node.name;
  }
  return node.type === 'MemberExpression' && !node.computed ? node.property.name : undefined;
}

function memberPath(node) {
  const chain = [node];
  for (const current of chain) {
    if (current.type === 'MemberExpression') {
      chain.push(current.object);
    }
  }
  return chain.map(segmentName).reverse();
}

const EFFECT_CALLEES = new Set([
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
const GLOBAL_OBJECTS = new Set(['globalThis', 'window', 'self', 'crypto']);
const EFFECT_MEMBER_CALLS = new Set(['Date.now', 'performance.now', 'Math.random']);
const EFFECT_CONSTRUCTORS = new Set(['Worker', 'WebSocket', 'XMLHttpRequest', 'EventSource']);

function isModuleLevelDeclaration(node) {
  return (
    node.type === 'VariableDeclaration' &&
    (node.parent.type === 'Program' ||
      (node.parent.type === 'ExportNamedDeclaration' && node.parent.parent.type === 'Program'))
  );
}

function calleeText(callee) {
  const path = memberPath(callee);
  return path.every((segment) => segment !== undefined) ? path.join('.') : undefined;
}

function isNodeSyncCall(node, syncBindings) {
  return importedCalleeName(node.callee, syncBindings)?.endsWith('Sync') === true;
}

function importTimeEffect(node, syncBindings) {
  if (node.type === 'NewExpression') {
    const name = calleeText(node.callee);
    const isClock = name === 'Date' && node.arguments.length === 0;
    return isClock || EFFECT_CONSTRUCTORS.has(name) ? `new ${name}()` : undefined;
  }
  const text = calleeText(node.callee);
  const name = text?.split('.').at(-1);
  const root = text?.split('.')[0];
  const isEffect =
    (EFFECT_CALLEES.has(name) && (text === name || GLOBAL_OBJECTS.has(root))) ||
    EFFECT_MEMBER_CALLS.has(text) ||
    isNodeSyncCall(node, syncBindings) ||
    text?.startsWith('process.');
  return isEffect ? `${text}()` : undefined;
}

function isCommonJsExport(expression) {
  if (expression.type !== 'AssignmentExpression' || expression.operator !== '=') {
    return false;
  }
  const path = memberPath(expression.left);
  return (
    (path[0] === 'module' && path[1] === 'exports') || (path[0] === 'exports' && path.length > 1)
  );
}

function importTimeEffectAtLoad(node, { syncBindings, sourceCode }) {
  const call = importTimeEffect(node, syncBindings);
  return call !== undefined &&
    executesAtModuleLoad(node, sourceCode) &&
    ancestorsOf(node).some(isModuleLevelDeclaration)
    ? call
    : undefined;
}

export const rule = {
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
    const commonJsExports = context.options[0]?.commonJsExports === true;
    const { sourceCode } = context;
    const syncBindings = moduleBindings(sourceCode.ast, SYNC_MODULES);
    return {
      ImportDeclaration(node) {
        if (node.specifiers.length === 0 && !stylesheetSpecifier.test(node.source.value)) {
          context.report({ node, messageId: 'sideEffectImport' });
        }
      },
      AwaitExpression(node) {
        if (executesAtModuleLoad(node, sourceCode)) {
          context.report({ node, messageId: 'topLevelAwait' });
        }
      },
      'NewExpression, CallExpression'(node) {
        const call = importTimeEffectAtLoad(node, { syncBindings, sourceCode });
        if (call !== undefined) {
          context.report({ node, messageId: 'importTimeEffect', data: { call } });
        }
      },
      ExpressionStatement(node) {
        if (
          node.parent.type !== 'Program' ||
          isDirective(node) ||
          node.expression.type === 'AwaitExpression' ||
          (commonJsExports && isCommonJsExport(node.expression))
        ) {
          return;
        }
        context.report({ node, messageId: 'topLevelExpression' });
      },
      StaticBlock(node) {
        if (executesAtModuleLoad(node, sourceCode)) {
          context.report({ node, messageId: 'staticBlock' });
        }
      },
      ':statement'(node) {
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
