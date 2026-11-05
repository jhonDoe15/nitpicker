import {
  moduleBindings,
  subprocessBindings,
  withPromisified,
} from '../analysis/subprocess-calls.mjs';
import { calleeMethod, displayName, promisifiedBinding, templateTag } from './process-callees.mjs';
import { lacksDeadline, optionsArgument } from './process-timeout-options.mjs';
import { isAwaited, waitsForChildEnd } from './process-completion.mjs';

const EVENTS = new Set(['events', 'node:events']);
const COMMAND_ONLY = new Set(['execSync', 'exec', 'execaCommand', 'execaCommandSync']);
const SYNC_CALLS = new Set([
  'execSync',
  'execFileSync',
  'spawnSync',
  'execaSync',
  'execaCommandSync',
  '$sync',
]);
const BUFFERED_CALLS = new Set(['exec', 'execFile']);
const EXECA_CALLS = new Set(['execa', 'execaCommand', 'execaNode', '$']);
const STREAM_CALLS = new Set(['spawn', 'fork']);
const NODE_SIGNALS = ['signal'];
const EXECA_SIGNALS = ['cancelSignal', 'signal'];

function waits(context, node, { name, events }) {
  if (SYNC_CALLS.has(name) || BUFFERED_CALLS.has(name)) {
    return true;
  }
  if (EXECA_CALLS.has(name)) {
    return isAwaited(context, node);
  }
  return STREAM_CALLS.has(name) && waitsForChildEnd(context, node, events);
}

function signalKeys(name) {
  if (SYNC_CALLS.has(name)) {
    return [];
  }
  return name.startsWith('execa') || name === '$' ? EXECA_SIGNALS : NODE_SIGNALS;
}

function report(context, node, method) {
  const messageId = SYNC_CALLS.has(method) ? 'missingTimeout' : 'missingDeadline';
  context.report({ node, messageId, data: { method: displayName(method) } });
}

function taggedLacksDeadline(context, call, method) {
  return (
    call === undefined ||
    lacksDeadline(context, call, { options: call.arguments[0], signalKeys: signalKeys(method) })
  );
}

export const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'Require a deadline on subprocesses that production code waits for' },
    schema: [],
    messages: {
      missingTimeout:
        'Give {{method}} a positive timeout, such as { timeout: 30_000 }. This call waits for the child process to exit, so a command that never exits hangs this request, job or command for good. An exception fits only a program whose purpose is to run the child to completion, such as a build wrapper.',
      missingDeadline:
        'Give {{method}} a deadline: { timeout: 30_000 } or { signal: AbortSignal.timeout(30_000) }. This code waits for the child process to exit, so a command that never exits hangs this request, job or command for good. An exception fits only a program whose purpose is to run the child to completion, such as a build wrapper.',
    },
  },
  create(context) {
    let bindings = { named: new Map(), namespaces: new Set() };
    let events = bindings;
    return {
      Program(node) {
        bindings = withPromisified(node, subprocessBindings(node));
        events = moduleBindings(node, EVENTS);
      },
      VariableDeclarator(node) {
        bindings = promisifiedBinding(node, bindings);
      },
      CallExpression(node) {
        const method = calleeMethod(node.callee, bindings);
        const isTag = node.parent?.type === 'TaggedTemplateExpression' && node.parent.tag === node;
        if (method === undefined || isTag || !waits(context, node, { name: method, events })) {
          return;
        }
        const options = optionsArgument(context, node, COMMAND_ONLY.has(method));
        if (lacksDeadline(context, node, { options, signalKeys: signalKeys(method) })) {
          report(context, node, method);
        }
      },
      TaggedTemplateExpression(node) {
        const tag = templateTag(node.tag, bindings);
        if (tag === undefined) {
          return;
        }
        const waited = SYNC_CALLS.has(tag.method) || isAwaited(context, node);
        if (waited && taggedLacksDeadline(context, tag.call, tag.method)) {
          report(context, node, tag.method);
        }
      },
    };
  },
};
