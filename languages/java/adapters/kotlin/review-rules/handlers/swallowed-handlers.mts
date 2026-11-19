import type { ImportFact, KotlinFile } from '../typed/kotlin-fact-types.mts';
import type { HandlerFact } from '../typed/kotlin-flow-types.mts';
import type { ReviewFinding, RuleOptions } from '../typed/review-finding-types.mts';
import { readCatalog } from '../../../../messages/rule-messages.mts';
import { bareType } from '../kotlin-facts.mts';

export const SWALLOWED_INTERRUPT_RULE = 'SwallowedInterrupt';
export const SWALLOWED_CANCELLATION_RULE = 'SwallowedCancellation';

export const INTERRUPT_PROBLEM =
  'This catch of InterruptedException can complete without rethrowing it or restoring the interrupt, so the interrupt status of the thread is lost and work that was asked to stop keeps running.';
export const INTERRUPT_MESSAGE = `${INTERRUPT_PROBLEM} ${String(readCatalog('pmd')['SwallowedInterrupt']?.fix)}`;
const CANCELLATION_MESSAGE =
  'This catch of CancellationException in a suspend function or coroutine body can complete without rethrowing it or checking that the coroutine is still active, so cancellation is consumed and the coroutine keeps running after its owner cancelled it. Rethrow it (throw e), call ensureActive() in the handler to rethrow only when this coroutine was itself cancelled, or catch only the specific failure you expect.';

const INTERRUPTED = 'java.lang.InterruptedException';
const CANCELLATIONS = new Set([
  'kotlin.coroutines.cancellation.CancellationException',
  'kotlinx.coroutines.CancellationException',
  'java.util.concurrent.CancellationException',
]);
const GENERIC_ARGUMENTS = /<.*$/u;

function visibleName({ path, alias }: ImportFact): string {
  return alias ?? path.slice(path.lastIndexOf('.') + 1);
}

function importedAs(file: KotlinFile, name: string): string | undefined {
  return file.imports.find((entry) => !entry.all && visibleName(entry) === name)?.path;
}

function declaredInProject(files: KotlinFile[], name: string): boolean {
  return files.some(
    ({ classes, typeAliases = [] }) =>
      classes.some((klass) => klass.name === name) ||
      typeAliases.some((alias) => alias.name === name),
  );
}

function wildcardMatch(file: KotlinFile, name: string): string | undefined {
  const candidates = file.imports
    .filter(({ all }) => all)
    .map(({ path }) => `${path}.${name}`)
    .filter((full) => CANCELLATIONS.has(full) || full === INTERRUPTED);
  return candidates.length === 1 ? candidates[0] : undefined;
}

function plainName(type: string | undefined): string {
  return bareType(type).replace(GENERIC_ARGUMENTS, '');
}

function resolveUnaliased(file: KotlinFile, name: string, files: KotlinFile[]): string | undefined {
  if (name.includes('.')) {
    return name;
  }
  const imported = importedAs(file, name);
  if (imported !== undefined) {
    return imported;
  }
  if (declaredInProject(files, name)) {
    return undefined;
  }
  return wildcardMatch(file, name) ?? (name === 'InterruptedException' ? INTERRUPTED : undefined);
}

function resolve(file: KotlinFile, type: string, files: KotlinFile[]): string | undefined {
  const name = plainName(type);
  const direct = name.includes('.') || importedAs(file, name) !== undefined;
  const alias = direct ? undefined : file.typeAliases?.find((entry) => entry.name === name);
  if (alias === undefined) {
    return resolveUnaliased(file, name, files);
  }
  return alias.target === name ? undefined : resolveUnaliased(file, plainName(alias.target), files);
}

function ruleOf(
  caught: HandlerFact,
  resolved: string,
): { rule: string; message: string } | undefined {
  if (resolved === INTERRUPTED && caught.interrupt) {
    return { rule: SWALLOWED_INTERRUPT_RULE, message: INTERRUPT_MESSAGE };
  }
  if (CANCELLATIONS.has(resolved) && caught.cancellation) {
    return { rule: SWALLOWED_CANCELLATION_RULE, message: CANCELLATION_MESSAGE };
  }
  return undefined;
}

export function swallowedHandlerFindings(
  files: KotlinFile[],
  { finding, declaredIn = files }: RuleOptions,
): ReviewFinding[] {
  return files.flatMap((file) =>
    (file.handlers ?? []).flatMap((caught) => {
      const resolved = resolve(file, caught.type, declaredIn);
      const reported = resolved === undefined ? undefined : ruleOf(caught, resolved);
      if (resolved === undefined || reported === undefined) {
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
