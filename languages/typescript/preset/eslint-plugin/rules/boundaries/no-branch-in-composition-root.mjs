import { ancestorsOf } from '../analysis/ancestry.mjs';
import { compositionRootOptionsSchema, isCompositionRootFile } from './composition-root-files.mjs';
import { mentionsEntryPoint } from '../modules/no-process-globals-outside-main-guard.mjs';

function isMainGuard(node) {
  return node?.type === 'IfStatement' && mentionsEntryPoint(node.test);
}

function isInMainGuardTest(node) {
  return [node, ...ancestorsOf(node)].some(
    (current) => isMainGuard(current.parent) && current === current.parent.test,
  );
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
        "The composition root only wires features: it passes things in and does not branch. Move this lookup or decision into the feature's adapters/ or domain/. If this branch belongs here, add an exception for this rule in nitpicker.config.json.",
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
    };
  },
};
