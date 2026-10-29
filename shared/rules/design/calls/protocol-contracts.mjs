import { DESIGN_RULE_IDS } from '../../../project-rules/design/design-rules.mjs';
import { quoted } from '../design-finding.mjs';
import { displayName } from '../design-index.mjs';
import { receiverCalls } from './receiver-calls.mjs';

const RULE = DESIGN_RULE_IDS.protocolContract;

function contractFor(owner, contracts) {
  return contracts.find(({ type }) => type === owner.name || type === owner.id);
}

function namedIn(names) {
  return ({ member }) => names.includes(member.name);
}

const FIELD_RECEIVER = /^(?:this|self)\./u;

function handsOver(entry, caller) {
  return FIELD_RECEIVER.test(entry.receiver) || caller.returns === entry.owner.id;
}

function violations(entry, contract, caller) {
  const opens = entry.calls.filter(namedIn(contract.open));
  if (opens.length === 0) {
    return [];
  }
  const closed =
    handsOver(entry, caller) ||
    entry.calls.some((call) => namedIn(contract.close)(call) && call.cleanup === true);
  const firstOpen = entry.calls.indexOf(opens[0]);
  const early = entry.calls.slice(0, firstOpen).filter(namedIn(contract.steps ?? []));
  return [
    ...(closed ? [] : [{ kind: 'unclosed', call: opens[0] }]),
    ...early.map((call) => ({ kind: 'early', call, open: opens[0] })),
  ];
}

function violationMessage({ kind, call, open }, { entry, contract, caller, index }) {
  const where = `${displayName(caller, index)} calls \`${entry.receiver}.${call.member.name}\``;
  if (kind === 'unclosed') {
    return [
      `${where} but closes ${entry.owner.name} with ${quoted(contract.close)} on no exit path that always runs.`,
      `The \`protocols\` contract for ${entry.owner.name} needs the close in a finally block`,
      '(or with, use, try-with-resources, using), or one operation that owns both steps.',
    ].join(' ');
  }
  const required = `which the \`protocols\` contract for ${entry.owner.name} requires first`;
  return `${where} before \`${open.member.name}\`, ${required}. Call \`${open.member.name}\` before it.`;
}

export function protocolContractFindings(index, finding, contracts) {
  if (contracts.length === 0) {
    return [];
  }
  return index.callables.flatMap((caller) =>
    receiverCalls(caller, index).flatMap((entry) => {
      const contract = contractFor(entry.owner, contracts);
      return (contract === undefined ? [] : violations(entry, contract, caller)).flatMap(
        (violation) =>
          finding({
            rule: RULE,
            path: caller.file,
            identity: `${caller.id}|${entry.receiver}|${violation.kind}:${violation.call.member.name}`,
            symbol: displayName(caller, index),
            line: violation.call.line,
            message: violationMessage(violation, { entry, contract, caller, index }),
          }),
      );
    }),
  );
}
