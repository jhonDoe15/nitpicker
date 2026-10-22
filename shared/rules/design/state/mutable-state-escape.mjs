import { DESIGN_RULE_IDS } from '../../../project-rules/design-rules.mjs';
import { displayName } from '../design-index.mjs';

const RULE = DESIGN_RULE_IDS.mutableStateEscape;

function escapedField(member, index) {
  if (member === undefined || !member.exported || member.returnsField === undefined) {
    return undefined;
  }
  const owner = member.owner === undefined ? undefined : index.type(member.owner);
  const field = (owner?.fields ?? []).find(
    ({ name, mutable, private: hidden }) =>
      name === member.returnsField && mutable === true && hidden === true,
  );
  return field === undefined ? undefined : { owner, field };
}

function escapeFinding({ caller, call, member, escaped }, { index, finding }) {
  const surface = displayName(member, index);
  const operation = call.mutation === 'assign' ? 'an assignment' : `\`${call.mutation}\``;
  return finding({
    rule: RULE,
    path: caller.file,
    identity: `${caller.id}>${member.id}:${call.mutation}`,
    symbol: displayName(caller, index),
    line: call.line,
    message: `${displayName(caller, index)} changes the private \`${escaped.field.name}\` of ${escaped.owner.name} through the value \`${surface}\` returns (${operation}), so ${escaped.owner.name} no longer controls its own state. Return a copy or a read-only view from \`${surface}\`, or add an operation to ${escaped.owner.name} that makes this change.`,
  });
}

export function mutableStateEscapeFindings(index, finding) {
  const findings = [];
  for (const caller of index.callables) {
    for (const call of (caller.calls ?? []).filter(({ mutation }) => mutation !== undefined)) {
      const member = index.callable(call.target);
      const escaped = escapedField(member, index);
      if (escaped !== undefined && escaped.owner.file !== caller.file) {
        findings.push(...escapeFinding({ caller, call, member, escaped }, { index, finding }));
      }
    }
  }
  return findings;
}
