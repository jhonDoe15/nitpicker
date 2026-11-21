import { DESIGN_RULE_IDS } from '../../../project-rules/design/design-rules.mts';
import { quoted } from '../design-finding.mts';
import { displayName, listSites } from '../design-index.mts';
import { byText } from '../../../text-order/by-text.mts';
import { appendAll } from '../../../lists/lists.mts';
import type { Finding } from '../../../values/findings.mts';
import type {
  DesignCallable,
  DesignFinding,
  DesignIndex,
  DesignParamUse,
  DesignType,
} from '../typed/design-types.mts';

type Step = { readonly callable: DesignCallable; readonly position: number };
type Thread = {
  readonly fields: Set<string>;
  readonly passes: DesignCallable[];
  readonly seen: Set<string>;
  complete: boolean;
};
type ThreadResult = { readonly fields: string[]; readonly passes: DesignCallable[] };
type ThreadSite = {
  readonly start: DesignCallable;
  readonly position: number;
  readonly type: DesignType;
  readonly thread: ThreadResult;
};
type ThreadScope = {
  readonly type: DesignType;
  readonly index: DesignIndex;
  readonly thread: Thread;
};

const RULE = DESIGN_RULE_IDS.contextThreading;
const MIN_FIELDS = 5;
const MIN_PASSES = 2;
const MIN_READ_LIMIT = 2;
const READ_SHARE = 3;
const CONTEXT_KINDS = new Set(['class', 'data', 'interface']);

function useOf(callable: DesignCallable, position: number): DesignParamUse | undefined {
  return (callable.paramUses ?? []).find(({ param }) => param === position);
}

function contextType(
  callable: DesignCallable,
  position: number,
  index: DesignIndex,
): DesignType | undefined {
  const type = index.type(callable.params?.[position]?.type);
  return type !== undefined &&
    CONTEXT_KINDS.has(type.kind) &&
    (type.fields ?? []).length >= MIN_FIELDS
    ? type
    : undefined;
}

function nextHops(use: DesignParamUse, type: DesignType, index: DesignIndex): Step[] | undefined {
  const hops = use.forwards.map(({ target, position }) => ({
    callable: index.callable(target),
    position,
  }));
  if (!hops.every(({ callable, position }) => callable?.params?.[position]?.type === type.id)) {
    return undefined;
  }
  return hops.flatMap(({ callable, position }) =>
    callable === undefined ? [] : [{ callable, position }],
  );
}

function stepThread(step: Step, { type, index, thread }: ThreadScope): Step[] | undefined {
  const use = useOf(step.callable, step.position);
  if (use === undefined) {
    return [];
  }
  const hops = use.opaque === true ? undefined : nextHops(use, type, index);
  if (hops === undefined) {
    return undefined;
  }
  for (const field of use.fields) {
    thread.fields.add(field);
  }
  appendAll(
    thread.passes,
    hops.map(({ callable }) => callable),
  );
  return hops;
}

function threadOf(start: Step, type: DesignType, index: DesignIndex): ThreadResult | undefined {
  const thread: Thread = { fields: new Set(), passes: [], seen: new Set(), complete: true };
  const pending: Step[] = [start];
  for (const step of pending) {
    appendAll(pending, visitStep(step, { type, index, thread }));
  }
  return thread.complete
    ? { fields: [...thread.fields].sort(byText), passes: thread.passes }
    : undefined;
}

function visitStep(step: Step, { type, index, thread }: ThreadScope): Step[] {
  const key = `${step.callable.id}#${String(step.position)}`;
  if (!thread.complete || thread.seen.has(key)) {
    return [];
  }
  thread.seen.add(key);
  const hops = stepThread(step, { type, index, thread });
  thread.complete = hops !== undefined;
  return hops ?? [];
}

function forwardedInto(index: DesignIndex): Set<string> {
  return new Set(
    index.callables.flatMap((callable) =>
      (callable.paramUses ?? []).flatMap(({ forwards }) =>
        forwards.map(({ target, position }) => `${target}#${String(position)}`),
      ),
    ),
  );
}

function isNarrow(thread: ThreadResult, type: DesignType, start: DesignCallable): boolean {
  const limit = Math.max(MIN_READ_LIMIT, Math.floor((type.fields ?? []).length / READ_SHARE));
  const passes = [...new Map(thread.passes.map((callable) => [callable.id, callable])).values()];
  return (
    thread.fields.length > 0 &&
    thread.fields.length <= limit &&
    passes.length >= MIN_PASSES &&
    passes.some(({ file }) => file !== start.file)
  );
}

function threadMessage({ start, position, type, thread }: ThreadSite, index: DesignIndex): string {
  const parameter = String(start.params?.[position]?.name);
  const passes = [...new Set(thread.passes.map((callable) => displayName(callable, index)))];
  const whole = `${displayName(start, index)} takes the whole ${type.name} (${String((type.fields ?? []).length)} fields)`;
  const passed = `as \`${parameter}\` and passes it on through ${listSites(passes)}`;
  const fix = `Pass those values, or a small type with just them, so callers need not build a whole ${type.name}.`;
  return `${whole} ${passed}, which together read only ${quoted(thread.fields)}. ${fix}`;
}

function threadFinding(
  site: ThreadSite,
  { index, finding }: { readonly index: DesignIndex; readonly finding: DesignFinding },
): Finding[] {
  const { start, position } = site;
  return finding({
    rule: RULE,
    path: start.file,
    identity: `${start.id}#${String(start.params?.[position]?.name)}`,
    symbol: displayName(start, index),
    line: start.line,
    message: threadMessage(site, index),
  });
}

function threadSites(
  start: DesignCallable,
  { forwarded, index }: { readonly forwarded: ReadonlySet<string>; readonly index: DesignIndex },
): ThreadSite[] {
  return (start.params ?? []).flatMap((_, position) => {
    const type = contextType(start, position, index);
    if (type === undefined) {
      return [];
    }
    const isForwarded = forwarded.has(`${start.id}#${String(position)}`);
    const isHead = !(isForwarded || index.isPublished(start));
    const thread = isHead ? threadOf({ callable: start, position }, type, index) : undefined;
    return thread !== undefined && isNarrow(thread, type, start)
      ? [{ start, position, type, thread }]
      : [];
  });
}

export function contextThreadingFindings(index: DesignIndex, finding: DesignFinding): Finding[] {
  const forwarded = forwardedInto(index);
  return index.callables
    .filter(({ entry }) => entry !== true)
    .flatMap((start) => threadSites(start, { forwarded, index }))
    .flatMap((site) => threadFinding(site, { index, finding }));
}
