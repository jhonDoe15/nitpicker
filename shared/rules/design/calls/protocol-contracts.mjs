import { DESIGN_RULE_IDS } from '../../../project-rules/design/design-rules.mjs';
import { quoted } from '../design-finding.mjs';
import { displayName } from '../design-index.mjs';
import { lineage, receiverValueCalls } from './receiver-calls.mjs';

const RULE = DESIGN_RULE_IDS.protocolContract;

function contractOf(type, contracts) {
  return contracts.find((contract) => contract.type === type.name || contract.type === type.id);
}

function governing(entry, contracts, index) {
  const types = entry.calls.flatMap(({ owner }) => lineage(index, owner));
  const subject = types.find((type) => contractOf(type, contracts) !== undefined);
  return subject === undefined ? undefined : { subject, contract: contractOf(subject, contracts) };
}

function namedIn(names) {
  return ({ member }) => names.includes(member.name);
}

const FIELD_RECEIVER = /^(?:this|self)\./u;

function handsOver(entry, { caller, subject, index }) {
  if (FIELD_RECEIVER.test(entry.receiver)) {
    return true;
  }
  const returned = caller.returns === undefined ? undefined : index.type(caller.returns);
  return returned !== undefined && lineage(index, returned).includes(subject);
}

function exclusive(first, second) {
  const arms = new Map((second.branch ?? []).map((marker) => marker.split(':')));
  return (first.branch ?? []).some((marker) => {
    const [conditional, arm] = marker.split(':');
    return arms.has(conditional) && arms.get(conditional) !== arm;
  });
}

function violations(entry, { contract, ...scope }) {
  const opens = entry.calls.filter(namedIn(contract.open));
  if (opens.length === 0) {
    return [];
  }
  const closed =
    handsOver(entry, scope) ||
    entry.calls.some((call) => namedIn(contract.close)(call) && call.cleanup === true);
  const firstOpen = entry.calls.indexOf(opens[0]);
  const early = entry.calls
    .slice(0, firstOpen)
    .filter(namedIn(contract.steps ?? []))
    .filter((call) => !exclusive(call, opens[0]));
  return [
    ...(closed ? [] : [{ kind: 'unclosed', call: opens[0] }]),
    ...early.map((call) => ({ kind: 'early', call, open: opens[0] })),
  ];
}

function violationMessage({ kind, call, open }, { entry, contract, caller, index, subject }) {
  const where = `${displayName(caller, index)} calls \`${entry.receiver}.${call.member.name}\``;
  if (kind === 'unclosed') {
    return [
      `${where} but closes ${subject.name} with ${quoted(contract.close)} on no exit path that always runs.`,
      `The \`protocols\` contract for ${subject.name} needs the close in a finally block`,
      '(or with, use, try-with-resources, using), or one operation that owns both steps.',
    ].join(' ');
  }
  const required = `which the \`protocols\` contract for ${subject.name} requires first`;
  return `${where} before \`${open.member.name}\`, ${required}. Call \`${open.member.name}\` before it.`;
}

export function protocolContractFindings(index, finding, contracts) {
  if (contracts.length === 0) {
    return [];
  }
  return index.callables.flatMap((caller) =>
    receiverValueCalls(caller, index).flatMap((entry) => {
      const governed = governing(entry, contracts, index);
      if (governed === undefined) {
        return [];
      }
      const scope = { ...governed, caller, index };
      return violations(entry, scope).flatMap((violation) =>
        finding({
          rule: RULE,
          path: caller.file,
          identity: `${caller.id}|${entry.receiver}|${violation.kind}:${violation.call.member.name}`,
          symbol: displayName(caller, index),
          line: violation.call.line,
          message: violationMessage(violation, { entry, ...scope }),
        }),
      );
    }),
  );
}
