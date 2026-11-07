import { annotationIn } from '../spring-names.mjs';
import {
  beanMethodNames,
  entriesOf,
  ownerOf,
  report,
  setupScopes,
  symbolOf,
} from '../spring-scopes.mjs';
import { POST_CONSTRUCT, SPRING_MANAGED_CLASSES, group } from '../spring-types.mjs';
import { constructsThread, ownsCall, startsThreads, THREAD } from './owned-resources.mjs';

const SPRING = 'org.springframework';
const FAILING = new Set(['bind', 'connect', 'start']);
const SUBMITS = new Set([
  'execute',
  'submit',
  'schedule',
  'scheduleAtFixedRate',
  'scheduleWithFixedDelay',
  'invokeAll',
]);
const STARTUP_CALLBACKS = [
  ['afterPropertiesSet', group([`${SPRING}.beans.factory.InitializingBean`])],
  ['run', group([`${SPRING}.boot.ApplicationRunner`, `${SPRING}.boot.CommandLineRunner`])],
  ['start', group([`${SPRING}.context.Lifecycle`, `${SPRING}.context.SmartLifecycle`])],
];
const NEVER_FAILING = group(
  [...THREAD],
  ['java.lang.Thread.Builder', 'java.util.regex.Matcher', `${SPRING}.util.StopWatch`],
);
const SELF = /^(?:this|super)$/u;
const THIS = /^this\./u;

function isStartup(view, fn, initNames) {
  const supers = view.classes.get(fn.owner)?.supers ?? [];
  return (
    annotationIn(view.resolve, entriesOf(fn), POST_CONSTRUCT) !== undefined ||
    (fn.parameters.length === 0 && initNames.has(fn.name)) ||
    STARTUP_CALLBACKS.some(
      ([name, types]) => fn.name === name && supers.some((type) => view.extendsType(type, types)),
    )
  );
}

function failingCall(view, invocation) {
  if (!FAILING.has(invocation.name) || invocation.guarded === true) {
    return false;
  }
  const { receiver } = invocation;
  if (receiver === undefined || SELF.test(receiver) || invocation.reference === true) {
    return false;
  }
  const type = view.typeOf(invocation.scope, receiver);
  return type === undefined || !view.is(type, NEVER_FAILING);
}

function sameFunction(view, invocation, other) {
  return view.functionAt(invocation.scope) === view.functionAt(other.scope);
}

function poolNames(view, owner) {
  return new Set(
    view.file.invocations
      .filter((invocation) => ownerOf(view, invocation) === owner && ownsCall(view, invocation))
      .map(({ assignedTo }) => assignedTo?.replace(THIS, ''))
      .filter(Boolean),
  );
}

function startedBefore(view, call) {
  const owner = ownerOf(view, call);
  const pools = poolNames(view, owner);
  return view.file.invocations.some(
    (invocation) =>
      ownerOf(view, invocation) === owner &&
      (startsThreads(view, invocation) ||
        (sameFunction(view, invocation, call) &&
          invocation.line < call.line &&
          (constructsThread(view, invocation) ||
            (SUBMITS.has(invocation.name) && pools.has(invocation.receiver?.replace(THIS, '')))))),
  );
}

function startupCleanup(view) {
  const initNames = beanMethodNames(view, 'initMethod');
  const startup = setupScopes(view, (fn) => isStartup(view, fn, initNames));
  return view.file.invocations
    .filter((invocation) => {
      const declared = view.classAt(invocation.scope);
      return (
        declared !== undefined &&
        annotationIn(view.resolve, declared.annotations, SPRING_MANAGED_CLASSES) !== undefined &&
        startup(invocation.scope) &&
        failingCall(view, invocation) &&
        startedBefore(view, invocation)
      );
    })
    .map((invocation) =>
      report('SpringStartupCleanup', invocation, symbolOf(view, invocation.scope, invocation.name)),
    );
}

export const STARTUP_RULES = [startupCleanup];
