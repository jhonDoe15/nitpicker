import { DESIGN_RULE_IDS } from '../../../project-rules/design/design-rules.mts';
import { quoted } from '../design-finding.mts';
import { displayName } from '../design-index.mts';
import { lineage, receiverValueCalls } from './receiver-calls.mts';
import type { Finding } from '../../../values/findings.mts';
import type {
  DesignCall,
  DesignCallable,
  DesignCallEntry,
  DesignFinding,
  DesignIndex,
  DesignType,
  ProtocolContract,
} from '../typed/design-types.mts';

type Governed = { readonly subject: DesignType; readonly contract: ProtocolContract };
type Scope = {
  readonly subject: DesignType;
  readonly caller: DesignCallable;
  readonly index: DesignIndex;
};
type EntryCall = DesignCallEntry['calls'][number];
type Violation =
  | { readonly kind: 'unclosed'; readonly call: EntryCall }
  | { readonly kind: 'early'; readonly call: EntryCall; readonly open: EntryCall };

const RULE = DESIGN_RULE_IDS.protocolContract;

function contractOf(
  type: DesignType,
  contracts: readonly ProtocolContract[],
): ProtocolContract | undefined {
  return contracts.find((contract) => contract.type === type.name || contract.type === type.id);
}

function governing(
  entry: DesignCallEntry,
  contracts: readonly ProtocolContract[],
  index: DesignIndex,
): Governed | undefined {
  const types = entry.calls.flatMap(({ owner }) => lineage(index, owner));
  for (const subject of types) {
    const contract = contractOf(subject, contracts);
    if (contract !== undefined) {
      return { subject, contract };
    }
  }
  return undefined;
}

function namedIn(names: readonly string[]): (call: EntryCall) => boolean {
  return ({ member }) => names.includes(member.name);
}

const FIELD_RECEIVER = /^(?:this|self)\./u;

function handsOver(entry: DesignCallEntry, { caller, subject, index }: Scope): boolean {
  if (FIELD_RECEIVER.test(entry.receiver)) {
    return true;
  }
  const returned = caller.returns === undefined ? undefined : index.type(caller.returns);
  return returned !== undefined && lineage(index, returned).includes(subject);
}

function markerOf(marker: string): [string, string] {
  const [conditional = '', ...rest] = marker.split(':');
  return [conditional, rest.join(':')];
}

function exclusive(first: DesignCall, second: DesignCall): boolean {
  const arms = new Map((second.branch ?? []).map(markerOf));
  return (first.branch ?? []).some((marker) => {
    const [conditional, arm] = markerOf(marker);
    return arms.has(conditional) && arms.get(conditional) !== arm;
  });
}

function violations(entry: DesignCallEntry, { contract, ...scope }: Governed & Scope): Violation[] {
  const opens = entry.calls.filter(namedIn(contract.open));
  const [opened] = opens;
  if (opened === undefined) {
    return [];
  }
  const closed =
    handsOver(entry, scope) ||
    entry.calls.some((call) => namedIn(contract.close)(call) && call.cleanup === true);
  const firstOpen = entry.calls.indexOf(opened);
  const early = entry.calls
    .slice(0, firstOpen)
    .filter(namedIn(contract.steps ?? []))
    .filter((call) => !exclusive(call, opened));
  return [
    ...(closed ? [] : [{ kind: 'unclosed' as const, call: opened }]),
    ...early.map((call) => ({ kind: 'early' as const, call, open: opened })),
  ];
}

function violationMessage(
  violation: Violation,
  {
    entry,
    contract,
    caller,
    index,
    subject,
  }: Governed & Scope & { readonly entry: DesignCallEntry },
): string {
  const { call } = violation;
  const where = `${displayName(caller, index)} calls \`${entry.receiver}.${call.member.name}\``;
  if (violation.kind === 'unclosed') {
    return [
      `${where} but closes ${subject.name} with ${quoted(contract.close)} on no exit path that always runs.`,
      `The \`protocols\` contract for ${subject.name} needs the close in a finally block`,
      '(or with, use, try-with-resources, using), or one operation that owns both steps.',
    ].join(' ');
  }
  const required = `which the \`protocols\` contract for ${subject.name} requires first`;
  const { open } = violation;
  return `${where} before \`${open.member.name}\`, ${required}. Call \`${open.member.name}\` before it.`;
}

export function protocolContractFindings(
  index: DesignIndex,
  finding: DesignFinding,
  contracts: readonly ProtocolContract[],
): Finding[] {
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
