import {
  compositionRootOptionsSchema,
  isCompositionRootFile,
} from '../../boundaries/composition-root-files.mjs';
import { closeScope } from '../scope/close-owners.mjs';
import { functionName } from '../scope/close-scopes.mjs';
import {
  clearsHandle,
  containerWithClosers,
  insidePromiseExecutor,
  isOneShot,
  normalized,
  releasesListener,
  runsOnce,
  timerHandle,
} from './handle-releases.mjs';

const REGISTER_METHODS = new Set(['on', 'addListener', 'addEventListener']);
const TIMERS = new Set(['setTimeout', 'setInterval']);
const EXCEPTION = ' An exception fits only when the emitter or timer dies with this scope.';

function reportListener(context, call) {
  const { sourceCode } = context;
  const { callee } = call;
  const registers =
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    REGISTER_METHODS.has(callee.property.name) &&
    call.arguments.length >= 2 &&
    !isOneShot(call);
  const owner = registers ? closeScope(sourceCode, callee.object) : undefined;
  const receiver = registers ? normalized(sourceCode, callee.object) : '';
  if (
    owner === undefined ||
    runsOnce(call, owner) ||
    releasesListener(sourceCode, owner.container, receiver)
  ) {
    return;
  }
  const event = sourceCode.getText(call.arguments[0]);
  context.report({
    node: call,
    messageId: 'listener',
    data: {
      target: `${receiver}.${callee.property.name}(${event})`,
      closer: functionName(owner.closers[0]),
    },
  });
}

function timerOwner({ sourceCode, call }, handle, timer) {
  if (handle !== undefined) {
    const owner = closeScope(sourceCode, handle);
    if (owner !== undefined) {
      return owner;
    }
  }
  return timer === 'setInterval' ? containerWithClosers(call) : undefined;
}

function reportTimer(context, call) {
  const { sourceCode } = context;
  const timer = call.callee.type === 'Identifier' ? call.callee.name : undefined;
  if (!TIMERS.has(timer) || insidePromiseExecutor(call)) {
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
      closer: functionName(owner.closers[0]),
    },
  });
}

export const rule = {
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
      CallExpression(call) {
        reportListener(context, call);
        reportTimer(context, call);
      },
    };
  },
};
