import type { KotlinFile } from '../../typed/kotlin-fact-types.mts';
import type { FindingFactory, ReviewFinding } from '../../typed/review-finding-types.mts';
import type { ClassScope, ItemScope } from '../locking/locking-types.mts';
import type { UpdateFact, UpdateStep, ValueItem, WorkStep } from './suspension-types.mts';
import type {
  SaveState as State,
  SavedValue as Saved,
  SourceValue as Source,
  SuspensionSite,
} from './suspension-sites.mts';
import { suspendsAt, viewOf } from './suspend-calls.mts';
import { lockHeld } from './update-locks.mts';

export const SUSPENDED_UPDATE_RULE = 'NonAtomicUpdateAcrossSuspension';

function message(call: string, target: string): string {
  return `\`${target}\` is updated from a value read before \`${call}()\` suspends: another coroutine can change it meanwhile, and this write then overwrites that change. Call \`${call}()\` into a local first (\`val delta = ${call}()\`, then update \`${target}\`), or hold one Mutex around the whole read-modify-write (\`mutex.withLock { ... }\`).`;
}

function isClassScope(scope: ItemScope | undefined): scope is ClassScope {
  return scope?.k === 'class' && scope.qualified !== undefined;
}

function enclosing(update: UpdateFact): {
  klass: ClassScope | undefined;
  method: string | undefined;
  lambdas: ItemScope[];
} {
  const scopes = update.scopes;
  const klass = scopes.find(({ k }) => k === 'class');
  return {
    klass: isClassScope(klass) ? klass : undefined,
    method: scopes.find(({ k }) => k === 'fun')?.name,
    lambdas: scopes.filter(({ k }) => k === 'lambda'),
  };
}

const UNKNOWN = 'unknown';

type MemberKind = 'var' | 'val' | typeof UNKNOWN;

function memberKind(update: UpdateFact, { file, view, klass }: SuspensionSite): MemberKind {
  if (klass === undefined) {
    return UNKNOWN;
  }
  const property = file.properties.find(
    ({ owner, name }) => owner === klass.qualified && name === update.target,
  );
  if (property !== undefined) {
    return property.var && !property.delegated ? 'var' : 'val';
  }
  const parameter = view.classes
    .find(({ qualified }) => qualified === klass.qualified)
    ?.primaryParameters.find(({ name }) => name === update.target);
  const kind = parameter?.property;
  if (kind === undefined || kind === '') {
    return UNKNOWN;
  }
  return kind === 'var' ? 'var' : 'val';
}

function isSharedVariable(update: UpdateFact, site: SuspensionSite): boolean {
  if (update.locals.includes(update.target) && !update.viaThis) {
    return false;
  }
  const member = memberKind(update, site);
  if (member !== UNKNOWN) {
    return member === 'var';
  }
  const topLevel = (site.file.topLevelProperties ?? []).find(({ name }) => name === update.target);
  return !update.viaThis && topLevel?.var === true && !topLevel.delegated;
}

function readsTargetBefore(update: UpdateFact, calls: ValueItem[]): boolean {
  const [firstCall] = calls;
  const first = firstCall === undefined ? -1 : update.value.indexOf(firstCall);
  return update.value
    .slice(0, first)
    .some((item) => item.k === 'read' && item.name === update.target);
}

function staleInside(update: UpdateFact, calls: ValueItem[]): boolean {
  if (calls.length === 0) {
    return false;
  }
  return update.operator !== '=' || (!update.branching && readsTargetBefore(update, calls));
}

const NO_SOURCE: Source = Object.freeze({ reads: [], call: undefined });

function isLocalRead(item: ValueItem, update: UpdateFact): boolean {
  return item.k === 'read' && !item.viaThis && (update.properties ?? []).includes(item.name);
}

function isSharedRead(item: ValueItem, update: UpdateFact): boolean {
  return item.viaThis || !update.locals.includes(item.name);
}

function suspendCalls(
  value: ValueItem[],
  { update, site }: { update: UpdateFact; site: SuspensionSite },
): ValueItem[] {
  return value.filter((item) => suspendsAt(item, update, site));
}

function suspendAll(state: State, call: string): void {
  for (const [name, entry] of state.saved) {
    state.saved.set(name, { ...entry, call: entry.call ?? call });
  }
}

