import {
  coroutineType,
  hasMember,
  importResolver,
  isCoroutineExtension,
  coroutineFunction,
} from './coroutine-names.mjs';

export const SUSPEND_CLEANUP_RULE = 'SuspendFunInFinallySection';

const BOUNDED =
  'run the release as `withContext(NonCancellable) { withTimeout(5.seconds) { ... } }` so it finishes after cancellation but cannot wait forever, and shield only the release itself, in the scope that opened the resource';
const FINALLY_MESSAGE = (call) =>
  `This \`finally\` block calls the suspending \`${call}\`, which throws as soon as the coroutine is cancelled, so the rest of the cleanup is skipped and the resource stays open. Make the release non-suspending (a blocking \`close()\`), or ${BOUNDED}.`;
const CATCH_MESSAGE = (call) =>
  `This \`catch (CancellationException)\` block calls the suspending \`${call}\`, but the coroutine is already cancelled, so the call throws at once and the rest of the handler is skipped. Rethrow after non-suspending cleanup, or ${BOUNDED}.`;
const CANCELLABLE_CONTEXT_TERMS = [
  /^(?:kotlinx\.coroutines\.)?Dispatchers\.\w+(?:\.limitedParallelism\(.*\))?$/u,
  /^CoroutineName\(.*\)$/u,
  /^EmptyCoroutineContext$/u,
];
const CALL_LABEL_LENGTH = 40;

function ownersOf(owner) {
  const parts = owner === undefined ? [] : owner.split('.');
  return ['', ...parts.map((_, index) => parts.slice(0, index + 1).join('.'))];
}

function declaredSuspend(file, call) {
  const owners = new Set(ownersOf(call.owner));
  const declared = file.functions.filter(
    ({ name, owner }) => name === call.name && owners.has(owner),
  );
  return declared.length === 0
    ? undefined
    : declared.every(({ modifiers }) => modifiers.includes('suspend'));
}

function memberSuspend(files, type, name) {
  const simple = type.slice(type.lastIndexOf('.') + 1);
  const owners = files.flatMap((candidate) =>
    candidate.classes
      .filter((klass) => klass.name === simple || klass.qualified === type)
      .map((klass) => ({ candidate, klass })),
  );
  if (owners.length !== 1) {
    return undefined;
  }
  const [{ candidate, klass }] = owners;
  const declared = candidate.functions.filter(
    ({ owner, name: declaredName }) => owner === klass.qualified && declaredName === name,
  );
  return declared.length > 0 && declared.every(({ modifiers }) => modifiers.includes('suspend'));
}

function cancellableContext(context) {
  if (context === undefined) {
    return false;
  }
  return context
    .split('+')
    .every((term) => CANCELLABLE_CONTEXT_TERMS.some((pattern) => pattern.test(term.trim())));
}

function isSuspendCall({ file, files }, resolves, call) {
  if (call.receiver === undefined || call.receiver === 'this') {
    return unqualifiedSuspend(file, resolves, call);
  }
  if (isCoroutineExtension(resolves, call.name)) {
    return true;
  }
  if (call.receiver === 'other' && call.qualifier !== undefined) {
    return coroutineFunction(resolves, call) !== undefined && permitted(call, call.name);
  }
  if (call.receiver === 'other' || call.receiverType === undefined) {
    return false;
  }
  const type = coroutineType(resolves, call.receiverType);
  if (type !== undefined) {
    return hasMember(type, call.name);
  }
  return memberSuspend(files, call.receiverType, call.name) === true;
}

function unqualifiedSuspend(file, resolves, call) {
  if (call.receiver === undefined && call.calleeType?.startsWith('suspend')) {
    return true;
  }
  const declared = declaredSuspend(file, call);
  if (declared !== undefined) {
    return declared;
  }
  if (file.functions.some(({ name }) => name === call.name)) {
    return false;
  }
  const real = coroutineFunction(resolves, { name: call.name });
  return real !== undefined && permitted(call, real);
}

function permitted(call, real) {
  return real !== 'withContext' || cancellableContext(call.context);
}

function labelOf(call) {
  const qualifier = call.qualifier;
  const prefix =
    qualifier !== undefined && qualifier.length <= CALL_LABEL_LENGTH ? `${qualifier}.` : '';
  return `${prefix}${call.name}()`;
}

export function suspendCleanupFindings(files, { finding, declaredIn = files }) {
  return files.flatMap((file) => {
    const resolves = importResolver(file);
    return (file.cleanupCalls ?? [])
      .filter((call) => isSuspendCall({ file, files: declaredIn }, resolves, call))
      .map((call) => {
        const owner = call.owner === undefined ? '' : `${call.owner}.`;
        const inCatch = call.section === 'catch';
        return finding({
          tool: 'kotlin-source',
          rule: SUSPEND_CLEANUP_RULE,
          file: file.file,
          line: call.line,
          symbol: `${owner}${call.function}:${inCatch ? 'catch:' : ''}${call.name}`,
          message: (inCatch ? CATCH_MESSAGE : FINALLY_MESSAGE)(labelOf(call)),
        });
      });
  });
}
