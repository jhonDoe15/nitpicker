import { DESIGN_RULE_IDS } from '../../../project-rules/design/design-rules.mjs';
import { quoted } from '../design-finding.mjs';
import { displayName, listSites } from '../design-index.mjs';

const RULE = DESIGN_RULE_IDS.contextThreading;
const MIN_FIELDS = 5;
const MIN_PASSES = 2;
const MIN_READ_LIMIT = 2;
const READ_SHARE = 3;
const CONTEXT_KINDS = new Set(['class', 'data', 'interface']);

function useOf(callable, position) {
  return (callable.paramUses ?? []).find(({ param }) => param === position);
}

function contextType(callable, position, index) {
  const type = index.type(callable.params?.[position]?.type);
  return type !== undefined &&
    CONTEXT_KINDS.has(type.kind) &&
    (type.fields ?? []).length >= MIN_FIELDS
    ? type
    : undefined;
}

function nextHops(use, type, index) {
  const hops = use.forwards.map(({ target, position }) => ({
    callable: index.callable(target),
    position,
  }));
  return hops.every(({ callable, position }) => callable?.params?.[position]?.type === type.id)
    ? hops
    : undefined;
}

function stepThread(step, { type, index, thread }) {
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
  thread.passes.push(...hops.map(({ callable }) => callable));
  return hops;
}

function threadOf(start, type, index) {
  const thread = { fields: new Set(), passes: [], seen: new Set(), complete: true };
  const pending = [start];
  for (const step of pending) {
    pending.push(...visitStep(step, { type, index, thread }));
  }
  return thread.complete ? { fields: [...thread.fields].sort(), passes: thread.passes } : undefined;
}

function visitStep(step, { type, index, thread }) {
  const key = `${step.callable.id}#${String(step.position)}`;
  if (!thread.complete || thread.seen.has(key)) {
    return [];
  }
  thread.seen.add(key);
  const hops = stepThread(step, { type, index, thread });
  thread.complete = hops !== undefined;
  return hops ?? [];
}

function forwardedInto(index) {
  return new Set(
    index.callables.flatMap((callable) =>
      (callable.paramUses ?? []).flatMap(({ forwards }) =>
        forwards.map(({ target, position }) => `${target}#${String(position)}`),
      ),
    ),
  );
}

function isNarrow(thread, type, start) {
  const limit = Math.max(MIN_READ_LIMIT, Math.floor(type.fields.length / READ_SHARE));
  const passes = [...new Map(thread.passes.map((callable) => [callable.id, callable])).values()];
  return (
    thread.fields.length > 0 &&
    thread.fields.length <= limit &&
    passes.length >= MIN_PASSES &&
    passes.some(({ file }) => file !== start.file)
  );
}

function threadMessage({ start, position, type, thread }, index) {
  const parameter = start.params[position].name;
  const passes = [...new Set(thread.passes.map((callable) => displayName(callable, index)))];
  const whole = `${displayName(start, index)} takes the whole ${type.name} (${String(type.fields.length)} fields)`;
  const passed = `as \`${parameter}\` and passes it on through ${listSites(passes)}`;
  const fix = `Pass those values, or a small type with just them, so callers need not build a whole ${type.name}.`;
  return `${whole} ${passed}, which together read only ${quoted(thread.fields)}. ${fix}`;
}

function threadFinding(site, { index, finding }) {
  const { start, position } = site;
  return finding({
    rule: RULE,
    path: start.file,
    identity: `${start.id}#${start.params[position].name}`,
    symbol: displayName(start, index),
    line: start.line,
    message: threadMessage(site, index),
  });
}

function threadSites(start, { forwarded, index }) {
  return (start.params ?? []).flatMap((_, position) => {
    const type = contextType(start, position, index);
    const isHead =
      type !== undefined &&
      !forwarded.has(`${start.id}#${String(position)}`) &&
      !index.isPublished(start);
    const thread = isHead ? threadOf({ callable: start, position }, type, index) : undefined;
    return thread !== undefined && isNarrow(thread, type, start)
      ? [{ start, position, type, thread }]
      : [];
  });
}

export function contextThreadingFindings(index, finding) {
  const forwarded = forwardedInto(index);
  return index.callables
    .filter(({ entry }) => entry !== true)
    .flatMap((start) => threadSites(start, { forwarded, index }))
    .flatMap((site) => threadFinding(site, { index, finding }));
}
