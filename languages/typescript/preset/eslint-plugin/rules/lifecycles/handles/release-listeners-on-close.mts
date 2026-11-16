import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import {
  compositionRootOptionsSchema,
  isCompositionRootFile,
  type CompositionRootOptions,
} from '../../boundaries/composition-root-files.mts';
import { nameOf, type SourceCode } from '../../typed/node-views.mts';
import { closeScope, type CloseScope } from '../scope/close-owners.mts';
import { functionName, type FunctionNode } from '../scope/close-scopes.mts';
import {
  type ContainerWithClosers,
  clearsHandle,
  containerWithClosers,
  insidePromiseExecutor,
  isOneShot,
  normalized,
  releasesListener,
  runsOnce,
  timerHandle,
} from './handle-releases.mts';

const REGISTER_METHODS = new Set<string>(['on', 'addListener', 'addEventListener']);
const TIMERS = new Set<string>(['setTimeout', 'setInterval']);
type Context = Readonly<TSESLint.RuleContext<'listener' | 'timer', CompositionRootOptions>>;

function closerName(owner: { readonly closers: readonly FunctionNode[] }): string | undefined {
  const [first] = owner.closers;
  return first === undefined ? undefined : functionName(first);
}

const EXCEPTION = ' An exception fits only when the emitter or timer dies with this scope.';

function reportListener(context: Context, call: TSESTree.CallExpression): void {
  const { sourceCode } = context;
  const { callee } = call;
  const registers =
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    REGISTER_METHODS.has(nameOf(callee.property) ?? '') &&
    call.arguments.length >= 2 &&
    !isOneShot(call);
  const owner = registers ? closeScope(sourceCode, callee.object) : undefined;
  const receiver = registers ? normalized(sourceCode, callee.object) : '';
  if (
    !registers ||
    owner === undefined ||
    runsOnce(call, owner) ||
    releasesListener(sourceCode, owner.container, receiver)
  ) {
    return;
  }
  const [first] = call.arguments;
  const event = first === undefined ? '' : sourceCode.getText(first);
  context.report({
    node: call,
    messageId: 'listener',
    data: {
      target: `${receiver}.${String(nameOf(callee.property))}(${event})`,
      closer: closerName(owner),
    },
  });
}

function timerOwner(
  { sourceCode, call }: { readonly sourceCode: SourceCode; readonly call: TSESTree.CallExpression },
  handle: TSESTree.Node | undefined,
  timer: string,
): CloseScope | ContainerWithClosers | undefined {
  if (handle !== undefined) {
    const owner = closeScope(sourceCode, handle);
    if (owner !== undefined) {
      return owner;
    }
  }
  return timer === 'setInterval' ? containerWithClosers(call) : undefined;
}

function reportTimer(context: Context, call: TSESTree.CallExpression): void {
  const { sourceCode } = context;
  const timer = call.callee.type === AST_NODE_TYPES.Identifier ? call.callee.name : undefined;
  if (timer === undefined || !TIMERS.has(timer) || insidePromiseExecutor(call)) {
    return;
  }
  const handle = timerHandle(call);
  const owner = timerOwner({ sourceCode, call }, handle, timer);
  if (owner === undefined) {
    return;
  }
  const handleText = handle === undefined ? undefined : normalized(sourceCode, handle);
  if (handleText !== undefined && clearsHandle(sourceCode, owner.container, handleText)) {
    return;
  }
  context.report({
    node: call,
    messageId: 'timer',
    data: {
      target: `${timer}(...)`,
      timer,
      clearer: timer === 'setTimeout' ? 'clearTimeout' : 'clearInterval',
      closer: closerName(owner),
    },
  });
}

export const rule: TSESLint.RuleModule<'listener' | 'timer', CompositionRootOptions> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require a close function to release the listeners and timers a long-lived scope registers',
    },
    schema: compositionRootOptionsSchema,
    messages: {
      listener: `{{target}} adds a listener to a long-lived emitter, but nothing in this scope removes it, so listeners pile up on each call and keep firing after {{closer}}(). Keep the handler in a variable and remove it with off() in {{closer}}, register it with once, or pass { signal } that {{closer}} aborts.${EXCEPTION}`,
      timer: `{{target}} starts a timer that nothing in this scope clears, so it fires after {{closer}}() and can restart work. Keep the handle (this.timer = {{timer}}(...)) and call {{clearer}}(this.timer) in {{closer}}.${EXCEPTION}`,
    },
  },
  create(context) {
    if (isCompositionRootFile(context)) {
      return {};
    }
    return {
      CallExpression(call: TSESTree.CallExpression) {
        reportListener(context, call);
        reportTimer(context, call);
      },
    };
  },
};
