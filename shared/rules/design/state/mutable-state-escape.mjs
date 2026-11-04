import { DESIGN_RULE_IDS } from '../../../project-rules/design/design-rules.mjs';
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

function escapeMessage({ caller, call, member, escaped }, index) {
  const surface = displayName(member, index);
  const owner = escaped.owner.name;
  const operation = call.mutation === 'assign' ? 'an assignment' : `\`${call.mutation}\``;
  const change = `${displayName(caller, index)} changes the private \`${escaped.field.name}\` of ${owner}`;
  const through = `through the value \`${surface}\` returns (${operation})`;
  const fix = `Return a copy or a read-only view from \`${surface}\`, or add an operation to ${owner}`;
  return `${change} ${through}, so ${owner} no longer controls its own state. ${fix} that makes this change.`;
}

function escapeFinding(site, { index, finding }) {
  const { caller, call, member } = site;
  return finding({
    rule: RULE,
    path: caller.file,
    identity: `${caller.id}>${member.id}:${call.mutation}`,
    symbol: displayName(caller, index),
    line: call.line,
    message: escapeMessage(site, index),
  });
}

function callerEscapes(caller, index) {
  return (caller.calls ?? [])
    .filter(({ mutation }) => mutation !== undefined)
    .map((call) => {
      const member = index.callable(call.target);
      return { caller, call, member, escaped: escapedField(member, index) };
    })
    .filter(({ escaped }) => escaped !== undefined && escaped.owner.file !== caller.file);
}

export function mutableStateEscapeFindings(index, finding) {
  return index.callables
    .flatMap((caller) => callerEscapes(caller, index))
    .flatMap((site) => escapeFinding(site, { index, finding }));
}
