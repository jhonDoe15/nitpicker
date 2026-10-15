import { ancestorsOf } from './ancestry.mjs';
import { compositionRootOptionsSchema, isCompositionRootFile } from './composition-root-files.mjs';
import { mentionsEntryPoint } from './no-process-globals-outside-main-guard.mjs';

function isMainGuard(node) {
  return node?.type === 'IfStatement' && mentionsEntryPoint(node.test);
}

function isInMainGuardTest(node) {
  return [node, ...ancestorsOf(node)].some(
    (current) => isMainGuard(current.parent) && current === current.parent.test,
  );
}

const LOOP_TYPES = [
  'ForStatement',
  'ForInStatement',
  'ForOfStatement',
  'WhileStatement',
  'DoWhileStatement',
];
const DEFAULT_VALUE_TYPES = new Set([
  'Literal',
  'TemplateLiteral',
  'ObjectExpression',
  'ArrayExpression',
  'CallExpression',
  'NewExpression',
]);

function isDefaultValue(node) {
  return node.operator === '||' && DEFAULT_VALUE_TYPES.has(node.right.type);
}

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Keep branches out of composition roots, which only wire features together',
    },
    schema: compositionRootOptionsSchema,
    messages: {
      branch:
        "The composition root only wires features: it passes things in and does not branch, loop or default a missing value (`??`, `||`). Move this lookup or decision into the feature's adapters/ or domain/. If this branch belongs here, add an exception for this rule in nitpicker.config.json.",
    },
  },
  create(context) {
    if (!isCompositionRootFile(context)) {
      return {};
    }
    function report(node) {
      if (!isMainGuard(node) && !isInMainGuardTest(node)) {
        context.report({ node, messageId: 'branch' });
      }
    }

    return {
      IfStatement: report,
      ConditionalExpression: report,
      SwitchStatement: report,
      ChainExpression: report,
      'LogicalExpression[operator="??"]': report,
      LogicalExpression(node) {
        if (isDefaultValue(node)) {
          report(node);
        }
      },
      [LOOP_TYPES.join(', ')]: report,
    };
  },
};
