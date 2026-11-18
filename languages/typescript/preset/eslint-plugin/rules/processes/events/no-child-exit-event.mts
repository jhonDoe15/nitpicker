import { type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { subprocessBindings } from '../../analysis/subprocess-calls.mts';
import {
  childOf,
  defaultsExitCode,
  enclosingFunction,
  listener,
  listensFor,
  usesAny,
  awaitsInside,
  collectedOutput,
  discardsOutput,
  testsSignal,
} from './child-events.mts';

export const rule: TSESLint.RuleModule<'useClose'> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        "Require waiting for a child process on 'close' when its output or exit code is used",
    },
    schema: [],
    messages: {
      useClose:
        "'exit' can fire before the child's stdout and stderr are drained, so the last chunk of output is lost, and a child killed by a signal passes code null, which a default such as `code ?? 0` turns into success. Wait on 'close' with (code, signal) and treat a signal or a missing code as failure, or use `events.once(child, 'close')`. An 'exit' listener that only logs or cleans up and reads no output is fine.",
    },
  },
  create(context) {
    const { sourceCode } = context;
    const bindings = subprocessBindings(sourceCode.ast);
    return {
      CallExpression(call: TSESTree.CallExpression) {
        const heard = listener(call);
        if (heard?.event !== 'exit') {
          return;
        }
        const child = childOf(sourceCode, heard.receiver, bindings);
        if (child === undefined) {
          return;
        }
        const scope = enclosingFunction(child.node) ?? sourceCode.ast;
        const closes =
          child.text !== undefined &&
          listensFor({ node: scope, source: sourceCode }, { child: child.text, event: 'close' });
        const collected =
          child.text === undefined
            ? new Set<string>()
            : collectedOutput(sourceCode, scope, child.text);
        if (
          !closes &&
          !awaitsInside(heard.handler) &&
          !testsSignal(heard.handler) &&
          !discardsOutput(child) &&
          (usesAny(heard.handler, collected) || defaultsExitCode(heard.handler))
        ) {
          context.report({ node: call, messageId: 'useClose' });
        }
      },
    };
  },
};
