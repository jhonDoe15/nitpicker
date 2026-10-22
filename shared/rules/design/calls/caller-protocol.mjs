import { DESIGN_RULE_IDS } from '../../../project-rules/design/design-rules.mjs';
import { listSites, siteText } from '../design-index.mjs';
import { receiverCalls } from './receiver-calls.mjs';

const RULE = DESIGN_RULE_IDS.callerProtocol;
const MIN_STEPS = 3;
const MAX_STEPS = 8;
const MIN_CALLERS = 3;
const MIN_MODULES = 2;
const PROTOCOL_KINDS = new Set(['class', 'interface']);

function stepsOf({ owner, calls }) {
  if (calls.some(({ member }) => member.returns === owner.id)) {
    return [];
  }
  return [...new Set(calls.map(({ member }) => member.name))].slice(0, MAX_STEPS);
}

function subsequences(steps) {
  const found = [[]];
  for (const step of steps) {
    found.push(...found.map((sequence) => [...sequence, step]));
  }
  return found.filter((sequence) => sequence.length >= MIN_STEPS);
}

function isProtocolOwner(entry, callable, index) {
  return (
    PROTOCOL_KINDS.has(entry.owner.kind) &&
    entry.owner.file !== callable.file &&
    !index.isPublished(entry.owner)
  );
}

function callerSequences(callable, index) {
  return receiverCalls(callable, index)
    .filter((entry) => isProtocolOwner(entry, callable, index))
    .flatMap((entry) =>
      subsequences(stepsOf(entry)).map((sequence) => ({ owner: entry.owner, sequence, callable })),
    );
}

function sequenceCallers(index) {
  const callers = new Map();
  for (const { owner, sequence, callable } of index.callables.flatMap((item) =>
    callerSequences(item, index),
  )) {
    const key = `${owner.id}\0${sequence.join('\0')}`;
    const known = callers.get(key) ?? { owner, sequence, callers: new Map() };
    known.callers.set(callable.id, callable);
    callers.set(key, known);
  }
  return [...callers.values()];
}

function isSubsequence(shorter, longer) {
  const end = shorter.reduce((from, step) => {
    const at = from === -1 ? -1 : longer.indexOf(step, from);
    return at === -1 ? -1 : at + 1;
  }, 0);
  return end !== -1;
}

function repeatedProtocols(index) {
  const candidates = sequenceCallers(index)
    .filter(({ callers }) => callers.size >= MIN_CALLERS)
    .filter(
      ({ callers }) => new Set([...callers.values()].map(({ file }) => file)).size >= MIN_MODULES,
    )
    .toSorted(
      (left, right) =>
        right.sequence.length - left.sequence.length || right.callers.size - left.callers.size,
    );
  const accepted = [];
  for (const candidate of candidates) {
    const covered = accepted.some(
      ({ owner, sequence }) =>
        owner.id === candidate.owner.id && isSubsequence(candidate.sequence, sequence),
    );
    if (!covered) {
      accepted.push(candidate);
    }
  }
  return accepted;
}

function protocolMessage({ owner, sequence }, sites, index) {
  const listed = listSites(sites.map((callable) => siteText(callable, index)));
  const repeat = `${String(sites.length)} callers repeat the same steps on ${owner.name}`;
  const fix = `Give ${owner.name} one operation that does these steps, so callers cannot get the order`;
  return `${repeat}: ${sequence.join(' -> ')} (${listed}). ${fix} or the cleanup wrong.`;
}

export function repeatedProtocolFindings(index, finding) {
  return repeatedProtocols(index).flatMap((protocol) => {
    const sites = [...protocol.callers.values()].toSorted(
      (left, right) => left.file.localeCompare(right.file) || left.line - right.line,
    );
    const [first] = sites;
    return finding({
      rule: RULE,
      path: first.file,
      identity: `${protocol.owner.id}|${protocol.sequence.join('>')}`,
      line: first.line,
      message: protocolMessage(protocol, sites, index),
    });
  });
}
