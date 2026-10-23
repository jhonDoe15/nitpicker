import { bareType } from '../kotlin-facts.mjs';

export const SWALLOWED_INTERRUPT_RULE = 'SwallowedInterrupt';
export const SWALLOWED_CANCELLATION_RULE = 'SwallowedCancellation';

export const INTERRUPT_MESSAGE =
  'This catch of InterruptedException neither rethrows it nor restores the interrupt, so the interrupt status of the thread is lost and work that was asked to stop keeps running. Call Thread.currentThread().interrupt() before leaving the handler, or rethrow: throw e, or throw a new exception with the cause.';
export const CANCELLATION_MESSAGE =
  'This catch of CancellationException neither rethrows it nor checks that the coroutine is still active, so cancellation is consumed and the coroutine keeps running after its owner cancelled it. Rethrow it (throw e), call ensureActive() in the handler to rethrow only when this coroutine was itself cancelled, or catch only the specific failure you expect.';

const INTERRUPTED = 'java.lang.InterruptedException';
const CANCELLATIONS = new Set([
  'kotlin.coroutines.cancellation.CancellationException',
  'kotlinx.coroutines.CancellationException',
  'java.util.concurrent.CancellationException',
]);
const GENERIC_ARGUMENTS = /<.*$/u;

function visibleName({ path, alias }) {
  return alias ?? path.slice(path.lastIndexOf('.') + 1);
}

function importedAs(file, name) {
  return file.imports.find((entry) => !entry.all && visibleName(entry) === name)?.path;
}

function declaredInProject(files, name) {
  return files.some(
    ({ classes, typeAliases = [] }) =>
      classes.some((klass) => klass.name === name) ||
      typeAliases.some((alias) => alias.name === name),
  );
}

function wildcardMatch(file, name) {
  const candidates = file.imports
    .filter(({ all }) => all)
    .map(({ path }) => `${path}.${name}`)
    .filter((full) => CANCELLATIONS.has(full) || full === INTERRUPTED);
  return candidates.length === 1 ? candidates[0] : undefined;
}

function resolve(file, type, files) {
  const name = bareType(type).replace(GENERIC_ARGUMENTS, '');
  if (name.includes('.')) {
    return name;
  }
  const imported = importedAs(file, name);
  if (imported !== undefined) {
    return imported;
  }
  const alias = file.typeAliases?.find((entry) => entry.name === name);
  if (alias !== undefined) {
    return alias.target === name
      ? undefined
      : resolve({ ...file, typeAliases: [] }, alias.target, files);
  }
  if (declaredInProject(files, name)) {
    return undefined;
  }
  return wildcardMatch(file, name) ?? (name === 'InterruptedException' ? INTERRUPTED : undefined);
}

function ruleOf(caught, resolved) {
  if (resolved === INTERRUPTED && caught.interrupt) {
    return { rule: SWALLOWED_INTERRUPT_RULE, message: INTERRUPT_MESSAGE };
  }
  if (CANCELLATIONS.has(resolved) && caught.cancellation) {
    return { rule: SWALLOWED_CANCELLATION_RULE, message: CANCELLATION_MESSAGE };
  }
  return undefined;
}

export function swallowedHandlerFindings(files, { finding, declaredIn = files }) {
  return files.flatMap((file) =>
    (file.handlers ?? []).flatMap((caught) => {
      const resolved = resolve(file, caught.type, declaredIn);
      const reported = resolved === undefined ? undefined : ruleOf(caught, resolved);
      if (reported === undefined) {
        return [];
      }
      const symbol = caught.symbol === '' ? file.file : caught.symbol;
      return [
        finding({
          rule: reported.rule,
          file: file.file,
          line: caught.line,
          symbol,
          key: `${symbol}:${resolved.slice(resolved.lastIndexOf('.') + 1)}`,
          message: reported.message,
        }),
      ];
    }),
  );
}
