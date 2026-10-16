import { stylesheetSpecifier } from '../../../layout.mjs';
import { ancestorsOf } from '../analysis/ancestry.mjs';

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

function executesAtModuleLoad(node) {
  for (const current of ancestorsOf(node)) {
    if (
      current.type === 'ArrowFunctionExpression' ||
      current.type === 'FunctionDeclaration' ||
      current.type === 'FunctionExpression'
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

function isCommonJsExport(expression) {
  if (expression.type !== 'AssignmentExpression' || expression.operator !== '=') {
    return false;
  }
  const path = memberPath(expression.left);
  return (
    (path[0] === 'module' && path[1] === 'exports') || (path[0] === 'exports' && path.length > 1)
  );
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
    },
  },
  create(context) {
    const commonJsExports = context.options[0]?.commonJsExports === true;
    return {
      ImportDeclaration(node) {
        if (node.specifiers.length === 0 && !stylesheetSpecifier.test(node.source.value)) {
          context.report({ node, messageId: 'sideEffectImport' });
        }
      },
      ExpressionStatement(node) {
        if (node.parent.type !== 'Program' || isDirective(node)) {
          return;
        }
        if (commonJsExports && isCommonJsExport(node.expression)) {
          return;
        }
        context.report({
          node,
          messageId:
            node.expression.type === 'AwaitExpression' ? 'topLevelAwait' : 'topLevelExpression',
        });
      },
      StaticBlock(node) {
        if (executesAtModuleLoad(node)) {
          context.report({ node, messageId: 'staticBlock' });
        }
      },
      ':statement'(node) {
        if (node.parent?.type === 'Program' && TOP_LEVEL_CONTROL.has(node.type)) {
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
