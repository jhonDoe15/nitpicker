import { DESIGN_RULE_IDS } from '../../../project-rules/design-rules.mjs';
import { quoted } from '../design-finding.mjs';
import { displayName, listSites } from '../design-index.mjs';

const RULE = DESIGN_RULE_IDS.contextThreading;
const MIN_FIELDS = 5;
const MIN_PASSES = 2;
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
  const hops = [];
  for (const { target, position } of use.forwards) {
    const next = index.callable(target);
    if (next === undefined || next.params?.[position]?.type !== type.id) {
      return undefined;
    }
    hops.push({ callable: next, position });
  }
  return hops;
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
  const thread = { fields: new Set(), passes: [] };
  const seen = new Set();
  const pending = [start];
  for (const step of pending) {
    const key = `${step.callable.id}#${String(step.position)}`;
    const hops = seen.has(key) ? [] : stepThread(step, { type, index, thread });
    if (hops === undefined) {
      return undefined;
    }
    seen.add(key);
    pending.push(...hops);
  }
  return { fields: [...thread.fields].sort(), passes: thread.passes };
}

function forwardedInto(index) {
  const targets = new Set();
  for (const callable of index.callables) {
    for (const use of callable.paramUses ?? []) {
      for (const { target, position } of use.forwards) {
        targets.add(`${target}#${String(position)}`);
      }
    }
  }
  return targets;
}

function isNarrow(thread, type, start) {
  const limit = Math.max(2, Math.floor(type.fields.length / 3));
  const passes = [...new Map(thread.passes.map((callable) => [callable.id, callable])).values()];
  return (
    thread.fields.length > 0 &&
    thread.fields.length <= limit &&
    passes.length >= MIN_PASSES &&
    passes.some(({ file }) => file !== start.file)
  );
}

function threadFinding({ start, position, type, thread }, { index, finding }) {
  const parameter = start.params[position].name;
  const passes = [...new Set(thread.passes.map((callable) => displayName(callable, index)))];
  return finding({
    rule: RULE,
    path: start.file,
    identity: `${start.id}#${parameter}`,
    symbol: displayName(start, index),
    line: start.line,
    message: `${displayName(start, index)} takes the whole ${type.name} (${String(type.fields.length)} fields) as \`${parameter}\` and passes it on through ${listSites(passes)}, which together read only ${quoted(thread.fields)}. Pass those values, or a small type with just them, so callers need not build a whole ${type.name}.`,
  });
}

export function contextThreadingFindings(index, finding) {
  const forwarded = forwardedInto(index);
  const findings = [];
  for (const start of index.callables.filter(({ entry }) => entry !== true)) {
    for (const [position] of (start.params ?? []).entries()) {
      const type = contextType(start, position, index);
      const isHead =
        type !== undefined &&
        !forwarded.has(`${start.id}#${String(position)}`) &&
        !index.isPublished(start);
      const thread = isHead ? threadOf({ callable: start, position }, type, index) : undefined;
      if (thread !== undefined && isNarrow(thread, type, start)) {
        findings.push(...threadFinding({ start, position, type, thread }, { index, finding }));
      }
    }
  }
  return findings;
}
