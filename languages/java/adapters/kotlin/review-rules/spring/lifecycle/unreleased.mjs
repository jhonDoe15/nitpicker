import { annotationIn } from '../spring-names.mjs';
import { beanMethodNames, entriesOf, has, ownerOf, report } from '../spring-scopes.mjs';
import { BEAN, PRE_DESTROY, SPRING_MANAGED_CLASSES, group } from '../spring-types.mjs';
import { constructsThread, ownsCall } from './owned-resources.mjs';

const SPRING = 'org.springframework';
const EVENT_LISTENER = group([`${SPRING}.context.event.EventListener`]);
const CONTEXT_CLOSED = group([`${SPRING}.context.event.ContextClosedEvent`]);
const OWNER_CALLBACKS = [
  ['destroy', group([`${SPRING}.beans.factory.DisposableBean`])],
  ['close', group(['java.lang.AutoCloseable', 'java.io.Closeable'])],
  ['stop', group([`${SPRING}.context.Lifecycle`, `${SPRING}.context.SmartLifecycle`])],
];
const RELEASES = new Set([
  'shutdown',
  'shutdownNow',
  'close',
  'shutdownGracefully',
  'cancel',
  'interrupt',
  'stop',
  'destroy',
  'dispose',
  'terminate',
  'disconnect',
  'release',
  'cancelChildren',
]);
const RELEASING = /shutdown|close|stop|terminate|dispose|destroy|release|cancel/iu;
const THIS = /^this\./u;
const CLASS_LITERAL = /::class(?:\.java)?$/u;

function plain(text) {
  return (text ?? '').replace(THIS, '').replace(/[?!]+$/u, '');
}

function listensForClose(view, fn) {
  const listener = annotationIn(view.resolve, entriesOf(fn), EVENT_LISTENER);
  return (
    fn.parameters.some(({ type }) => view.is(type, CONTEXT_CLOSED)) ||
    (listener?.arguments ?? []).some(({ text }) =>
      view.is(text.replace(CLASS_LITERAL, ''), CONTEXT_CLOSED),
    )
  );
}

function ownersOf(view, declared, destroyNames) {
  const supers = declared.supers ?? [];
  return view
    .functionsOf(declared.qualified)
    .filter(
      (fn) =>
        has(view, fn, PRE_DESTROY) ||
        listensForClose(view, fn) ||
        (fn.parameters.length === 0 && destroyNames.has(fn.name)) ||
        OWNER_CALLBACKS.some(
          ([name, types]) =>
            fn.name === name && supers.some((type) => view.extendsType(type, types)),
        ),
    );
}

function inClass(view, invocation, declared) {
  return ownerOf(view, invocation) === declared.qualified;
}

function targets(view, invocation, name) {
  const text = invocation.assignedTo;
  return (
    text !== undefined &&
    plain(text) === name &&
    (THIS.test(text) || !view.declaresLocally(invocation.scope, name))
  );
}

function onProperty(invocation, name) {
  const receiver = plain(invocation.receiver);
  return receiver === name || receiver.startsWith(`${name}.`);
}

function released(view, { declared, owners }, name) {
  return view.file.invocations.some(
    (invocation) =>
      inClass(view, invocation, declared) &&
      ((RELEASES.has(invocation.name) && onProperty(invocation, name)) ||
        (RELEASING.test(invocation.name) &&
          invocation.arguments.some(({ text }) => plain(text) === name)) ||
        (owners.includes(view.functionAt(invocation.scope)) &&
          (onProperty(invocation, name) ||
            invocation.arguments.some(({ text }) => plain(text) === name)))),
  );
}

function started(view, declared, name) {
  return view.file.invocations.some(
    (invocation) =>
      invocation.name === 'start' &&
      plain(invocation.receiver) === name &&
      inClass(view, invocation, declared),
  );
}

function owned(view, declared, name) {
  const values = view.file.invocations.filter(
    (invocation) => inClass(view, invocation, declared) && targets(view, invocation, name),
  );
  return values.some(
    (invocation) =>
      ownsCall(view, invocation) ||
      (constructsThread(view, invocation) && started(view, declared, name)),
  );
}

function exposedAsBean(view, declared, name) {
  return view
    .functionsOf(declared.qualified)
    .some((fn) => has(view, fn, BEAN) && fn.returns === name);
}

function unreleasedResources(view) {
  const destroyNames = beanMethodNames(view, 'destroyMethod');
  return view.file.classes
    .filter(
      (declared) =>
        annotationIn(view.resolve, declared.annotations, SPRING_MANAGED_CLASSES) !== undefined,
    )
    .flatMap((declared) => {
      const owners = ownersOf(view, declared, destroyNames);
      return view
        .propertiesOf(declared.qualified)
        .filter((property) => owned(view, declared, property.name))
        .filter(
          (property) => owners.length === 0 || !released(view, { declared, owners }, property.name),
        )
        .filter((property) => !exposedAsBean(view, declared, property.name))
        .map((property) =>
          report('SpringUnreleasedResource', property, `${declared.qualified}.${property.name}`),
        );
    });
}

export const UNRELEASED_RULES = [unreleasedResources];