function readSource(
  state: State,
  item: ValueItem,
  { first, later }: { first: string | undefined; later: string | undefined },
): Source {
  if (item.k !== 'read') {
    return NO_SOURCE;
  }
  if (isLocalRead(item, state.update)) {
    const entry = state.saved.get(item.name);
    return entry === undefined ? NO_SOURCE : { reads: [...entry.reads], call: entry.call ?? first };
  }
  if (!isSharedRead(item, state.update)) {
    return NO_SOURCE;
  }
  return { reads: [item.name], call: later };
}

function sourcesOf(state: State, value: ValueItem[], calls: ValueItem[]): Saved {
  const first = calls[0]?.name;
  const parts = value.map((item, index) => {
    const later = calls.find((found) => value.indexOf(found) > index)?.name;
    return readSource(state, item, { first, later });
  });
  return {
    reads: new Set(parts.flatMap(({ reads }) => reads)),
    call: parts.find(({ call }) => call !== undefined)?.call,
    underLock: state.locked,
  };
}

function extendsPrevious(step: WorkStep, previous: Saved | undefined): previous is Saved {
  return step.assign !== undefined && step.operator !== '=' && previous !== undefined;
}

function accumulated(sources: Saved, previous: Saved, fallback: string | undefined): Saved {
  return {
    reads: new Set([...sources.reads, ...previous.reads]),
    call: sources.call ?? previous.call ?? fallback,
    underLock: sources.underLock,
  };
}

function saveStep(
  state: State,
  step: WorkStep,
  {
    sources,
    previous,
    fallback,
  }: { sources: Saved; previous: Saved | undefined; fallback: string | undefined },
): void {
  const name = step.local ?? step.assign;
  if (name !== undefined) {
    const saved = extendsPrevious(step, previous)
      ? accumulated(sources, previous, fallback)
      : sources;
    state.saved.set(name, saved);
  }
}

function applyStep(state: State, step: UpdateStep): void {
  if (step.lock !== undefined) {
    suspendAll(state, step.lock);
    state.locked = true;
    return;
  }
  const calls = suspendCalls(step.value, state);
  const sources = sourcesOf(state, step.value, calls);
  const previous = step.assign === undefined ? undefined : state.saved.get(step.assign);
  const [firstCall] = calls;
  if (firstCall !== undefined) {
    suspendAll(state, firstCall.name);
  }
  for (const name of step.writes) {
    state.saved.delete(name);
  }
  saveStep(state, step, { sources, previous, fallback: calls[0]?.name });
}

function savedStaleCall(
  update: UpdateFact,
  site: SuspensionSite,
  held: boolean,
): string | undefined {
  const state: State = { update, site, saved: new Map(), locked: false };
  for (const step of update.steps ?? []) {
    applyStep(state, step);
  }
  const calls = suspendCalls(update.value, state);
  return update.value
    .filter((item) => isLocalRead(item, update))
    .flatMap((item) => {
      const entry = state.saved.get(item.name);
      return entry?.reads.has(update.target) === true && !(held && entry.underLock) ? [entry] : [];
    })
    .map((entry) => entry.call ?? calls[0]?.name)
    .find((call) => call !== undefined);
}

function staleCall(update: UpdateFact, site: SuspensionSite, held: boolean): string | undefined {
  const calls = suspendCalls(update.value, { update, site });
  if (!held && staleInside(update, calls)) {
    return calls[0]?.name;
  }
  return savedStaleCall(update, site, held);
}

export function suspendedUpdateFindings(
  files: KotlinFile[],
  { finding, declaredIn }: { finding: FindingFactory; declaredIn: KotlinFile[] },
): ReviewFinding[] {
  const view = viewOf(declaredIn);
  return files.flatMap((file) =>
    (file.updates ?? []).flatMap((update) => {
      const { klass, method, lambdas } = enclosing(update);
      const site: SuspensionSite = { file, view, klass };
      if (!isSharedVariable(update, site)) {
        return [];
      }
      const call = staleCall(update, site, lockHeld(lambdas, update, site));
      if (call === undefined) {
        return [];
      }
      const owner =
        memberKind(update, site) === UNKNOWN || klass === undefined ? '' : `${klass.qualified}.`;
      return [
        finding({
          rule: SUSPENDED_UPDATE_RULE,
          file: file.file,
          line: update.line,
          symbol: `${owner}${update.target} in ${method ?? '<init>'}`,
          message: message(call, update.target),
        }),
      ];
    }),
  );
}
